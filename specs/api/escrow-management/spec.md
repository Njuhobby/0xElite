# Escrow Management API

## Purpose

Provides REST API endpoints for depositing funds into escrow, viewing escrow status, and accessing payment history.

## Base Configuration

**Base URL**: `/api/v1`
**Authentication**: Wallet signature required for write operations

## Endpoints

## ADDED Endpoints

### POST /escrow/deposit

Deposit project funds into escrow contract (called during project creation flow).

**Authentication**: Required (client wallet signature)

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Deposit escrow for project on 0xElite\n\nWallet: 0x742d35...\nProject ID: 550e8400-e29b-41d4-a716\nAmount: 5000 USDC\nTimestamp: 1706198400000",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 5000,
  "txHash": "0x1234567890abcdef..."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Client wallet address |
| `message` | string | Yes | Signed message for verification |
| `signature` | string | Yes | Wallet signature of message |
| `projectId` | UUID | Yes | Project to deposit for |
| `amount` | number | Yes | USDC amount to deposit |
| `txHash` | string | Yes | Blockchain transaction hash of deposit |

**Responses**:

#### 200 OK - Success

Escrow deposit recorded successfully.

```json
{
  "escrow": {
    "id": "660f9400-f39c-51e5-b827-557766551111",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "totalDeposited": 5000,
    "totalReleased": 0,
    "escrowBalance": 5000,
    "isFrozen": false,
    "depositTxHash": "0x1234567890abcdef...",
    "createdAt": "2024-01-25T10:00:00Z"
  },
  "project": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "active",
    "escrowDeposited": true
  }
}
```

