// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title IEscrowVault
 * @notice Interface for EscrowVault contract used by ProjectManager
 */
interface IEscrowVault {
    function release(uint256 projectId, address developer, uint256 amount) external returns (bool);
    function releaseFee(uint256 projectId, uint256 feeAmount) external returns (bool);
}

/**
 * @title ProjectManager
 * @notice Manages on-chain project registration, milestone tracking, and payment approval for 0xElite platform
 * @dev UUPS Upgradeable
 */
contract ProjectManager is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // =========================================================================
    // Enums & Structs
    // =========================================================================

    /// @notice Project states
    enum ProjectState {
        Draft,      // Project created, no developer assigned
        Active,     // Developer assigned, work in progress
        Completed,  // All milestones completed
        Disputed,   // Dispute filed
        Cancelled   // Project cancelled
    }

    /// @notice Milestone status enum
    enum MilestoneStatus {
        Pending,
        InProgress,
        PendingReview,
        Completed,
        Disputed
    }

    /// @notice Project information stored on-chain
    struct Project {
        uint256 projectId;
        address client;
        address assignedDeveloper;
        ProjectState state;
        uint256 totalBudget;
        uint256 createdAt;
        uint256 activatedAt;
        uint256 completedAt;
    }

    /// @notice Milestone data stored on-chain
    struct Milestone {
        uint128 budget;          // USDC amount (6 decimals)
        bytes32 detailsHash;     // keccak256(abi.encodePacked(title, description, deliverables))
        MilestoneStatus status;
    }

    // =========================================================================
    // Storage
    // =========================================================================

    /// @notice Mapping of project ID to project data
    mapping(uint256 => Project) public projects;

    /// @notice Counter for project IDs
    uint256 public nextProjectId;

    /// @notice Reference to EscrowVault contract for payment releases
    IEscrowVault public escrowVault;

    /// @notice Platform fee in basis points (e.g. 1000 = 10%)
    uint16 public platformFeeBps;

    /// @notice Treasury address for platform fee collection
    address public treasury;

    /// @notice Milestones per project: projectId => milestoneIndex => Milestone
    mapping(uint256 => mapping(uint8 => Milestone)) public milestones;

    /// @notice Number of milestones per project
    mapping(uint256 => uint8) public milestoneCount;

    /// @notice Developers assigned to a project
    mapping(uint256 => address[]) public projectDevelopers;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice Emitted when a new project is created
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        uint256 totalBudget
    );

    /// @notice Emitted when a developer is assigned to a project (single)
    event DeveloperAssigned(
        uint256 indexed projectId,
        address indexed developer
    );

    /// @notice Emitted when project state changes
    event ProjectStateChanged(
        uint256 indexed projectId,
        ProjectState oldState,
        ProjectState newState
    );

    /// @notice Emitted when milestones are created with a project
    event MilestonesCreated(uint256 indexed projectId, uint8 count);

    /// @notice Emitted when a milestone status changes
    event MilestoneStatusChanged(
        uint256 indexed projectId,
        uint8 milestoneIndex,
        MilestoneStatus oldStatus,
        MilestoneStatus newStatus
    );

    /// @notice Emitted when a milestone is approved and payment released
    event MilestoneApproved(
        uint256 indexed projectId,
        uint8 milestoneIndex,
        uint256 developerPayment,
        uint256 platformFee
    );

    /// @notice Emitted when developers are assigned to a project
    event DevelopersAssigned(uint256 indexed projectId, address[] developers);

    /// @notice Emitted when platform fee basis points are updated
    event PlatformFeeBpsUpdated(uint16 oldBps, uint16 newBps);

    // =========================================================================
    // Custom Errors
    // =========================================================================

    error NotProjectClient();
    error NotProjectDeveloper();
    error MilestoneNotFound();
    error InvalidMilestoneStatus();
    error BudgetMismatch();
    error TooManyMilestones();
    error NoMilestones();
    error InvalidFeeBps();
    error NoDevelopers();
    error InvalidAddress();
    error ProjectNotActive();

    // =========================================================================
    // Constructor & Initializers
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor)
     * @param initialOwner Address of the initial owner
     * @param _escrowVault EscrowVault contract address
     * @param _treasury Treasury address for fee collection
     * @param _feeBps Platform fee in basis points (e.g. 1000 = 10%)
     */
    function initialize(
        address initialOwner,
        address _escrowVault,
        address _treasury,
        uint16 _feeBps
    ) public initializer {
        require(initialOwner != address(0), "Invalid owner address");
        if (_escrowVault == address(0) || _treasury == address(0)) revert InvalidAddress();
        if (_feeBps > 5000) revert InvalidFeeBps();

        __Ownable_init(initialOwner);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        nextProjectId = 0;
        escrowVault = IEscrowVault(_escrowVault);
        treasury = _treasury;
        platformFeeBps = _feeBps;
    }

    /**
     * @notice Authorize upgrade to new implementation
     * @param newImplementation Address of new implementation contract
     * @dev Only owner can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // =========================================================================
    // Project Functions
    // =========================================================================

    /// @notice Create a new project on-chain (simple — no milestones)
    /// @param _totalBudget Total project budget in USDC base units (6 decimals)
    /// @return projectId The newly created project ID
    function createProject(uint256 _totalBudget) external returns (uint256) {
        require(_totalBudget > 0, "Budget must be positive");

        uint256 projectId = nextProjectId++;

        projects[projectId] = Project({
            projectId: projectId,
            client: msg.sender,
            assignedDeveloper: address(0),
            state: ProjectState.Draft,
            totalBudget: _totalBudget,
            createdAt: block.timestamp,
            activatedAt: 0,
            completedAt: 0
        });

        emit ProjectCreated(projectId, msg.sender, _totalBudget);

        return projectId;
    }

    /// @notice Assign a single developer to a project (backend service only)
    /// @param _projectId Project to assign
    /// @param _developer Developer wallet address
    function assignDeveloper(uint256 _projectId, address _developer) external onlyOwner {
        Project storage project = projects[_projectId];
        require(project.client != address(0), "Project does not exist");
        require(project.state == ProjectState.Draft, "Project not in draft state");
        require(_developer != address(0), "Invalid developer address");

        project.assignedDeveloper = _developer;
        project.activatedAt = block.timestamp;

        ProjectState oldState = project.state;
        project.state = ProjectState.Active;

        emit DeveloperAssigned(_projectId, _developer);
        emit ProjectStateChanged(_projectId, oldState, ProjectState.Active);
    }

    /// @notice Update project state (backend service or dispute contract)
    /// @param _projectId Project to update
    /// @param _newState New project state
    function updateProjectState(uint256 _projectId, ProjectState _newState) external onlyOwner {
        Project storage project = projects[_projectId];
        require(project.client != address(0), "Project does not exist");

        ProjectState oldState = project.state;
        require(oldState != _newState, "State unchanged");

        project.state = _newState;

        if (_newState == ProjectState.Completed) {
            project.completedAt = block.timestamp;
        }

        emit ProjectStateChanged(_projectId, oldState, _newState);
    }

    // =========================================================================
    // Milestone Functions
    // =========================================================================

    /**
     * @notice Create a new project with milestones on-chain
     * @param totalBudget Total project budget in USDC base units (6 decimals)
     * @param milestoneBudgets Array of milestone budgets (uint128, USDC 6 decimals)
     * @param milestoneHashes Array of milestone detail hashes
     * @return projectId The newly created project ID
     */
    function createProjectWithMilestones(
        uint256 totalBudget,
        uint128[] calldata milestoneBudgets,
        bytes32[] calldata milestoneHashes
    ) external returns (uint256) {
        require(totalBudget > 0, "Budget must be positive");
        if (milestoneBudgets.length == 0) revert NoMilestones();
        if (milestoneBudgets.length > 20) revert TooManyMilestones();
        if (milestoneBudgets.length != milestoneHashes.length) revert BudgetMismatch();

        // Validate budgets sum to total
        uint256 budgetSum = 0;
        for (uint256 i = 0; i < milestoneBudgets.length; i++) {
            if (milestoneBudgets[i] == 0) revert BudgetMismatch();
            budgetSum += milestoneBudgets[i];
        }
        if (budgetSum != totalBudget) revert BudgetMismatch();

        uint256 projectId = nextProjectId++;

        projects[projectId] = Project({
            projectId: projectId,
            client: msg.sender,
            assignedDeveloper: address(0),
            state: ProjectState.Draft,
            totalBudget: totalBudget,
            createdAt: block.timestamp,
            activatedAt: 0,
            completedAt: 0
        });

        // Store milestones
        uint8 count = uint8(milestoneBudgets.length);
        milestoneCount[projectId] = count;

        for (uint8 i = 0; i < count; i++) {
            milestones[projectId][i] = Milestone({
                budget: milestoneBudgets[i],
                detailsHash: milestoneHashes[i],
                status: MilestoneStatus.Pending
            });
        }

        emit ProjectCreated(projectId, msg.sender, totalBudget);
        emit MilestonesCreated(projectId, count);

        return projectId;
    }

    /**
     * @notice Assign developers to a project (backend service only)
     * @param _projectId Project to assign developers to
     * @param _developers Array of developer wallet addresses
     */
    function assignDevelopers(uint256 _projectId, address[] calldata _developers) external onlyOwner {
        Project storage project = projects[_projectId];
        require(project.client != address(0), "Project does not exist");
        require(project.state == ProjectState.Draft, "Project not in draft state");
        if (_developers.length == 0) revert NoDevelopers();

        for (uint256 i = 0; i < _developers.length; i++) {
            if (_developers[i] == address(0)) revert InvalidAddress();
            // Check for duplicates
            for (uint256 j = 0; j < i; j++) {
                if (_developers[j] == _developers[i]) revert InvalidAddress();
            }
        }

        // Store developers
        delete projectDevelopers[_projectId];
        for (uint256 i = 0; i < _developers.length; i++) {
            projectDevelopers[_projectId].push(_developers[i]);
        }

        // Set first developer as assignedDeveloper for single-developer compatibility
        project.assignedDeveloper = _developers[0];
        project.activatedAt = block.timestamp;

        ProjectState oldState = project.state;
        project.state = ProjectState.Active;

        emit DevelopersAssigned(_projectId, _developers);
        emit ProjectStateChanged(_projectId, oldState, ProjectState.Active);
    }

    /**
     * @notice Approve a milestone and trigger atomic payment release
     * @param _projectId Project ID
     * @param _milestoneIndex Milestone index (0-based)
     * @dev Only callable by project client. Milestone must be in PendingReview status.
     */
    function approveMilestone(uint256 _projectId, uint8 _milestoneIndex) external nonReentrant {
        Project storage project = projects[_projectId];
        if (project.client != msg.sender) revert NotProjectClient();
        if (project.state != ProjectState.Active) revert ProjectNotActive();
        if (_milestoneIndex >= milestoneCount[_projectId]) revert MilestoneNotFound();

        Milestone storage milestone = milestones[_projectId][_milestoneIndex];
        if (milestone.status != MilestoneStatus.PendingReview) revert InvalidMilestoneStatus();

        address[] storage developers = projectDevelopers[_projectId];
        if (developers.length == 0) revert NoDevelopers();

        // Execute payment split
        (uint256 totalDevPayment, uint256 fee) = _executePaymentSplit(_projectId, milestone.budget, developers);

        // Update milestone status
        milestone.status = MilestoneStatus.Completed;

        emit MilestoneApproved(_projectId, _milestoneIndex, totalDevPayment, fee);
        emit MilestoneStatusChanged(_projectId, _milestoneIndex, MilestoneStatus.PendingReview, MilestoneStatus.Completed);

        // Check if all milestones completed → auto-complete project
        _checkProjectCompletion(_projectId, project);
    }

    /**
     * @dev Execute payment split among developers and release fee to treasury
     */
    function _executePaymentSplit(
        uint256 _projectId,
        uint128 _budget,
        address[] storage _developers
    ) private returns (uint256 totalDevPayment, uint256 fee) {
        uint256 budget = uint256(_budget);
        fee = (budget * uint256(platformFeeBps)) / 10000;
        totalDevPayment = budget - fee;

        uint256 devCount = _developers.length;
        uint256 perDevPayment = totalDevPayment / devCount;
        uint256 remainder = totalDevPayment - (perDevPayment * devCount);

        for (uint256 i = 0; i < devCount; i++) {
            uint256 payment = perDevPayment;
            if (i == devCount - 1) {
                payment += remainder;
            }
            escrowVault.release(_projectId, _developers[i], payment);
        }

        if (fee > 0) {
            escrowVault.releaseFee(_projectId, fee);
        }
    }

    /**
     * @dev Check if all milestones are completed and auto-complete the project
     */
    function _checkProjectCompletion(uint256 _projectId, Project storage _project) private {
        uint8 count = milestoneCount[_projectId];
        for (uint8 i = 0; i < count; i++) {
            if (milestones[_projectId][i].status != MilestoneStatus.Completed) {
                return;
            }
        }

        ProjectState oldState = _project.state;
        _project.state = ProjectState.Completed;
        _project.completedAt = block.timestamp;
        emit ProjectStateChanged(_projectId, oldState, ProjectState.Completed);
    }

    /**
     * @notice Update milestone status (backend service only — for start work, submit, disputes)
     * @param _projectId Project ID
     * @param _milestoneIndex Milestone index (0-based)
     * @param _newStatus New milestone status
     */
    function updateMilestoneStatus(
        uint256 _projectId,
        uint8 _milestoneIndex,
        MilestoneStatus _newStatus
    ) external onlyOwner {
        if (_milestoneIndex >= milestoneCount[_projectId]) revert MilestoneNotFound();

        Milestone storage milestone = milestones[_projectId][_milestoneIndex];
        MilestoneStatus oldStatus = milestone.status;

        // Cannot use this function to set Completed — use approveMilestone instead
        if (_newStatus == MilestoneStatus.Completed) revert InvalidMilestoneStatus();
        if (oldStatus == _newStatus) revert InvalidMilestoneStatus();
        if (oldStatus == MilestoneStatus.Completed) revert InvalidMilestoneStatus();

        milestone.status = _newStatus;

        emit MilestoneStatusChanged(_projectId, _milestoneIndex, oldStatus, _newStatus);
    }

    // =========================================================================
    // View Functions
    // =========================================================================

    /// @notice Get project information
    function getProject(uint256 _projectId) external view returns (Project memory) {
        require(projects[_projectId].client != address(0), "Project does not exist");
        return projects[_projectId];
    }

    /// @notice Check if an address is the project client
    function isProjectClient(uint256 _projectId, address _address) external view returns (bool) {
        return projects[_projectId].client == _address;
    }

    /// @notice Check if an address is the assigned developer
    function isAssignedDeveloper(uint256 _projectId, address _address) external view returns (bool) {
        return projects[_projectId].assignedDeveloper == _address;
    }

    /// @notice Get total number of projects created
    function getProjectCount() external view returns (uint256) {
        return nextProjectId;
    }

    /// @notice Get a single milestone
    function getMilestone(uint256 _projectId, uint8 _index) external view returns (Milestone memory) {
        if (_index >= milestoneCount[_projectId]) revert MilestoneNotFound();
        return milestones[_projectId][_index];
    }

    /// @notice Get all milestones for a project
    function getMilestones(uint256 _projectId) external view returns (Milestone[] memory) {
        uint8 count = milestoneCount[_projectId];
        Milestone[] memory result = new Milestone[](count);
        for (uint8 i = 0; i < count; i++) {
            result[i] = milestones[_projectId][i];
        }
        return result;
    }

    /// @notice Get all developers assigned to a project
    function getProjectDevelopers(uint256 _projectId) external view returns (address[] memory) {
        return projectDevelopers[_projectId];
    }

    /// @notice Check if an address is a developer on a project
    function isProjectDeveloper(uint256 _projectId, address _addr) external view returns (bool) {
        address[] storage devs = projectDevelopers[_projectId];
        for (uint256 i = 0; i < devs.length; i++) {
            if (devs[i] == _addr) return true;
        }
        return false;
    }

    // =========================================================================
    // Config Functions (onlyOwner)
    // =========================================================================

    /// @notice Update platform fee basis points
    function setPlatformFeeBps(uint16 _newFeeBps) external onlyOwner {
        if (_newFeeBps > 5000) revert InvalidFeeBps();
        uint16 oldBps = platformFeeBps;
        platformFeeBps = _newFeeBps;
        emit PlatformFeeBpsUpdated(oldBps, _newFeeBps);
    }

    /// @notice Update treasury address
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
    }

    /// @notice Update escrow vault reference
    function setEscrowVault(address _escrowVault) external onlyOwner {
        if (_escrowVault == address(0)) revert InvalidAddress();
        escrowVault = IEscrowVault(_escrowVault);
    }

    /**
     * @notice Get the current implementation version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
