# ProjectManager Smart Contract Architecture

## Purpose

Provides on-chain project registration and state management, creating a verifiable record of project creation and ownership for dispute resolution.

## System Context

```
┌──────────────┐
│   Frontend   │
│  (Next.js)   │
└──────┬───────┘
       │ Web3 (wagmi)
       ↓
┌────────────────────┐
│ ProjectManager.sol │
│   (Arbitrum)       │
└──────┬─────────────┘
       │ Events
       ↓
┌──────────────────┐      ┌─────────────┐
│ Backend Listener │─────→│  PostgreSQL │
│   (Node.js)      │      │  (projects) │
└──────────────────┘      └─────────────┘
```



## Components

### Component: ProjectManager Contract

**Type**: Smart Contract
**Blockchain**: Ethereum-compatible (Arbitrum Sepolia testnet, Arbitrum One mainnet)
**Language**: Solidity ^0.8.20
**Responsibility**: Manages on-chain project registration, ownership tracking, and state transitions for dispute resolution

**Contract Interface**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ProjectManager is Ownable, ReentrancyGuard {
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

    /// @notice Create a new project on-chain
    /// @param _totalBudget Total project budget in USDC base units
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
}
```

**Key Design Decisions**:

1. **Minimal On-Chain Data**: Only essential fields stored on-chain (ownership, state, timestamps, budget). Detailed project info (title, description, milestones) stored off-chain in PostgreSQL for cost efficiency.

2. **Owner-Only State Mutations**: Only contract owner (backend service) can assign developers and update states. This prevents clients/developers from manipulating state directly, ensuring assignments follow platform rules.

3. **Immutable Client Assignment**: Once a project is created, the client address cannot change. This prevents ownership transfer attacks.

4. **Sequential Project IDs**: Simple counter-based IDs for easy reference and indexing.

5. **Event-Driven Sync**: All state changes emit events for backend listener to sync with database.

**Dependencies**:
- OpenZeppelin Contracts v5.0+
  - `Ownable.sol` (access control)
  - `ReentrancyGuard.sol` (reentrancy protection, future-proofing)

**Configuration**:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `initialOwner` | Backend service address | Set in constructor, can transfer ownership |

**Gas Optimization**:
- Use uint256 for all numeric fields (no packing needed, single slot access)
- Minimal storage updates (only essential state changes)
- Batch event emissions where possible

**Security Considerations**:
- ✅ Access control on state mutations (onlyOwner)
- ✅ Input validation (non-zero addresses, positive budgets)
- ✅ Immutable client addresses
- ✅ ReentrancyGuard for future payment integration
- ⚠️ Centralization risk (owner controls assignments) - mitigated by transparent off-chain matching algorithm
- ⚠️ No emergency pause - consider adding for production

**Testing Requirements**:
- Unit tests with Hardhat (20+ tests)
- Test project creation, assignment, state transitions
- Test access control (non-owner cannot assign/update)
- Test edge cases (invalid addresses, state transition validation)
- Integration test with backend event listener
- Gas profiling for optimization

**Deployment Plan**:
1. Deploy to Arbitrum Sepolia testnet
2. Set backend service address as owner
3. Verify contract on Arbiscan
4. Test project creation and assignment flows
5. Deploy to Arbitrum One mainnet
6. Transfer ownership to multi-sig (production security)

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Gas cost (createProject) | < 80,000 gas | Simple storage writes |
| Gas cost (assignDeveloper) | < 50,000 gas | State update + events |
| Transaction confirmation | < 15 seconds | Arbitrum L2 speed |

## Monitoring

**Contract Events**:
- Monitor `ProjectCreated` → sync to database
- Monitor `DeveloperAssigned` → update project status
- Monitor `ProjectStateChanged` → sync state transitions

**Alerts**:
- Failed state transitions → investigate backend logic
- Projects stuck in Draft > 24 hours → no available developers
- Unauthorized state change attempts → security issue

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`
- **Data Models**: `data-models/project/schema.md`
- **APIs**: `api/project-management/spec.md`
- **Architecture**: `architecture/matching-algorithm/spec.md`
