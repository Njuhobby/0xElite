# Escrow Management

## Purpose

Provides milestone-based payment escrow functionality to protect client funds and guarantee developer payments through smart contract-managed USDC deposits and releases.

## Requirements

## ADDED Requirements

### Requirement: Escrow Deposit on Project Creation

The system SHALL require clients to deposit the full project budget into escrow before the project becomes active.

#### Scenario: Client deposits funds for new project

- **WHEN** a client creates a project with total budget of 5000 USDC and milestones totaling 5000 USDC
- **THEN** the system prompts the client to approve USDC spending for EscrowVault contract
- **AND** the system prompts the client to deposit 5000 USDC into escrow
- **AND** the system locks the funds in EscrowVault smart contract
- **AND** the system updates project status to "active" after deposit confirmation

#### Scenario: Client has insufficient USDC balance

- **WHEN** a client attempts to deposit funds but has only 3000 USDC when 5000 USDC is required
- **THEN** the USDC transfer fails with "Insufficient balance"
- **AND** the system displays error message "You need 5000 USDC to fund this project. Current balance: 3000 USDC"
- **AND** the project remains in "draft" status

#### Scenario: Client rejects USDC approval

- **WHEN** a client cancels the USDC approval transaction in their wallet
- **THEN** the system displays error "USDC approval rejected. Cannot deposit funds without approval."
- **AND** the project remains in "draft" status
- **AND** the system allows the client to retry approval

### Requirement: Milestone Payment Release

The system SHALL automatically release milestone payments to developers when clients approve milestone completion.

#### Scenario: Client approves milestone

- **WHEN** a client approves a milestone with budget 1500 USDC and platform fee is 15% (225 USDC)
- **THEN** the system calculates developer payment: 1500 - 225 = 1275 USDC
- **AND** the system calls EscrowVault.release() with developer address and 1275 USDC
- **AND** the system calls EscrowVault.releaseFee() with treasury address and 225 USDC
- **AND** the system updates milestone.payment_amount to 1275 USDC
- **AND** the system updates milestone.paid_at to current timestamp
- **AND** the system records payment in payment_history table
- **AND** the system updates project.escrow_balance (subtract 1500 USDC)

#### Scenario: Escrow has insufficient balance for release

- **WHEN** a milestone with 1500 USDC budget is approved but escrow only has 800 USDC remaining
- **THEN** the EscrowVault contract reverts with "Insufficient escrow balance"
- **AND** the system displays error to client "Cannot release payment: escrow balance too low"
- **AND** the milestone remains in "pending_review" status
- **AND** the system suggests client to top up escrow

#### Scenario: Payment transaction fails

- **WHEN** the EscrowVault.release() call fails due to network error or gas issues
- **THEN** the system does NOT update milestone status
- **AND** the system displays error "Payment failed: [error message]"
- **AND** the system logs the error for admin review
- **AND** the client can retry approval after issue is resolved

### Requirement: Escrow Balance Tracking

The system SHALL maintain accurate escrow balance tracking across deposits, releases, and fees.

#### Scenario: Track deposits and releases

- **WHEN** a project is created with 5000 USDC budget
- **THEN** the system records escrow_deposits entry with amount 5000 USDC
- **AND** the system updates project.total_deposited to 5000 USDC
- **AND** the system updates project.escrow_balance to 5000 USDC
- **WHEN** milestones totaling 3000 USDC are paid
- **THEN** the system updates project.total_released to 3000 USDC
- **AND** the system updates project.escrow_balance to 2000 USDC

#### Scenario: View escrow status

- **WHEN** a client or developer views a project with active escrow
- **THEN** the system displays total deposited: 5000 USDC
- **AND** the system displays total released: 3000 USDC (to developers + fees)
- **AND** the system displays remaining balance: 2000 USDC
- **AND** the system displays freeze status (frozen/active)

### Requirement: Escrow Freeze for Disputes

The system SHALL allow freezing escrow funds during disputes to prevent payment releases.

#### Scenario: Dispute freezes escrow

- **WHEN** a dispute is filed for a project with 2000 USDC remaining in escrow
- **THEN** the system calls EscrowVault.freeze() for the project
- **AND** the system updates escrow.is_frozen to true
- **AND** the system prevents any milestone approvals while frozen
- **AND** the system displays "Escrow frozen due to dispute" on project page

