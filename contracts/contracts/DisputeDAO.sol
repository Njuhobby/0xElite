// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IEliteToken
 * @notice Interface for EliteToken voting power queries
 */
interface IEliteToken {
    function getPastVotes(address account, uint256 timepoint) external view returns (uint256);
    function getPastTotalSupply(uint256 timepoint) external view returns (uint256);
}

/**
 * @title IEscrowVault
 * @notice Interface for EscrowVault dispute operations
 */
interface IEscrowVault {
    function freeze(uint256 projectId) external returns (bool);
    function resolveDispute(
        uint256 projectId,
        address developer,
        uint256 clientShare,
        uint256 developerShare
    ) external returns (bool);
    function getAvailableBalance(uint256 projectId) external view returns (uint256);
    function escrows(uint256 projectId) external view returns (
        uint256 _projectId,
        address client,
        uint256 totalAmount,
        uint256 releasedAmount,
        bool disputed
    );
}

/**
 * @title IProjectManager
 * @notice Interface for ProjectManager project queries
 */
interface IProjectManager {
    function isProjectClient(uint256 projectId, address addr) external view returns (bool);
    function isAssignedDeveloper(uint256 projectId, address addr) external view returns (bool);
    function getProject(uint256 projectId) external view returns (
        uint256 _projectId,
        address client,
        address assignedDeveloper,
        uint8 state,
        uint256 totalBudget,
        uint256 createdAt,
        uint256 activatedAt,
        uint256 completedAt
    );
}

/**
 * @title DisputeDAO
 * @notice Manages dispute lifecycle: initiation, evidence, weighted voting, and resolution
 * @dev UUPS Upgradeable. Integrates with EscrowVault for fund freeze/distribution
 *      and EliteToken for reputation-weighted voting power.
 */
