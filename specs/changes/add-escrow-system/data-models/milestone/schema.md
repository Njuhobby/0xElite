# Milestone

## Purpose

Represents individual deliverables within a project, each with its own budget, deliverables, completion status, and payment tracking.

## Schema

## MODIFIED Entities

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
