// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title ProjectManager
 * @notice Manages on-chain project registration and state tracking for 0xElite platform
 * @dev UUPS Upgradeable - stores minimal project data on-chain for ownership and dispute resolution
 */
contract ProjectManager is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    /// @notice Project states
    enum ProjectState {
        Draft,      // Project created, no developer assigned
        Active,     // Developer assigned, work in progress
        Completed,  // All milestones completed
        Disputed,   // Dispute filed
        Cancelled   // Project cancelled
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

    /// @notice Mapping of project ID to project data
    mapping(uint256 => Project) public projects;

    /// @notice Counter for project IDs
    uint256 public nextProjectId;

    /// @notice Emitted when a new project is created
    /// @param projectId Unique project identifier
    /// @param client Address of project creator
    /// @param totalBudget Total project budget in USDC base units
    event ProjectCreated(
        uint256 indexed projectId,
        address indexed client,
        uint256 totalBudget
    );

    /// @notice Emitted when a developer is assigned to a project
    /// @param projectId Project identifier
    /// @param developer Address of assigned developer
    event DeveloperAssigned(
        uint256 indexed projectId,
        address indexed developer
    );

    /// @notice Emitted when project state changes
    /// @param projectId Project identifier
    /// @param oldState Previous state
    /// @param newState New state
    event ProjectStateChanged(
        uint256 indexed projectId,
        ProjectState oldState,
        ProjectState newState
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replaces constructor)
     * @param initialOwner Address of the initial owner
     */
    function initialize(address initialOwner) public initializer {
        require(initialOwner != address(0), "Invalid owner address");

        __Ownable_init(initialOwner);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        nextProjectId = 0;
    }

    /**
     * @notice Authorize upgrade to new implementation
     * @param newImplementation Address of new implementation contract
     * @dev Only owner can upgrade
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Create a new project on-chain
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

    /// @notice Assign a developer to a project (backend service only)
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

    /// @notice Get project information
    /// @param _projectId Project identifier
    /// @return Project struct
    function getProject(uint256 _projectId) external view returns (Project memory) {
        require(projects[_projectId].client != address(0), "Project does not exist");
        return projects[_projectId];
    }

    /// @notice Check if an address is the project client
    /// @param _projectId Project identifier
    /// @param _address Address to check
    /// @return True if address is the client
    function isProjectClient(uint256 _projectId, address _address) external view returns (bool) {
        return projects[_projectId].client == _address;
    }

    /// @notice Check if an address is the assigned developer
    /// @param _projectId Project identifier
    /// @param _address Address to check
    /// @return True if address is the assigned developer
    function isAssignedDeveloper(uint256 _projectId, address _address) external view returns (bool) {
        return projects[_projectId].assignedDeveloper == _address;
    }

    /// @notice Get total number of projects created
    /// @return Total project count
    function getProjectCount() external view returns (uint256) {
        return nextProjectId;
    }

    /**
     * @notice Get the current implementation version
     * @return Version string
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}
