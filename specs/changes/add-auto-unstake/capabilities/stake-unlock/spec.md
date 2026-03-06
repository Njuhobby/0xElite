# Stake Unlock

## Purpose

Defines the behavioral requirements for automatically releasing staked USDC back to developers as they complete projects, following the gradual unlock schedule in RFC-005.

## ADDED Requirements

### Requirement: Owner-Only Unstake

The system SHALL restrict the `unstake` and `unstakeFor` functions on the StakeVault contract to the contract owner (backend wallet). Developers SHALL NOT be able to call unstake directly.

#### Scenario: Developer attempts to unstake directly

- **WHEN** a developer calls `unstake()` on the StakeVault contract
- **THEN** the transaction SHALL revert with an "OwnableUnauthorizedAccount" error
- **AND** the developer's staked balance SHALL remain unchanged

#### Scenario: Owner unstakes on behalf of a developer

- **WHEN** the contract owner calls `unstakeFor(developerAddress, amount)`
- **THEN** the specified `amount` of USDC SHALL be transferred from StakeVault to the developer's wallet
- **AND** the developer's on-chain `stakes` mapping SHALL decrease by `amount`
- **AND** an `Unstaked(developer, amount)` event SHALL be emitted

#### Scenario: Owner attempts to unstake more than developer's balance

- **WHEN** the contract owner calls `unstakeFor(developerAddress, amount)` where `amount` exceeds the developer's staked balance
- **THEN** the transaction SHALL revert with "Insufficient stake"
- **AND** no USDC SHALL be transferred

---

### Requirement: Automatic Unlock on Project Completion

The system SHALL automatically check and execute stake unlocks whenever a developer's `projects_completed` count increases due to a `ProjectStateChanged(Completed)` event.

#### Scenario: Developer completes 5th project (first unlock threshold)

- **WHEN** the milestoneListener processes a `ProjectStateChanged` event transitioning a project to `Completed`
- **AND** the developer's `projects_completed` becomes 5
- **AND** the developer's current `unlock_tier` is 0
- **THEN** the backend SHALL call `unstakeFor(developer, 50_000_000)` (50 USDC)
- **AND** the developer's `unlock_tier` SHALL be updated to 1
- **AND** the developer's `total_unlocked` SHALL increase by 50
- **AND** a record SHALL be inserted into `unlock_history`
- **AND** the developer SHALL receive an in-app notification

#### Scenario: Developer completes 10th project (second unlock threshold)

- **WHEN** the developer's `projects_completed` becomes 10
- **AND** the developer's current `unlock_tier` is 1
- **THEN** the backend SHALL call `unstakeFor(developer, 50_000_000)` (50 USDC)
- **AND** the developer's `unlock_tier` SHALL be updated to 2

#### Scenario: Developer completes 15th project (third unlock threshold)

- **WHEN** the developer's `projects_completed` becomes 15
- **AND** the developer's current `unlock_tier` is 2
- **THEN** the backend SHALL call `unstakeFor(developer, 50_000_000)` (50 USDC)
- **AND** the developer's `unlock_tier` SHALL be updated to 3

#### Scenario: Developer completes 20th project (full unlock)

- **WHEN** the developer's `projects_completed` becomes 20
- **AND** the developer's current `unlock_tier` is 3
- **THEN** the backend SHALL call `unstakeFor(developer, 50_000_000)` (50 USDC)
- **AND** the developer's `unlock_tier` SHALL be updated to 4
- **AND** the developer's on-chain stake SHALL be 0

#### Scenario: Developer already past unlock tier (no action)

- **WHEN** the developer's `projects_completed` becomes 6
- **AND** the developer's current `unlock_tier` is already 1
- **THEN** the system SHALL NOT execute any unstake transaction
- **AND** no notification SHALL be sent

---

### Requirement: Skip-Tier Unlock

The system SHALL handle cases where a developer crosses multiple unlock thresholds in a single event processing cycle.

#### Scenario: Developer jumps from tier 0 to tier 2

- **WHEN** the developer's `projects_completed` increases from 4 to 11 (e.g., due to batch event processing)
- **AND** the developer's current `unlock_tier` is 0
- **THEN** the backend SHALL call `unstakeFor(developer, 100_000_000)` (100 USDC — tiers 1 and 2 combined)
- **AND** the developer's `unlock_tier` SHALL be updated to 2
- **AND** the `unlock_history` record SHALL show `from_tier=0, to_tier=2`

---

### Requirement: Unlock Failure Isolation

The system SHALL NOT allow unlock failures to block milestone event processing.

#### Scenario: Unstake transaction fails

- **WHEN** the milestoneListener triggers an unlock check after a project completion
- **AND** the `unstakeFor()` transaction reverts or times out
- **THEN** the project completion SHALL still be recorded in the database
- **AND** the developer's `projects_completed` SHALL still be incremented
- **AND** the unlock attempt SHALL be retried up to 3 times with exponential backoff
- **AND** if all retries fail, the system SHALL alert the admin for manual resolution

#### Scenario: On-chain stake is less than expected unlock amount

- **WHEN** the unlock service determines the developer qualifies for an unlock
- **AND** the developer's on-chain `stakes` balance is less than the expected unlock amount (data inconsistency)
- **THEN** the system SHALL log a warning
- **AND** the system SHALL NOT attempt the unstake transaction
- **AND** the system SHALL alert the admin

---

### Requirement: Unlock Notification

The system SHALL notify developers when their staked USDC is unlocked.

#### Scenario: Successful unlock notification

- **WHEN** an unlock transaction is confirmed on-chain
- **THEN** the system SHALL create an in-app notification for the developer containing:
  - The amount unlocked (e.g., "50 USDC")
  - The new remaining stake (e.g., "150 USDC remaining")
  - The transaction hash
  - The unlock tier reached
  - The next unlock threshold (e.g., "Next unlock at 10 projects completed")

#### Scenario: Full unlock notification

- **WHEN** the developer reaches tier 4 (all 200 USDC unlocked)
- **THEN** the notification SHALL indicate that the full stake has been returned
- **AND** the notification SHALL NOT mention a next unlock threshold

---

### Requirement: Unlock History Visibility

The system SHALL allow developers to view their unlock history.

#### Scenario: Developer queries unlock history

- **WHEN** a developer calls `GET /api/developers/:address/unlock-history`
- **THEN** the system SHALL return a list of all unlock events for that developer
- **AND** each entry SHALL include: amount, tier, transaction hash, and timestamp

#### Scenario: Developer with no unlocks

- **WHEN** a developer calls `GET /api/developers/:address/unlock-history`
- **AND** the developer has no unlock records
- **THEN** the system SHALL return an empty list
- **AND** the response SHALL include the developer's current `unlock_tier` and `projects_completed`

## Related Specs

- **Architecture**: `architecture/auto-unstake-system/spec.md`
- **Data Models**: `data-models/developer/schema.md`
- **API**: `api/unstake-notification/spec.md`
- **RFC**: `docs/RFC/RFC-005-sybil-prevention.md`
