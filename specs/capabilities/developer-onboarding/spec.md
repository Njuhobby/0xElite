# Developer Onboarding

## Purpose

Enable Web3 developers to join the 0xElite platform through wallet-based authentication, profile creation, and economic staking for Sybil resistance.

## Requirements

### Requirement: Wallet-Based Registration

The system SHALL allow developers to register using their Ethereum wallet address without requiring email/password authentication.

#### Scenario: New developer connects wallet

- **WHEN** a developer connects their wallet for the first time
- **THEN** the system SHALL recognize the wallet as unregistered
- **AND** the system SHALL display the application form

#### Scenario: Existing developer connects wallet

- **WHEN** a developer with an active account connects their wallet
- **THEN** the system SHALL recognize the wallet as registered
- **AND** the system SHALL redirect to the developer dashboard

### Requirement: Profile Submission with Signature Verification

The system SHALL require wallet signature verification before accepting profile data to prove wallet ownership.

#### Scenario: Developer submits profile with valid signature

- **WHEN** a developer fills the application form and submits
- **THEN** the system SHALL prompt for wallet signature
- **AND** the system SHALL verify the signature matches the connected wallet address
- **AND** the system SHALL create a developer record with status 'pending'

#### Scenario: Developer submits profile with invalid signature

- **WHEN** the signature verification fails
- **THEN** the system SHALL reject the submission
- **AND** the system SHALL display an error message "Invalid wallet signature"

### Requirement: USDC Staking for Membership

The system SHALL require developers to stake USDC tokens to activate their account and prevent Sybil attacks.

#### Scenario: Developer stakes sufficient USDC

- **WHEN** a developer calls stake() with amount >= requiredStake
- **THEN** the smart contract SHALL transfer USDC from developer to StakeVault
- **AND** the smart contract SHALL emit Staked event
- **AND** the backend SHALL listen to the event and update developer.status to 'active'

#### Scenario: Developer attempts to stake insufficient USDC

- **WHEN** a developer calls stake() with amount < requiredStake
- **THEN** the smart contract SHALL revert the transaction
- **AND** the system SHALL display error "Minimum stake is {requiredStake} USDC"

#### Scenario: Developer has insufficient USDC balance

- **WHEN** a developer attempts to stake but doesn't have enough USDC
- **THEN** the token transfer SHALL fail
- **AND** the system SHALL display error "Insufficient USDC balance"

### Requirement: Profile Data Validation

The system SHALL validate all profile fields before accepting submissions.

#### Scenario: Valid profile data submitted

- **WHEN** a developer submits profile with all required fields valid
- **THEN** the system SHALL accept the submission
- **AND** the system SHALL create developer record

#### Scenario: Invalid email format

- **WHEN** email field contains invalid format (e.g., "notanemail")
- **THEN** the system SHALL reject with error "Invalid email format"

#### Scenario: Skills count out of range

- **WHEN** developer selects 0 skills or more than 10 skills
- **THEN** the system SHALL reject with error "Please select 1-10 skills"

#### Scenario: Bio exceeds character limit

- **WHEN** bio field contains more than 500 characters
- **THEN** the system SHALL reject with error "Bio must be 500 characters or less"

### Requirement: Uniqueness Constraints

The system SHALL enforce uniqueness of wallet addresses, email addresses, and GitHub usernames across all developers.

#### Scenario: Duplicate wallet address registration attempt

- **WHEN** a wallet address that already exists tries to register
- **THEN** the system SHALL reject with error "This wallet is already registered"

#### Scenario: Duplicate email registration attempt

- **WHEN** an email that already exists tries to register
- **THEN** the system SHALL reject with error "This email is already in use"

#### Scenario: Duplicate GitHub username (if provided)

- **WHEN** a GitHub username that already exists tries to register
- **THEN** the system SHALL reject with error "This GitHub account is already linked to another developer"

#### Scenario: GitHub username not provided

- **WHEN** a developer registers without providing GitHub username
- **THEN** the system SHALL accept the registration
- **AND** the system SHALL not enforce GitHub uniqueness

### Requirement: Profile Visibility and Privacy

The system SHALL display developer profiles publicly while protecting sensitive information.

#### Scenario: Viewing own profile

- **WHEN** a developer views their own profile page
- **THEN** the system SHALL display all profile fields including email
- **AND** the system SHALL show an "Edit Profile" button

#### Scenario: Viewing another developer's profile

- **WHEN** a user views another developer's profile
- **THEN** the system SHALL display public fields (skills, bio, stats)
- **AND** the system SHALL hide email address
- **AND** the system SHALL not show "Edit Profile" button

### Requirement: Profile Editing

The system SHALL allow developers to update their profile information after registration.

#### Scenario: Developer updates editable fields

- **WHEN** a developer updates email, skills, bio, hourly rate, or availability
- **THEN** the system SHALL require wallet signature verification
- **AND** the system SHALL update the profile
- **AND** the system SHALL display success message

#### Scenario: Developer attempts to change GitHub username

- **WHEN** a developer tries to modify their GitHub username after registration
- **THEN** the system SHALL prevent the change
- **AND** the system SHALL display info "GitHub username cannot be changed after registration"

#### Scenario: Non-owner attempts to edit profile

- **WHEN** a user tries to edit another developer's profile
- **THEN** the system SHALL reject the request with 403 Forbidden
- **AND** the system SHALL display error "You can only edit your own profile"

### Requirement: Event-Driven Account Activation

The system SHALL automatically activate developer accounts upon detecting successful stake transactions on the blockchain.

#### Scenario: Staked event detected for pending developer

- **WHEN** the backend listener detects a Staked event for a developer with status 'pending'
- **THEN** the system SHALL update developer.status to 'active'
- **AND** the system SHALL update developer.stakeAmount with the staked value
- **AND** the system SHALL update developer.stakedAt with current timestamp
- **AND** the system SHALL send a welcome email to the developer

#### Scenario: Event processing fails

- **WHEN** the event listener fails to process a Staked event
- **THEN** the system SHALL log the error with details
- **AND** the system SHALL add the event to a retry queue
- **AND** the system SHALL retry processing after configured interval

## Related Specs

- **Data Models**: `data-models/developer/schema.md`
- **APIs**: `api/developer-management/spec.md`
- **Architecture**: `architecture/stake-vault-contract/spec.md`, `architecture/event-sync-system/spec.md`
- **RFCs**: [RFC-001](../../../../rfcs/RFC-001-identity-and-login.md), [RFC-002](../../../../rfcs/RFC-002-sybil-prevention.md)
