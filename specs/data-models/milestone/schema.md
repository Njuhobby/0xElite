# Milestone

## Purpose

Represents individual deliverables within a project, each with its own budget, deliverables, and completion status.

## Schema



### Entity: Milestone

**Table**: `milestones`

Add payment tracking fields to existing milestones table.

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `payment_amount` | DECIMAL(20,6) | NULL, CHECK (payment_amount >= 0) | Actual amount paid to developer (budget minus platform fee) |
| `platform_fee` | DECIMAL(20,6) | NULL, CHECK (platform_fee >= 0) | Platform fee deducted from milestone budget |
| `payment_tx_hash` | VARCHAR(66) | NULL | Blockchain transaction hash for payment release |
| `paid_at` | TIMESTAMP | NULL | When payment was released to developer |

**Modified Status Transitions**:
```
pending_review → completed now triggers:
  1. Calculate platform fee
  2. Call EscrowVault.release() for developer payment
  3. Call EscrowVault.releaseFee() for platform fee
  4. Update payment_amount, platform_fee, payment_tx_hash, paid_at
  5. Only then update status to "completed"

If payment fails:
  - Status remains "pending_review"
  - Error logged and displayed to client
```

**Business Rules Changes**:
- Milestone approval is atomic with payment release
- Cannot mark milestone as completed without successful payment
- Payment amount = budget - platform_fee
- Platform fee tier based on client's project history (5-15%)

## Related Specs

- **Capabilities**: `capabilities/escrow-management/spec.md`, `capabilities/project-management/spec.md`
- **Data Models**: `data-models/escrow/schema.md`, `data-models/payment-history/schema.md`

## Validation Rules

### Rule: Deliverables

- **MUST** have at least one deliverable description
- **SHOULD** provide `deliverable_urls` when status is `pending_review`
- **MUST NOT** mark as `completed` without `deliverable_urls`

### Rule: Budget Allocation

- **MUST** have `budget > 0`
- **MUST NOT** exceed remaining project budget when adding new milestones

### Rule: Sequential Completion

- **SHOULD** complete milestones in sequential order (milestone 1 before milestone 2)
- **MAY** allow parallel work on multiple milestones

### Rule: Status Transitions

- **MUST NOT** transition to `completed` without client approval
- **MUST** have `deliverable_urls` when transitioning to `pending_review`
- **SHOULD** record timestamps for each status change

---

## V2: On-Chain Milestone Fields

### New Fields (Migration 007)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `details_hash` | VARCHAR(66) | NULL | keccak256 hash of milestone details stored on-chain for verification |
| `on_chain_index` | SMALLINT | NULL | Index of this milestone in the on-chain milestones mapping (0-based) |

### New Project Field

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `uses_onchain_milestones` | BOOLEAN | NOT NULL DEFAULT false | Whether this project uses V2 on-chain milestone flow |

### Index

```sql
CREATE INDEX idx_milestones_on_chain ON milestones(project_id, on_chain_index);
```

### V2 Completion Flow

For projects with `uses_onchain_milestones = true`:
1. Client calls `approveMilestone(contractProjectId, milestoneIndex)` directly on-chain
2. Contract atomically calculates fee, splits payment to developers, sends fee to treasury
3. Contract emits `MilestoneApproved` event
4. Backend event listener catches event and updates DB: `status='completed'`, `payment_amount`, `platform_fee`, `paid_at`, `completed_at`
5. If all milestones completed, contract auto-sets project state to Completed

Backend milestone approval endpoint returns 400 for V2 projects with message "Use on-chain approveMilestone for V2 projects".

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`, `capabilities/escrow-management/spec.md`
- **APIs**: `api/project-management/spec.md`
- **Data Models**: `data-models/project/schema.md`
- **RFCs**: `docs/RFC/RFC-008-onchain-milestones.md`
