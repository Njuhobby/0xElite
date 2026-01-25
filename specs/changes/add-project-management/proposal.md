# Spec 2: Project Management

## Why

Clients need a way to post projects and have them automatically matched with available elite developers. The platform requires structured project management with milestone-based deliverables to enable transparent progress tracking and payment releases.

## What Changes

- Add project creation and lifecycle management (draft, active, completed, disputed)
- Add milestone system for breaking projects into deliverables with individual budgets
- Add auto-assignment algorithm to match projects with developers based on skills and availability
- Add optional client registration (hybrid: create projects immediately, profile optional for advanced features)
- Add ProjectManager smart contract to manage on-chain project state and ownership
- Integrate with existing developer onboarding system for assignment

## Impact

- **Affected specs**:
  - capabilities/project-management (ADDED)
  - capabilities/developer-onboarding (MODIFIED - add assignment status)
  - data-models/project (ADDED)
  - data-models/milestone (ADDED)
  - data-models/client (ADDED)
  - data-models/developer (MODIFIED - add assigned project tracking)
  - api/project-management (ADDED)
  - api/developer-management (MODIFIED - add assignment endpoints)
  - architecture/project-manager-contract (ADDED)
  - architecture/matching-algorithm (ADDED)

- **Affected code**:
  - New smart contract: contracts/ProjectManager.sol
  - New backend services: matching algorithm, project management
  - New frontend pages: /projects, /projects/create, /projects/[id]
  - Database: 3 new tables (projects, milestones, clients)

## Success Criteria

- Clients can create projects with multiple milestones
- System automatically assigns available developers based on skills
- Projects transition through lifecycle states (draft → active → completed)
- ProjectManager contract tracks project ownership on-chain
- Developers can view assigned projects
- Clients can track project progress and milestone completion
- No-refusal policy enforced (developers cannot reject auto-assignments)

## Breaking Changes

None - this is a new feature set that extends the existing developer onboarding system.
