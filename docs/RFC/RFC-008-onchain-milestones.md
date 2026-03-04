# RFC-008: Move Milestones On-Chain (ProjectManager V2)

## Status

Accepted

## Motivation

Currently, milestone definitions exist only in PostgreSQL. If the platform tampers with or loses milestone data, clients and developers have no on-chain recourse. Payment-critical data (milestone budgets, approval status) should be verifiable on-chain to eliminate centralized trust.

## Decision

### What Goes On-Chain
- Milestone budget (`uint128`, USDC 6 decimals)
- Milestone details hash (`bytes32`, `keccak256(abi.encodePacked(title, description, deliverables))`)
- Milestone status enum (`Pending`, `InProgress`, `PendingReview`, `Completed`, `Disputed`)
- Project-to-developer mapping (`address[]` for multi-developer support)
- Platform fee rate (`uint16` basis points, e.g. 1000 = 10%)

### What Stays Off-Chain
- Milestone title, description, deliverable details (stored in PostgreSQL, anchored by detailsHash)
- Start work / submit deliverables transitions (backend API + signature verification, relayed to chain by backend)
- Developer matching and assignment logic

### On-Chain Scope
Only `approveMilestone` (the payment trigger) is called directly by the client wallet on-chain. This is the critical trust boundary — the client's funds are released atomically when they approve, without relying on the backend to execute the payment.

Other milestone status transitions (`Pending → InProgress`, `InProgress → PendingReview`) are relayed by the backend via `updateMilestoneStatus(onlyOwner)`. This keeps the developer UX simple (no wallet interaction for routine status updates) while still recording status on-chain for auditability.

## Project Creation

Client wallet calls `createProjectWithMilestones()` directly. On-chain `client = msg.sender` is the real client address, not the backend service. This ensures project ownership is cryptographically verified.

## Fee Strategy

Single configurable `platformFeeBps` on-chain (e.g. 1000 = 10%). Owner can adjust via `setPlatformFeeBps()` (max 5000 = 50%). Tiered logic (Bronze/Silver/Gold) can be added later via a fee oracle contract without upgrading ProjectManager.

## Multi-Developer Support

Fees are split equally among `projectDevelopers[]` array. No developer address is stored in the Milestone struct — all developers assigned to a project share each milestone payment equally.

## Deployment Strategy

- UUPS proxy deployment with `initialize(owner, escrowVault, treasury, feeBps)`
- Simple projects (where `milestoneCount == 0`) use `createProject` + `assignDeveloper` flow
- Milestone projects use `createProjectWithMilestones` + `assignDevelopers` + `approveMilestone` flow

## New Flow

```
Client creates project+milestones on-chain (createProjectWithMilestones)
  → Client deposits USDC to EscrowVault (unchanged)
  → Backend assigns developers (assignDevelopers - onlyOwner)
  → Developer starts work (backend API, off-chain → backend relays updateMilestoneStatus)
  → Developer submits deliverables (backend API, off-chain → backend relays updateMilestoneStatus)
  → Client approves milestone ON-CHAIN (approveMilestone)
    → Contract atomically: calculates fee, splits payment to developers, sends fee to treasury
    → Backend event listener syncs DB
  → All milestones completed → contract auto-marks project Completed
```

## EscrowVault Compatibility

The EscrowVault proxy address stays the same after UUPS upgrade. Its `onlyProjectManager` modifier checks `msg.sender == projectManager`, which is the ProjectManager proxy address. Since the proxy address doesn't change during upgrade, EscrowVault works with V2 without any changes.

## Risks

- **Gas costs**: `approveMilestone` with multi-developer splits and fee transfers is more gas-intensive than a simple state update. Mitigated by Arbitrum's low gas costs.
- **Rounding dust**: When splitting payments among multiple developers, integer division may leave dust. The last developer receives the remainder to ensure the full budget is distributed.
- **Upgrade risk**: Storage layout must be strictly appended (no reordering V1 slots). Verified by OpenZeppelin upgrades plugin.

## Related

- [RFC-002: On-Chain Storage Decisions](RFC-002-onchain-storage-decisions.md)
- [RFC-001: Data Sync Strategy](RFC-001-data-sync-strategy.md)
