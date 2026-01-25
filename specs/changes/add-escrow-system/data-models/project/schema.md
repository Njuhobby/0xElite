# Project

## Purpose

Stores project information including client details, budget allocation, required skills, milestone structure, project lifecycle status, and escrow tracking.

## Schema

## MODIFIED Entities

### Entity: Project

**Table**: `projects`

Add escrow tracking fields to existing projects table.

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `escrow_deposited` | BOOLEAN | NOT NULL, DEFAULT false | Whether initial escrow deposit has been made |
| `escrow_deposit_tx_hash` | VARCHAR(66) | NULL | Transaction hash of escrow deposit |
| `escrow_deposited_at` | TIMESTAMP | NULL | When escrow was deposited |

**Modified Status Transitions**:
```
draft → active now requires:
  1. Developer assigned (existing)
  2. Escrow deposited (NEW)

Cannot approve milestones unless:
  1. Project status = active
  2. Escrow balance >= milestone budget
  3. Escrow not frozen
```

**Business Rules Changes**:
- Project cannot transition to "active" without escrow deposit
- Escrow deposit must equal total_budget
- Project completion releases any remaining escrow to client

## Related Specs

- **Capabilities**: `capabilities/escrow-management/spec.md`, `capabilities/project-management/spec.md`
- **Data Models**: `data-models/escrow/schema.md`
