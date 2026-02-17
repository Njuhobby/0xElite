# Client Dashboard

## Purpose

Provides a dedicated management interface for clients to manage their profile, create and monitor projects, track milestone progress, manage escrow, and submit reviews.

## Requirements

## ADDED Requirements

### Requirement: Client Dashboard Access

The system SHALL provide a protected dashboard at `/dashboard/client/` accessible only to registered clients.

#### Scenario: Registered client accesses dashboard

- **WHEN** a registered client (is_registered = true) connects their wallet
- **THEN** the system displays the client dashboard with sidebar navigation
- **AND** the default view is the client profile page

#### Scenario: Unregistered wallet accesses dashboard

- **WHEN** a wallet address that is not a registered client navigates to `/dashboard/client/`
- **THEN** the system displays a registration prompt
- **AND** provides a form to complete client registration

#### Scenario: Active developer accesses client dashboard

- **WHEN** a wallet address that is an active developer but not a registered client navigates to `/dashboard/client/`
- **THEN** the system displays the registration prompt
- **AND** the user can register as a client (dual-role is allowed)

### Requirement: Client Auto-Redirect

The system SHALL automatically redirect registered clients to the client dashboard from the homepage.

#### Scenario: Registered client visits homepage

- **WHEN** a registered client connects their wallet on the homepage
- **THEN** the system redirects to `/dashboard/client/`

#### Scenario: User is both developer and client

- **WHEN** a wallet address is both an active developer and a registered client
- **THEN** the system prioritizes the developer dashboard redirect
- **AND** the developer dashboard provides a link to switch to client dashboard

### Requirement: Client Profile Management

The system SHALL allow clients to view and edit their profile information.

#### Scenario: Client views their profile

- **WHEN** a client navigates to the profile page
- **THEN** the system displays company name, email, description, website
- **AND** shows stats: projects created, projects completed, total spent, average rating

#### Scenario: Client edits their profile

- **WHEN** a client submits profile changes with a valid wallet signature
- **THEN** the system updates the client record
- **AND** displays the updated profile

### Requirement: Client Project Listing

The system SHALL display all projects belonging to the client with filtering and status information.

#### Scenario: Client views project list

- **WHEN** a client navigates to the projects page
- **THEN** the system displays all projects owned by the client
- **AND** each project shows title, status, assigned developer, budget, and creation date

#### Scenario: Client filters projects by status

- **WHEN** a client selects a status filter (draft, active, completed, disputed)
- **THEN** the system displays only projects matching the selected status

#### Scenario: Client has no projects

- **WHEN** a client with zero projects visits the projects page
- **THEN** the system displays an empty state with a "Create Project" call-to-action

### Requirement: Project Creation

The system SHALL allow clients to create new projects with milestones from the dashboard.

#### Scenario: Client creates a project

- **WHEN** a client submits a new project with title, description, required skills, budget, and milestones
- **THEN** the system creates the project on-chain via ProjectManager contract
- **AND** stores project details in the database
- **AND** displays the new project in the project list with status "draft"

#### Scenario: Client creates project with invalid data

- **WHEN** a client submits a project with missing required fields or budget below minimum
- **THEN** the system displays validation errors
- **AND** does not create the project

### Requirement: Project Detail View

The system SHALL provide a detailed project view showing milestones, escrow status, and assigned developer.

#### Scenario: Client views active project

- **WHEN** a client opens an active project detail page
- **THEN** the system displays project info, assigned developer, milestone list with statuses
- **AND** shows escrow balance (deposited, released, remaining)

#### Scenario: Client views milestone pending review

- **WHEN** a milestone has status "pending_review"
- **THEN** the system displays the milestone deliverables
- **AND** provides approve and reject actions

#### Scenario: Client approves a milestone

- **WHEN** a client approves a milestone deliverable with a valid signature
- **THEN** the system marks the milestone as completed
- **AND** triggers escrow release for the milestone amount

### Requirement: Review Submission from Dashboard

The system SHALL allow clients to submit reviews for completed projects directly from the project detail page.

#### Scenario: Client reviews completed project

- **WHEN** a client views a completed project that has not been reviewed
- **THEN** the system displays a "Submit Review" button
- **AND** opens the review submission modal when clicked

#### Scenario: Client has already reviewed

- **WHEN** a client views a completed project that they have already reviewed
- **THEN** the system displays the existing review
- **AND** shows an edit option if within the 7-day edit window

### Requirement: Dashboard Navigation

The system SHALL provide consistent sidebar navigation across all client dashboard pages.

#### Scenario: Client navigates between dashboard sections

- **WHEN** a client clicks a sidebar navigation item
- **THEN** the system navigates to the selected section
- **AND** highlights the active navigation item

#### Scenario: Client returns to main site

- **WHEN** a client clicks the "Main Site" link in the sidebar
- **THEN** the system navigates to the homepage

## Related Specs

- **APIs**: `api/client-management/spec.md`
