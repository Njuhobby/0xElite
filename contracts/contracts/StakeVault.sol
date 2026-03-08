// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title StakeVault
 * @notice Manages USDC stake deposits for developer membership on 0xElite platform
 * @dev UUPS Upgradeable - owner (backend) stakes on behalf of developers
 */
contract StakeVault is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    /// @notice USDC token contract (not immutable in upgradeable contracts)
    IERC20 public stakeToken;

    /// @notice Mapping of developer addresses to their staked amounts
    mapping(address => uint256) public stakes;

    /// @notice Mapping of developer addresses to stake timestamps
    mapping(address => uint256) public stakedAt;

    /// @notice Emitted when a developer stakes USDC
    /// @param developer Address of the developer who staked
    /// @param amount Amount of USDC staked (in token base units)
    event Staked(address indexed developer, uint256 amount);

    /// @notice Emitted when a developer unstakes USDC
    /// @param developer Address of the developer who unstaked
    /// @param amount Amount of USDC unstaked
    event Unstaked(address indexed developer, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // call in implementation contract's constructor, so attackers won't be able to reinitialize the contract
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor)
     * @param _stakeToken Address of USDC token contract
     */
    function initialize(address _stakeToken) public initializer {
        require(_stakeToken != address(0), "Invalid token address");

        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        stakeToken = IERC20(_stakeToken);
    }

    /**
     * @notice Authorize upgrade to new implementation
     * @param newImplementation Address of new implementation contract
     * @dev Only owner can upgrade
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    /// @notice Stake USDC on behalf of a developer (owner-only, called by backend)
    /// @param developer Address of the developer to stake for
    /// @param amount Amount of USDC to stake
    /// @dev Developer must have approved this contract for the given amount beforehand
    function stake(address developer, uint256 amount) external onlyOwner nonReentrant {
        require(developer != address(0), "Invalid developer address");
        require(amount > 0, "Amount must be positive");

        require(
            stakeToken.transferFrom(developer, address(this), amount),
            "Transfer failed"
        );

        stakes[developer] += amount;
        stakedAt[developer] = block.timestamp;

        emit Staked(developer, amount);
    }

    /// @notice Withdraw staked USDC (owner-only, used by backend unlock service)
    /// @param amount Amount to withdraw from caller's own stake
    function unstake(uint256 amount) external onlyOwner nonReentrant {
        require(stakes[msg.sender] >= amount, "Insufficient stake");

        stakes[msg.sender] -= amount;
        require(stakeToken.transfer(msg.sender, amount), "Transfer failed");

        emit Unstaked(msg.sender, amount);
    }

    /// @notice Unstake on behalf of a developer (owner-only, used by backend auto-unlock)
    /// @param developer Address of the developer to unstake for
    /// @param amount Amount of USDC to return to the developer
    function unstakeFor(address developer, uint256 amount) external onlyOwner nonReentrant {
        require(developer != address(0), "Invalid developer address");
        require(amount > 0, "Amount must be positive");
        require(stakes[developer] >= amount, "Insufficient stake");

        stakes[developer] -= amount;
        require(stakeToken.transfer(developer, amount), "Transfer failed");

        emit Unstaked(developer, amount);
    }

    /// @notice Get current stake for a developer
    /// @param developer Address to query
    /// @return Current staked amount
    function getStake(address developer) external view returns (uint256) {
        return stakes[developer];
    }

    /**
     * @notice Get the current implementation version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
