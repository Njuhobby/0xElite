# Project

## Purpose

Stores project information including client details, budget allocation, required skills, milestone structure, and project lifecycle status.

## Schema



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

## Validation Rules

### Rule: Budget Allocation

- **MUST** have `total_budget > 0`
- **MUST** have at least one milestone
- **MUST** ensure sum of milestone budgets equals `total_budget`

### Rule: Status Transitions

- **MUST NOT** transition from `completed` to any other status
- **MUST NOT** transition from `cancelled` to any other status
- **SHOULD** transition to `active` only when `assigned_developer` is set

### Rule: Required Skills

- **MUST** have at least one required skill
- **MUST** use skills from predefined skill list (same as developer skills)

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`
- **APIs**: `api/project-management/spec.md`
- **Data Models**: `data-models/milestone/schema.md`, `data-models/client/schema.md`
