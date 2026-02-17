// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title EscrowVault
 * @notice Manages USDC escrow for milestone-based project payments
 * @dev UUPS Upgradeable - holds client funds in escrow and releases payments upon milestone completion
 */
contract EscrowVault is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    struct EscrowInfo {
        uint256 projectId;
        address client;
        uint256 totalAmount;
        uint256 releasedAmount;
        bool disputed;
    }

    // State variables (not immutable in upgradeable contracts)
    IERC20 public usdcToken;
    address public projectManager;
    address public disputeDAO;
    address public treasury;

    // Mapping from project ID to escrow info
    mapping(uint256 => EscrowInfo) public escrows;

    // Events
    event Deposited(
        uint256 indexed projectId,
        address indexed client,
        uint256 amount,
        uint256 timestamp
    );

    event Released(
        uint256 indexed projectId,
        address indexed developer,
        uint256 amount,
        uint256 timestamp
    );

    event FeesCollected(
        uint256 indexed projectId,
        address indexed treasury,
        uint256 feeAmount,
        uint256 timestamp
    );

    event Frozen(
        uint256 indexed projectId,
        address indexed frozenBy,
        uint256 timestamp
    );

    event Unfrozen(
        uint256 indexed projectId,
        uint256 timestamp
    );

    event DisputeResolved(
        uint256 indexed projectId,
        uint256 clientShare,
        uint256 developerShare,
        uint256 timestamp
    );

    event ProjectManagerUpdated(address indexed oldManager, address indexed newManager);
    event DisputeDAOUpdated(address indexed oldDAO, address indexed newDAO);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // Errors
    error InvalidAddress();
    error InvalidAmount();
    error EscrowAlreadyExists();
    error EscrowNotFound();
    error EscrowFrozen();
    error EscrowNotFrozen();
    error InsufficientEscrowBalance();
    error Unauthorized();

    // Modifiers
    modifier onlyProjectManager() {
        if (msg.sender != projectManager) revert Unauthorized();
        _;
    }

    modifier onlyDisputeDAO() {
        if (msg.sender != disputeDAO) revert Unauthorized();
        _;
    }

    modifier escrowExists(uint256 projectId) {
        if (escrows[projectId].client == address(0)) revert EscrowNotFound();
        _;
    }

    modifier notFrozen(uint256 projectId) {
        if (escrows[projectId].disputed) revert EscrowFrozen();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor)
     * @param _usdcToken USDC token contract address
     * @param _treasury Treasury address for platform fees
     */
    function initialize(
        address _usdcToken,
        address _treasury
    ) public initializer {
        if (_usdcToken == address(0) || _treasury == address(0)) {
            revert InvalidAddress();
        }

        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        usdcToken = IERC20(_usdcToken);
        treasury = _treasury;
    }

    /**
     * @notice Authorize upgrade to new implementation
     * @param newImplementation Address of new implementation contract
     * @dev Only owner can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice Deposit funds into escrow for a project
     * @param projectId The project ID
     * @param amount Amount of USDC to deposit
     * @dev Client must approve USDC spending before calling this
     */
    function deposit(
        uint256 projectId,
        uint256 amount
    ) external nonReentrant returns (bool) {
        if (amount == 0) revert InvalidAmount();
        if (escrows[projectId].client != address(0)) revert EscrowAlreadyExists();

        // Transfer USDC from client to contract
        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        // Create escrow record
        escrows[projectId] = EscrowInfo({
            projectId: projectId,
            client: msg.sender,
            totalAmount: amount,
            releasedAmount: 0,
            disputed: false
        });

        emit Deposited(projectId, msg.sender, amount, block.timestamp);

        return true;
    }

    /**
     * @notice Release milestone payment to developer
     * @param projectId The project ID
     * @param developer Developer address to receive payment
     * @param amount Amount of USDC to release
     * @dev Only callable by ProjectManager contract
     */
    function release(
        uint256 projectId,
        address developer,
        uint256 amount
    )
        external
        onlyProjectManager
        nonReentrant
        escrowExists(projectId)
        notFrozen(projectId)
        returns (bool)
    {
        if (developer == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        EscrowInfo storage escrow = escrows[projectId];

        // Check sufficient balance
        uint256 availableBalance = escrow.totalAmount - escrow.releasedAmount;
        if (amount > availableBalance) revert InsufficientEscrowBalance();

        // Update released amount
        escrow.releasedAmount += amount;

        // Transfer USDC to developer
        usdcToken.safeTransfer(developer, amount);

        emit Released(projectId, developer, amount, block.timestamp);

        return true;
    }

    /**
     * @notice Release platform fee to treasury
     * @param projectId The project ID
     * @param feeAmount Amount of USDC to collect as fee
     * @dev Only callable by ProjectManager contract
     */
    function releaseFee(
        uint256 projectId,
        uint256 feeAmount
    )
        external
        onlyProjectManager
        nonReentrant
        escrowExists(projectId)
        notFrozen(projectId)
        returns (bool)
    {
        if (feeAmount == 0) revert InvalidAmount();

        EscrowInfo storage escrow = escrows[projectId];

        // Check sufficient balance
        uint256 availableBalance = escrow.totalAmount - escrow.releasedAmount;
        if (feeAmount > availableBalance) revert InsufficientEscrowBalance();

        // Update released amount
        escrow.releasedAmount += feeAmount;

        // Transfer USDC to treasury
        usdcToken.safeTransfer(treasury, feeAmount);

        emit FeesCollected(projectId, treasury, feeAmount, block.timestamp);

        return true;
    }

    /**
     * @notice Freeze escrow to prevent releases during dispute
     * @param projectId The project ID
     * @dev Only callable by DisputeDAO contract
     */
    function freeze(
        uint256 projectId
    )
        external
        onlyDisputeDAO
        escrowExists(projectId)
        returns (bool)
    {
        EscrowInfo storage escrow = escrows[projectId];

        if (escrow.disputed) revert EscrowFrozen();

        escrow.disputed = true;

        emit Frozen(projectId, msg.sender, block.timestamp);

        return true;
    }

    /**
     * @notice Unfreeze escrow after dispute resolution
     * @param projectId The project ID
     * @dev Only callable by DisputeDAO contract
     */
    function unfreeze(
        uint256 projectId
    )
        external
        onlyDisputeDAO
        escrowExists(projectId)
        returns (bool)
    {
        EscrowInfo storage escrow = escrows[projectId];

        if (!escrow.disputed) revert EscrowNotFrozen();

        escrow.disputed = false;

        emit Unfrozen(projectId, block.timestamp);

        return true;
    }

    /**
     * @notice Resolve dispute and distribute remaining funds
     * @param projectId The project ID
     * @param developer Developer address
     * @param clientShare Amount to return to client
     * @param developerShare Amount to pay to developer
     * @dev Only callable by DisputeDAO contract after dispute ruling
     */
    function resolveDispute(
        uint256 projectId,
        address developer,
        uint256 clientShare,
        uint256 developerShare
    )
        external
        onlyDisputeDAO
        nonReentrant
        escrowExists(projectId)
        returns (bool)
    {
        EscrowInfo storage escrow = escrows[projectId];

        if (!escrow.disputed) revert EscrowNotFrozen();
        if (developer == address(0)) revert InvalidAddress();

        uint256 remainingBalance = escrow.totalAmount - escrow.releasedAmount;

        // Validate shares don't exceed remaining balance
        if (clientShare + developerShare > remainingBalance) {
            revert InsufficientEscrowBalance();
        }

        // Transfer client share
        if (clientShare > 0) {
            usdcToken.safeTransfer(escrow.client, clientShare);
        }

        // Transfer developer share
        if (developerShare > 0) {
            usdcToken.safeTransfer(developer, developerShare);
        }

        // Update released amount
        escrow.releasedAmount += clientShare + developerShare;

        // Unfreeze escrow
        escrow.disputed = false;

        emit DisputeResolved(projectId, clientShare, developerShare, block.timestamp);

        return true;
    }

    /**
     * @notice Get escrow information for a project
     * @param projectId The project ID
     * @return EscrowInfo struct
     */
    function getEscrowInfo(uint256 projectId)
        external
        view
        returns (EscrowInfo memory)
    {
        return escrows[projectId];
    }

    /**
     * @notice Get available balance for a project
     * @param projectId The project ID
     * @return Available USDC balance
     */
    function getAvailableBalance(uint256 projectId)
        external
        view
        escrowExists(projectId)
        returns (uint256)
    {
        EscrowInfo memory escrow = escrows[projectId];
        return escrow.totalAmount - escrow.releasedAmount;
    }

    /**
     * @notice Set ProjectManager contract address
     * @param _projectManager New ProjectManager address
     * @dev Only callable by owner
     */
    function setProjectManager(address _projectManager) external onlyOwner {
        if (_projectManager == address(0)) revert InvalidAddress();
        address oldManager = projectManager;
        projectManager = _projectManager;
        emit ProjectManagerUpdated(oldManager, _projectManager);
    }

    /**
     * @notice Set DisputeDAO contract address
     * @param _disputeDAO New DisputeDAO address
     * @dev Only callable by owner
     */
    function setDisputeDAO(address _disputeDAO) external onlyOwner {
        if (_disputeDAO == address(0)) revert InvalidAddress();
        address oldDAO = disputeDAO;
        disputeDAO = _disputeDAO;
        emit DisputeDAOUpdated(oldDAO, _disputeDAO);
    }

    /**
     * @notice Set treasury address
     * @param _treasury New treasury address
     * @dev Only callable by owner
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @notice Get the current implementation version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