#### 400 Bad Request - Validation Error

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid deposit request",
  "details": [
    {
      "field": "amount",
      "message": "Amount must equal project total budget (5000 USDC)"
    }
  ]
}
```

#### 401 Unauthorized - Invalid Signature

```json
{
  "error": "INVALID_SIGNATURE",
  "message": "Wallet signature verification failed"
}
```

#### 403 Forbidden - Not Project Owner

```json
{
  "error": "FORBIDDEN",
  "message": "Only project client can deposit escrow"
}
```

#### 409 Conflict - Already Deposited

```json
{
  "error": "ESCROW_EXISTS",
  "message": "Escrow already deposited for this project"
}
```

### GET /escrow/:projectId

Get escrow status and balance for a project.

**Authentication**: Optional (public info with limited details)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `projectId` | UUID | Project ID to query |

**Responses**:

#### 200 OK - Success

```json
{
  "escrow": {
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "totalDeposited": 5000,
    "totalReleased": 3000,
    "escrowBalance": 2000,
    "isFrozen": false,
    "createdAt": "2024-01-25T10:00:00Z",
    "updatedAt": "2024-01-26T15:30:00Z"
  },
  "breakdown": {
    "milestonesCompleted": 2,
    "totalMilestones": 4,
    "developerPayments": 2550,
    "platformFees": 450,
    "pendingMilestones": 2000
  }
}
```

#### 404 Not Found - No Escrow

```json
{
  "error": "NOT_FOUND",
  "message": "No escrow found for this project"
}
```

### GET /escrow/:projectId/history

Get complete payment history for a project's escrow.

**Authentication**: Optional (full details require client/developer auth)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `projectId` | UUID | Project ID to query |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | string | No | Filter by transaction type (deposit, release, fee_collection, freeze, etc.) |
| `limit` | number | No | Max records to return (default: 100, max: 500) |
| `offset` | number | No | Pagination offset (default: 0) |

**Responses**:

#### 200 OK - Success

```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "total": 5,
  "limit": 100,
  "offset": 0,
  "history": [
    {
      "id": "770g0500-g40d-62f6-c938-668877662222",
      "transactionType": "deposit",
      "amount": 5000,
      "fromAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "toAddress": "0xEscrowVaultContractAddress...",
      "txHash": "0x1234567890abcdef...",
      "blockNumber": 123456789,
      "blockTimestamp": "2024-01-25T10:00:00Z",
      "notes": "Initial project funding"
    },
    {
      "id": "880h1600-h51e-73g7-d049-779988773333",
      "transactionType": "release",
      "amount": 1500,
      "fromAddress": "0xEscrowVaultContractAddress...",
      "toAddress": "0xDeveloperWalletAddress...",
      "txHash": "0xabcdef1234567890...",
      "blockNumber": 123457890,
      "blockTimestamp": "2024-01-26T15:30:00Z",
      "milestoneId": "660f9400-f39c-51e5-b827-557766551111",
      "platformFee": 225,
      "developerPayment": 1275,
      "notes": "Milestone 1: UI/UX Design completed"
    },
    {
      "id": "990i2700-i62f-84h8-e150-880099884444",
      "transactionType": "fee_collection",
      "amount": 225,
      "fromAddress": "0xEscrowVaultContractAddress...",
      "toAddress": "0xTreasuryAddress...",
      "txHash": "0xabcdef1234567890...",
      "blockNumber": 123457890,
      "blockTimestamp": "2024-01-26T15:30:00Z",
      "milestoneId": "660f9400-f39c-51e5-b827-557766551111",
      "platformFee": 225,
      "notes": "Platform fee for Milestone 1"
    }
  ]
}
```

#### 404 Not Found - No History

```json
{
  "error": "NOT_FOUND",
  "message": "No payment history found for this project"
}
```

### POST /escrow/freeze

Freeze escrow to prevent releases (admin/dispute system only).

**Authentication**: Required (admin signature or dispute contract)

**Request**:

```json
{
  "address": "0xAdminOrDisputeContractAddress",
  "message": "Freeze escrow for dispute\n\nWallet: 0x...\nProject ID: 550e8400...\nReason: Dispute #42\nTimestamp: 1706198400000",
  "signature": "0x...",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "Dispute filed by developer - milestone deliverables contested"
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Admin/dispute contract address |
| `message` | string | Yes | Signed message |
| `signature` | string | Yes | Wallet signature |
| `projectId` | UUID | Yes | Project to freeze |
| `reason` | string | Yes | Reason for freezing |

**Responses**:

#### 200 OK - Success

```json
{
  "escrow": {
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "isFrozen": true,
    "frozenAt": "2024-01-27T10:00:00Z",
    "frozenBy": "0xAdminOrDisputeContractAddress"
  },
  "message": "Escrow frozen successfully"
}
```

#### 401 Unauthorized

```json
{
  "error": "UNAUTHORIZED",
  "message": "Only admins or dispute contract can freeze escrow"
}
```

#### 409 Conflict - Already Frozen

```json
{
  "error": "ALREADY_FROZEN",
  "message": "Escrow is already frozen"
}
```

### POST /escrow/unfreeze

Unfreeze escrow after dispute resolution (admin/dispute system only).

**Authentication**: Required (admin signature or dispute contract)

**Request**:

```json
{
  "address": "0xAdminOrDisputeContractAddress",
  "message": "Unfreeze escrow after resolution\n\nWallet: 0x...\nProject ID: 550e8400...\nDispute ID: 42\nTimestamp: 1706198400000",
  "signature": "0x...",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "resolutionNotes": "Dispute resolved in favor of client"
}
```

**Responses**:

#### 200 OK - Success

```json
{
  "escrow": {
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "isFrozen": false,
    "frozenAt": null,
    "frozenBy": null
  },
  "message": "Escrow unfrozen successfully"
}
```

#### 401 Unauthorized

```json
{
  "error": "UNAUTHORIZED",
  "message": "Only admins or dispute contract can unfreeze escrow"
}
```

#### 409 Conflict - Not Frozen

```json
{
  "error": "NOT_FROZEN",
  "message": "Escrow is not currently frozen"
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_SIGNATURE` | 401 | Wallet signature verification failed |
| `UNAUTHORIZED` | 401 | Missing or invalid authorization |
| `FORBIDDEN` | 403 | User not allowed to perform action |
| `NOT_FOUND` | 404 | Escrow or project not found |
| `ESCROW_EXISTS` | 409 | Escrow already exists for project |
| `ALREADY_FROZEN` | 409 | Escrow already frozen |
| `NOT_FROZEN` | 409 | Escrow not frozen |
| `INSUFFICIENT_BALANCE` | 422 | Escrow balance too low for release |

## Related Specs

- **Capabilities**: `capabilities/escrow-management/spec.md`
- **Data Models**: `data-models/escrow/schema.md`, `data-models/payment-history/schema.md`
