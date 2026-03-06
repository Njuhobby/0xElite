# Unstake Notification API

## Purpose

Provides endpoints for developers to query their stake unlock status and history. Unlock execution itself is fully automated by the backend — these endpoints are read-only for developer visibility.

## Base Configuration

**Base URL**: `/api/developers`
**Authentication**: None (public read by address), but private fields only visible to wallet owner

## ADDED Endpoints

### GET /api/developers/:address/unlock-history

Returns the unlock history and current unlock status for a developer.

**Authentication**: None (public data — unlock history is non-sensitive)

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | Yes | Developer wallet address (0x-prefixed, 42 chars) |

**Query Parameters**: None

**Responses**:

#### 200 OK — Developer found

```json
{
  "developer": {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "projects_completed": 12,
    "unlock_tier": 2,
    "total_unlocked": "100.000000",
    "remaining_stake": "100.000000",
    "next_unlock": {
      "projects_needed": 15,
      "projects_remaining": 3,
      "amount": "50.000000"
    }
  },
  "history": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "amount": "50.000000",
      "from_tier": 0,
      "to_tier": 1,
      "tx_hash": "0xabc123...",
      "unlocked_at": "2026-02-15T14:30:00Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "amount": "50.000000",
      "from_tier": 1,
      "to_tier": 2,
      "tx_hash": "0xdef456...",
      "unlocked_at": "2026-03-01T09:15:00Z"
    }
  ]
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `developer.address` | string | Developer wallet address |
| `developer.projects_completed` | number | Total projects completed |
| `developer.unlock_tier` | number | Current tier (0-4) |
| `developer.total_unlocked` | string | Total USDC unlocked (decimal string, 6 decimals) |
| `developer.remaining_stake` | string | USDC still locked in StakeVault |
| `developer.next_unlock` | object \| null | Next unlock threshold info. `null` if fully unlocked (tier 4) |
| `developer.next_unlock.projects_needed` | number | Total projects needed for next tier |
| `developer.next_unlock.projects_remaining` | number | How many more projects to complete |
| `developer.next_unlock.amount` | string | USDC that will be unlocked |
| `history` | array | List of unlock events, ordered by `unlocked_at` descending |
| `history[].id` | string | UUID of unlock record |
| `history[].amount` | string | USDC unlocked in this event |
| `history[].from_tier` | number | Tier before unlock |
| `history[].to_tier` | number | Tier after unlock |
| `history[].tx_hash` | string | On-chain transaction hash |
| `history[].unlocked_at` | string | ISO 8601 timestamp |

#### 200 OK — Developer found, no unlocks yet

```json
{
  "developer": {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "projects_completed": 2,
    "unlock_tier": 0,
    "total_unlocked": "0.000000",
    "remaining_stake": "200.000000",
    "next_unlock": {
      "projects_needed": 5,
      "projects_remaining": 3,
      "amount": "50.000000"
    }
  },
  "history": []
}
```

#### 200 OK — Fully unlocked developer

```json
{
  "developer": {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "projects_completed": 25,
    "unlock_tier": 4,
    "total_unlocked": "200.000000",
    "remaining_stake": "0.000000",
    "next_unlock": null
  },
  "history": [
    { "amount": "50.000000", "from_tier": 0, "to_tier": 1, "tx_hash": "0x...", "unlocked_at": "..." },
    { "amount": "50.000000", "from_tier": 1, "to_tier": 2, "tx_hash": "0x...", "unlocked_at": "..." },
    { "amount": "50.000000", "from_tier": 2, "to_tier": 3, "tx_hash": "0x...", "unlocked_at": "..." },
    { "amount": "50.000000", "from_tier": 3, "to_tier": 4, "tx_hash": "0x...", "unlocked_at": "..." }
  ]
}
```

#### 404 Not Found — Developer does not exist

```json
{
  "error": "DEVELOPER_NOT_FOUND",
  "message": "No developer found with address 0x..."
}
```

## MODIFIED Endpoints

### GET /api/developers/:address

Add unlock fields to the existing developer profile response.

**Added response fields** (appended to existing response):

```json
{
  "...existing fields...",
  "unlockTier": 2,
  "totalUnlocked": "100.000000",
  "remainingStake": "100.000000",
  "lastUnlockAt": "2026-03-01T09:15:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `unlockTier` | number | Current unlock tier (0-4) |
| `totalUnlocked` | string | Cumulative USDC unlocked |
| `remainingStake` | string | USDC still locked |
| `lastUnlockAt` | string \| null | ISO 8601 timestamp of last unlock |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `DEVELOPER_NOT_FOUND` | 404 | No developer with the given address |

## Related Specs

- **Architecture**: `architecture/auto-unstake-system/spec.md`
- **Capabilities**: `capabilities/stake-unlock/spec.md`
- **Data Models**: `data-models/developer/schema.md`
