# Project Management

## Purpose

This capability defines the project management system for 0xElite, enabling clients to create milestone-based projects and automatically matching them with available developers. It includes project lifecycle management, milestone tracking, and the no-refusal auto-assignment policy.

## Requirements



### Requirement: Project Creation

The system SHALL allow clients to create projects with required details and milestone breakdown.

#### Scenario: Client creates project with valid data

- **WHEN** a client with connected wallet submits a project with title, description, required skills, total budget, and at least one milestone
- **THEN** the system creates a new project with status "draft"
- **AND** the system requires wallet signature for verification
- **AND** the system returns the created project ID

#### Scenario: Client creates project without milestones

- **WHEN** a client attempts to create a project without any milestones
- **THEN** the system rejects the request with validation error
- **AND** the system returns message "Projects must have at least one milestone"

#### Scenario: Client creates project with invalid budget allocation

- **WHEN** a client creates a project where milestone budgets do not sum to total project budget
- **THEN** the system rejects the request with validation error
- **AND** the system returns message "Milestone budgets must sum to total project budget"

### Requirement: Project Lifecycle Management

The system SHALL manage project state transitions through defined lifecycle stages.

#### Scenario: Project transitions from draft to active

- **WHEN** a developer is successfully assigned to a draft project
- **THEN** the system updates project status to "active"
- **AND** the system emits ProjectActivated event
- **AND** the system notifies the assigned developer

#### Scenario: Project marked as completed

- **WHEN** all project milestones are marked as completed
- **THEN** the system automatically updates project status to "completed"
- **AND** the system emits ProjectCompleted event
- **AND** the system notifies both client and developer

#### Scenario: Project enters disputed state

- **WHEN** either client or developer files a dispute for an active project
- **THEN** the system updates project status to "disputed"
- **AND** the system freezes milestone payments
- **AND** the system initiates dispute resolution process

### Requirement: Milestone Management

The system SHALL allow clients and developers to manage project milestones with individual deliverables and budgets.

#### Scenario: Client adds milestone to draft project

- **WHEN** a client adds a new milestone to a draft project with title, description, deliverables, and budget
- **THEN** the system creates the milestone linked to the project
- **AND** the system validates total milestone budgets do not exceed project budget
- **AND** the system returns the created milestone ID

#### Scenario: Developer marks milestone as in progress

- **WHEN** an assigned developer marks a milestone as "in_progress"
- **THEN** the system updates milestone status to "in_progress"
- **AND** the system records the started timestamp
- **AND** the system notifies the client

#### Scenario: Developer submits milestone for review

- **WHEN** a developer marks a milestone as "pending_review" and provides deliverable URLs
- **THEN** the system updates milestone status to "pending_review"
- **AND** the system records submission timestamp
- **AND** the system notifies the client to review deliverables

#### Scenario: Client approves milestone completion

- **WHEN** a client marks a "pending_review" milestone as "completed"
- **THEN** the system updates milestone status to "completed"
- **AND** the system triggers escrow payment release for that milestone
- **AND** the system checks if all project milestones are completed

### Requirement: Auto-Assignment

The system SHALL automatically assign available developers to new projects based on skill matching and availability.

#### Scenario: System assigns developer to new project

- **WHEN** a client creates a project with required skills
- **THEN** the system calculates match scores for all available developers
- **AND** the system assigns the highest-scoring available developer
- **AND** the system updates developer status to "busy"
- **AND** the system updates project status to "active"
- **AND** the system notifies the assigned developer

#### Scenario: No available developers match required skills

- **WHEN** a client creates a project but no available developers have matching skills
- **THEN** the system keeps project in "draft" status
- **AND** the system adds project to pending assignment queue
- **AND** the system notifies the client that assignment is pending

#### Scenario: Developer becomes available triggers pending assignments

- **WHEN** a developer's status changes from "busy" to "available"
- **THEN** the system checks the pending assignment queue
- **AND** the system assigns the developer to the highest-priority matching project
- **AND** the system updates both developer and project statuses

### Requirement: No-Refusal Policy Enforcement

The system SHALL enforce the no-refusal policy where assigned developers cannot reject project assignments.

#### Scenario: Developer assigned to project automatically

- **WHEN** the matching algorithm assigns a developer to a project
- **THEN** the developer is immediately assigned without confirmation requirement
- **AND** the developer's status is updated to "busy"
- **AND** the developer receives notification of new assignment

#### Scenario: Developer attempts to reject assignment

- **WHEN** a developer tries to change their status to decline an assignment
- **THEN** the system rejects the request
- **AND** the system returns error "Assigned developers cannot refuse projects per platform policy"

### Requirement: Client Registration (Optional)

The system SHALL allow clients to optionally create profiles for enhanced features while permitting immediate project creation.

#### Scenario: Unregistered client creates first project

- **WHEN** a wallet address with no client profile creates a project
- **THEN** the system creates a minimal client record with wallet address only
- **AND** the system allows project creation to proceed
- **AND** the system suggests completing profile for advanced features

#### Scenario: Client completes profile registration

- **WHEN** a client with existing minimal profile submits company name, email, description, and website
- **THEN** the system updates the client record with full profile data
- **AND** the system verifies wallet signature
- **AND** the system unlocks advanced features (priority support, bulk projects)

#### Scenario: Registered client creates project

- **WHEN** a client with completed profile creates a project
- **THEN** the system associates the project with the full client profile
- **AND** the system displays company information on the project
- **AND** the system allows access to priority assignment features

### Requirement: Project Visibility and Privacy

The system SHALL control project visibility based on user role and project status.

#### Scenario: Public views active project

- **WHEN** any user browses the projects list
- **THEN** the system displays only active and completed projects
- **AND** the system hides client contact information
- **AND** the system shows project title, description, skills, and assigned developer

#### Scenario: Client views own projects

- **WHEN** a client views their own projects
- **THEN** the system displays all projects (draft, active, completed, disputed)
- **AND** the system shows full milestone details and budgets
- **AND** the system shows assigned developer contact information

#### Scenario: Developer views assigned projects

- **WHEN** a developer views their assigned projects
- **THEN** the system displays all projects assigned to them
- **AND** the system shows client contact information
- **AND** the system shows milestone details and payment schedules

## Related Specs

- **Data Models**: `data-models/project/schema.md`, `data-models/milestone/schema.md`, `data-models/client/schema.md`
- **APIs**: `api/project-management/spec.md`
- **Architecture**: `architecture/project-manager-contract/spec.md`, `architecture/matching-algorithm/spec.md`