contract DisputeDAO is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // =========================================================================
    // Enums & Structs
    // =========================================================================

    enum DisputeStatus { Open, Voting, Resolved }

    struct Dispute {
        uint256 projectId;
        address client;
        address developer;
        address initiator;
        string clientEvidenceURI;
        string developerEvidenceURI;
        uint256 evidenceDeadline;
        uint256 votingDeadline;
        uint256 votingSnapshot;
        uint256 clientVoteWeight;
        uint256 developerVoteWeight;
        uint256 totalVoteWeight;
        uint256 snapshotTotalSupply;
        DisputeStatus status;
        bool resolvedByOwner;
        bool clientWon;
        uint256 arbitrationFee;
    }

    // =========================================================================
    // State Variables
    // =========================================================================

    IERC20 public usdc;
    IEliteToken public eliteToken;
    IEscrowVault public escrowVault;
    IProjectManager public projectManager;

    uint256 public disputeCount;
    uint256 public evidencePeriod;       // Default: 3 days
    uint256 public votingPeriod;         // Default: 5 days
    uint256 public arbitrationFee;       // Default: 50 USDC (50 * 10^6)
    uint256 public quorumNumerator;      // Default: 25 (representing 25%)
    address public treasury;

    mapping(uint256 => Dispute) internal disputes;
    mapping(uint256 => uint256) public projectToDispute; // projectId => disputeId (1-indexed)
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public votedForClient;

    // =========================================================================
    // Events
    // =========================================================================

    event DisputeCreated(
        uint256 indexed disputeId,
        uint256 indexed projectId,
        address indexed initiator
    );

    event EvidenceSubmitted(
        uint256 indexed disputeId,
        address indexed party,
        string evidenceURI
    );

    event VotingStarted(
        uint256 indexed disputeId,
        uint256 votingDeadline,
        uint256 votingSnapshot
    );

    event VoteCast(
        uint256 indexed disputeId,
        address indexed voter,
        bool supportClient,
        uint256 weight
    );

    event DisputeResolved(
        uint256 indexed disputeId,
        bool clientWon,
        uint256 clientShare,
        uint256 developerShare
    );

    event DisputeResolvedByOwner(
        uint256 indexed disputeId,
        bool clientWon
    );

    // =========================================================================
    // Errors
    // =========================================================================

    error NotProjectParty();
    error DisputeAlreadyExists();
    error DisputeNotFound();
    error InvalidDisputeStatus();
    error EvidencePeriodEnded();
    error EvidencePeriodNotEnded();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error AlreadyVoted();
    error NoVotingPower();
    error PartyCannotVote();
    error QuorumNotMet();
    error QuorumAlreadyMet();
    error InvalidAddress();

    // =========================================================================
    // Initialization
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param _usdc USDC token address
     * @param _eliteToken EliteToken governance token address
     * @param _escrowVault EscrowVault contract address
     * @param _projectManager ProjectManager contract address
     * @param _treasury Platform treasury address
     */
    function initialize(
        address _usdc,
        address _eliteToken,
        address _escrowVault,
        address _projectManager,
        address _treasury
    ) public initializer {
        if (_usdc == address(0) || _eliteToken == address(0) ||
            _escrowVault == address(0) || _projectManager == address(0) ||
            _treasury == address(0)) {
            revert InvalidAddress();
        }

        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        usdc = IERC20(_usdc);
        eliteToken = IEliteToken(_eliteToken);
        escrowVault = IEscrowVault(_escrowVault);
        projectManager = IProjectManager(_projectManager);
        treasury = _treasury;

        evidencePeriod = 3 days;
        votingPeriod = 5 days;
        arbitrationFee = 50 * 10 ** 6;  // 50 USDC (6 decimals)
        quorumNumerator = 25;            // 25%
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // =========================================================================
    // Phase 1: Dispute Creation
    // =========================================================================

    /**
     * @notice File a dispute on a project
     * @param projectId The on-chain project ID
     * @param evidenceURI IPFS CID of evidence document (PDF/DOCX/MD)
     * @return disputeId The newly created dispute ID
     */
    function createDispute(
        uint256 projectId,
        string calldata evidenceURI
    ) external nonReentrant returns (uint256) {
        // Verify caller is client or developer
        bool isClient = projectManager.isProjectClient(projectId, msg.sender);
        bool isDev = projectManager.isAssignedDeveloper(projectId, msg.sender);
        if (!isClient && !isDev) revert NotProjectParty();

        // Verify no active dispute on this project
        if (projectToDispute[projectId] != 0) {
            uint256 existingId = projectToDispute[projectId];
            if (disputes[existingId].status != DisputeStatus.Resolved) {
                revert DisputeAlreadyExists();
            }
        }

        // Transfer arbitration fee
        usdc.safeTransferFrom(msg.sender, address(this), arbitrationFee);

        // Freeze escrow
        escrowVault.freeze(projectId);

        // Get project parties
        (
            ,
            address client,
            address developer,
            ,
            ,
            ,
            ,
        ) = projectManager.getProject(projectId);

        // Create dispute (1-indexed: first dispute is ID 1)
        disputeCount++;
        uint256 disputeId = disputeCount;

        Dispute storage d = disputes[disputeId];
        d.projectId = projectId;
        d.client = client;
        d.developer = developer;
        d.initiator = msg.sender;
        d.evidenceDeadline = block.timestamp + evidencePeriod;
        d.status = DisputeStatus.Open;
        d.arbitrationFee = arbitrationFee;

        // Store initial evidence
        if (isClient) {
            d.clientEvidenceURI = evidenceURI;
        } else {
            d.developerEvidenceURI = evidenceURI;
        }

        projectToDispute[projectId] = disputeId;

        emit DisputeCreated(disputeId, projectId, msg.sender);

        return disputeId;
    }

    // =========================================================================
    // Phase 2: Evidence Submission
    // =========================================================================

    /**
     * @notice Submit or update evidence for a dispute
     * @param disputeId The dispute ID
     * @param evidenceURI IPFS CID of evidence document
     */
    function submitEvidence(
        uint256 disputeId,
        string calldata evidenceURI
    ) external {
        Dispute storage d = disputes[disputeId];
        if (d.client == address(0)) revert DisputeNotFound();
        if (d.status != DisputeStatus.Open) revert InvalidDisputeStatus();
        if (block.timestamp >= d.evidenceDeadline) revert EvidencePeriodEnded();

        if (msg.sender == d.client) {
            d.clientEvidenceURI = evidenceURI;
        } else if (msg.sender == d.developer) {
            d.developerEvidenceURI = evidenceURI;
        } else {
            revert NotProjectParty();
        }

        emit EvidenceSubmitted(disputeId, msg.sender, evidenceURI);
    }

    // =========================================================================
    // Phase 2→3: Start Voting
    // =========================================================================

    /**
     * @notice Transition dispute from evidence period to voting period
     * @param disputeId The dispute ID
     * @dev Anyone can call this once the evidence deadline has passed
     */
    function startVoting(uint256 disputeId) external {
        Dispute storage d = disputes[disputeId];
        if (d.client == address(0)) revert DisputeNotFound();
        if (d.status != DisputeStatus.Open) revert InvalidDisputeStatus();
        if (block.timestamp < d.evidenceDeadline) revert EvidencePeriodNotEnded();

        d.votingDeadline = block.timestamp + votingPeriod;
        // Snapshot uses timestamp - 1 to avoid ERC5805FutureLookup error
        // (current block timestamp is not yet finalized as a checkpoint)
        d.votingSnapshot = block.timestamp - 1;
        d.snapshotTotalSupply = eliteToken.getPastTotalSupply(d.votingSnapshot);
        d.status = DisputeStatus.Voting;

        emit VotingStarted(disputeId, d.votingDeadline, d.votingSnapshot);
    }

    // =========================================================================
    // Phase 3: Voting
    // =========================================================================

    /**
     * @notice Cast a weighted vote on a dispute
     * @param disputeId The dispute ID
     * @param supportClient True to vote for client, false for developer
     */
    function castVote(uint256 disputeId, bool supportClient) external {
        Dispute storage d = disputes[disputeId];
        if (d.client == address(0)) revert DisputeNotFound();
        if (d.status != DisputeStatus.Voting) revert InvalidDisputeStatus();
        if (block.timestamp >= d.votingDeadline) revert VotingPeriodEnded();
        if (hasVoted[disputeId][msg.sender]) revert AlreadyVoted();
        if (msg.sender == d.client || msg.sender == d.developer) revert PartyCannotVote();

        uint256 weight = eliteToken.getPastVotes(msg.sender, d.votingSnapshot);
        if (weight == 0) revert NoVotingPower();

        hasVoted[disputeId][msg.sender] = true;
        votedForClient[disputeId][msg.sender] = supportClient;

        if (supportClient) {
            d.clientVoteWeight += weight;
        } else {
            d.developerVoteWeight += weight;
        }
        d.totalVoteWeight += weight;

        emit VoteCast(disputeId, msg.sender, supportClient, weight);
    }

    // =========================================================================
    // Phase 4: Resolution
    // =========================================================================

    /**
     * @notice Execute dispute resolution after voting period ends (quorum met)
     * @param disputeId The dispute ID
     */
    function executeResolution(uint256 disputeId) external nonReentrant {
        Dispute storage d = disputes[disputeId];
        if (d.client == address(0)) revert DisputeNotFound();
        if (d.status != DisputeStatus.Voting) revert InvalidDisputeStatus();
        if (block.timestamp < d.votingDeadline) revert VotingPeriodNotEnded();

        // Check quorum: totalVoteWeight >= snapshotTotalSupply * quorumNumerator / 100
        uint256 quorumRequired = (d.snapshotTotalSupply * quorumNumerator) / 100;
        if (d.totalVoteWeight < quorumRequired) revert QuorumNotMet();

        // Determine winner by simple majority
        bool clientWon = d.clientVoteWeight > d.developerVoteWeight;
        _resolveDispute(disputeId, clientWon, false);
    }

    /**
     * @notice Owner resolves dispute when quorum was not met
     * @param disputeId The dispute ID
     * @param clientWon True if ruling in favor of client
     */
    function ownerResolve(uint256 disputeId, bool clientWon) external onlyOwner nonReentrant {
        Dispute storage d = disputes[disputeId];
        if (d.client == address(0)) revert DisputeNotFound();
        if (d.status != DisputeStatus.Voting) revert InvalidDisputeStatus();
        if (block.timestamp < d.votingDeadline) revert VotingPeriodNotEnded();

        // Verify quorum was NOT met
        uint256 quorumRequired = (d.snapshotTotalSupply * quorumNumerator) / 100;
        if (d.totalVoteWeight >= quorumRequired) revert QuorumAlreadyMet();

        _resolveDispute(disputeId, clientWon, true);
    }

    /**
     * @notice Internal resolution logic
     */
    function _resolveDispute(
        uint256 disputeId,
        bool clientWon,
        bool byOwner
    ) internal {
        Dispute storage d = disputes[disputeId];

        // Get remaining escrow balance
        uint256 remainingBalance = escrowVault.getAvailableBalance(d.projectId);

        uint256 clientShare;
        uint256 developerShare;

        if (clientWon) {
            clientShare = remainingBalance;
            developerShare = 0;
        } else {
            clientShare = 0;
            developerShare = remainingBalance;
        }

        // Distribute escrow funds via EscrowVault
        escrowVault.resolveDispute(
            d.projectId,
            d.developer,
            clientShare,
            developerShare
        );

        // Handle arbitration fee: refund to initiator if their side won
        bool initiatorIsClient = (d.initiator == d.client);
        bool initiatorWon = (initiatorIsClient && clientWon) || (!initiatorIsClient && !clientWon);

        if (initiatorWon) {
            // Refund fee to initiator
            usdc.safeTransfer(d.initiator, d.arbitrationFee);
        } else {
            // Send fee to treasury
            usdc.safeTransfer(treasury, d.arbitrationFee);
        }

        // Update dispute state
        d.status = DisputeStatus.Resolved;
        d.resolvedByOwner = byOwner;
        d.clientWon = clientWon;

        if (byOwner) {
            emit DisputeResolvedByOwner(disputeId, clientWon);
        } else {
            emit DisputeResolved(disputeId, clientWon, clientShare, developerShare);
        }
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    /**
     * @notice Check if quorum has been reached for a dispute
     * @param disputeId The dispute ID
     * @return True if quorum is met
     */
    function quorumReached(uint256 disputeId) external view returns (bool) {
        Dispute storage d = disputes[disputeId];
        if (d.snapshotTotalSupply == 0) return false;
        uint256 quorumRequired = (d.snapshotTotalSupply * quorumNumerator) / 100;
        return d.totalVoteWeight >= quorumRequired;
    }

    /**
     * @notice Get core dispute details (parties and status)
     * @param disputeId The dispute ID
     */
    function getDisputeCore(uint256 disputeId) external view returns (
        uint256 projectId,
        address client,
        address developer,
        address initiator,
        DisputeStatus status,
        bool resolvedByOwner,
        bool clientWon,
        uint256 _arbitrationFee
    ) {
        Dispute storage d = disputes[disputeId];
        return (
            d.projectId,
            d.client,
            d.developer,
            d.initiator,
            d.status,
            d.resolvedByOwner,
            d.clientWon,
            d.arbitrationFee
        );
    }

    /**
     * @notice Get dispute timeline and evidence
     * @param disputeId The dispute ID
     */
    function getDisputeTimeline(uint256 disputeId) external view returns (
        string memory clientEvidenceURI,
        string memory developerEvidenceURI,
        uint256 evidenceDeadline,
        uint256 votingDeadline,
        uint256 votingSnapshot
    ) {
        Dispute storage d = disputes[disputeId];
        return (
            d.clientEvidenceURI,
            d.developerEvidenceURI,
            d.evidenceDeadline,
            d.votingDeadline,
            d.votingSnapshot
        );
    }

    /**
     * @notice Get dispute voting tallies
     * @param disputeId The dispute ID
     */
    function getDisputeVoting(uint256 disputeId) external view returns (
        uint256 clientVoteWeight,
        uint256 developerVoteWeight,
        uint256 totalVoteWeight,
        uint256 snapshotTotalSupply
    ) {
        Dispute storage d = disputes[disputeId];
        return (
            d.clientVoteWeight,
            d.developerVoteWeight,
            d.totalVoteWeight,
            d.snapshotTotalSupply
        );
    }

    // =========================================================================
    // Admin Functions
    // =========================================================================

    function setArbitrationFee(uint256 newFee) external onlyOwner {
        arbitrationFee = newFee;
    }

    function setQuorumNumerator(uint256 newQuorum) external onlyOwner {
        require(newQuorum > 0 && newQuorum <= 100, "Invalid quorum");
        quorumNumerator = newQuorum;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        treasury = newTreasury;
    }

    function setEvidencePeriod(uint256 newPeriod) external onlyOwner {
        require(newPeriod > 0, "Invalid period");
        evidencePeriod = newPeriod;
    }

    function setVotingPeriod(uint256 newPeriod) external onlyOwner {
        require(newPeriod > 0, "Invalid period");
        votingPeriod = newPeriod;
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