#### Scenario: Attempt to release payment while frozen

- **WHEN** a client attempts to approve a milestone while escrow is frozen
- **THEN** the EscrowVault contract reverts with "Escrow is frozen"
- **AND** the system displays error "Cannot release payment: escrow frozen due to active dispute"
- **AND** the milestone remains in "pending_review" status

#### Scenario: Unfreeze after dispute resolution

- **WHEN** a dispute is resolved and DisputeDAO calls resolveDispute()
- **THEN** the EscrowVault contract distributes funds according to ruling
- **AND** the system updates escrow.is_frozen to false
- **AND** the system records dispute resolution in payment_history
- **AND** normal milestone approvals can resume

### Requirement: Platform Fee Collection

The system SHALL automatically deduct and transfer platform fees to treasury on every milestone payment.

#### Scenario: Calculate and collect platform fee

- **WHEN** a milestone with 2000 USDC budget is approved
- **AND** the client has completed 0-2 projects (fee tier: 15%)
- **THEN** the system calculates platform fee: 2000 * 0.15 = 300 USDC
- **AND** the system calculates developer payment: 2000 - 300 = 1700 USDC
- **AND** the system calls EscrowVault.releaseFee(projectId, 300 USDC)
- **AND** the treasury receives 300 USDC
- **AND** the system records fee collection in payment_history

#### Scenario: Fee tier varies by client history

- **WHEN** a client with 10 completed projects approves a 2000 USDC milestone (fee tier: 5%)
- **THEN** the system calculates platform fee: 2000 * 0.05 = 100 USDC
- **AND** the developer receives: 2000 - 100 = 1900 USDC
- **WHEN** a client with 0 completed projects approves the same milestone (fee tier: 15%)
- **THEN** the platform fee is: 2000 * 0.15 = 300 USDC
- **AND** the developer receives: 2000 - 300 = 1700 USDC

### Requirement: Payment History Auditability

The system SHALL maintain a complete, immutable audit trail of all escrow transactions.

#### Scenario: Record all escrow events

- **WHEN** any escrow transaction occurs (deposit, release, fee collection, freeze, unfreeze)
- **THEN** the system creates a payment_history entry with transaction type, amount, addresses, and blockchain tx_hash
- **AND** the system records timestamp
- **AND** the system links to project_id and milestone_id (if applicable)

#### Scenario: View payment history timeline

- **WHEN** a user views payment history for a project
- **THEN** the system displays chronological timeline of all transactions
- **AND** each entry shows: date, type, amount, recipient, transaction hash
- **AND** the system provides link to Arbiscan for blockchain verification
- **AND** the history is read-only (no modifications allowed)

### Requirement: Event-Driven Synchronization

The system SHALL synchronize escrow state by listening to blockchain events from EscrowVault contract.

#### Scenario: Deposited event updates database

- **WHEN** the backend listener detects a Deposited event with projectId=123, amount=5000 USDC
- **THEN** the system creates escrow_deposits record
- **AND** the system updates project.total_deposited and escrow_balance
- **AND** the system creates payment_history entry of type "deposit"

#### Scenario: Released event updates milestone payment

- **WHEN** the backend listener detects a Released event with projectId=123, milestoneId=5, amount=1500 USDC
- **THEN** the system updates milestone.payment_amount to 1500 USDC
- **AND** the system updates milestone.paid_at to block timestamp
- **AND** the system creates payment_history entry of type "release"
- **AND** the system updates project.total_released and escrow_balance

#### Scenario: Event sync failure recovery

- **WHEN** the event listener crashes while processing a Released event
- **THEN** the system logs the error with event details
- **AND** the system resumes from last checkpoint on restart
- **AND** the system reprocesses any missed events
- **AND** the system ensures no duplicate processing

## Related Specs

- **Data Models**: `data-models/escrow/schema.md`, `data-models/payment-history/schema.md`, `data-models/project/schema.md`, `data-models/milestone/schema.md`
- **APIs**: `api/escrow-management/spec.md`
- **Architecture**: `architecture/escrow-vault-contract/spec.md`, `architecture/escrow-event-listener/spec.md`
