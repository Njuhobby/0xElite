# Dispute Management API

## Purpose

Provides REST API endpoints for creating disputes, submitting evidence, casting votes, and resolving disputes in the DAO arbitration system.

## Base Configuration

**Base URL**: `/api/disputes`
**Authentication**: Wallet-based signature verification (same pattern as existing APIs)

## Endpoints

## ADDED Endpoints

### POST /

Create a new dispute on a project. Initiates on-chain transaction to freeze escrow and pay arbitration fee.

**Authentication**: Required (wallet signature)

**Request**:

```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "evidenceUri": "ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
  "message": "Create dispute for project 550e8400...",
  "signature": "0x1234..."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string (UUID) | Yes | ID of the project to dispute |
| `evidenceUri` | string | Yes | IPFS CID of the evidence document (PDF/DOCX/MD) |
| `message` | string | Yes | Signed message for authentication |
| `signature` | string | Yes | Wallet signature |

**Responses**:

#### 201 Created - Success

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "disputeNumber": 1,
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "open",
  "initiatorAddress": "0xabc...",
  "initiatorRole": "client",
  "evidenceDeadline": "2026-03-01T12:00:00Z",
  "arbitrationFee": "50.000000",
  "creationTxHash": "0xdef..."
}
```

#### 400 Bad Request

```json
{
  "error": "Project already has an active dispute"
}
```

#### 403 Forbidden

```json
{
  "error": "Only the project client or assigned developer can file a dispute"
}
```

### GET /:id

Get dispute details including evidence, voting status, and resolution outcome.

**Authentication**: Optional (provides voter-specific info if authenticated)

**Responses**:

#### 200 OK

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "disputeNumber": 1,
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "projectTitle": "DeFi Dashboard Redesign",
  "clientAddress": "0xabc...",
  "developerAddress": "0xdef...",
  "initiatorAddress": "0xabc...",
  "initiatorRole": "client",
  "status": "voting",
  "clientEvidenceUri": "ipfs://QmClient...",
  "developerEvidenceUri": "ipfs://QmDev...",
  "evidenceDeadline": "2026-03-01T12:00:00Z",
  "votingDeadline": "2026-03-06T12:00:00Z",
  "clientVoteWeight": "125000.000000",
  "developerVoteWeight": "80000.000000",
  "totalVoteWeight": "205000.000000",
  "quorumRequired": "250000.000000",
  "quorumReached": false,
  "winner": null,
  "resolvedByOwner": false,
  "arbitrationFee": "50.000000",
  "createdAt": "2026-02-26T12:00:00Z",
  "resolvedAt": null,
  "hasVoted": true,
  "myVote": "client"
}
```

#### 404 Not Found

```json
{
  "error": "Dispute not found"
}
```

### GET /project/:projectId

Get the active or most recent dispute for a project.

**Authentication**: Optional

**Responses**:

#### 200 OK

Same format as GET /:id.

#### 404 Not Found

```json
{
  "error": "No dispute found for this project"
}
```

### PUT /:id/evidence

Submit or update evidence for a dispute during the evidence period.

**Authentication**: Required (must be client or developer of the dispute)

**Request**:

```json
{
  "evidenceUri": "ipfs://QmNewEvidence...",
  "message": "Submit evidence for dispute 660e8400...",
  "signature": "0x1234..."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `evidenceUri` | string | Yes | IPFS CID of the updated evidence document |
| `message` | string | Yes | Signed message |
| `signature` | string | Yes | Wallet signature |

**Responses**:

#### 200 OK

```json
{
  "message": "Evidence submitted successfully",
  "evidenceUri": "ipfs://QmNewEvidence...",
  "txHash": "0xabc..."
}
```

#### 400 Bad Request

```json
{
  "error": "Evidence period has ended"
}
```

#### 403 Forbidden

```json
{
  "error": "Only dispute parties can submit evidence"
}
```

### POST /:id/vote

Cast a vote on a dispute during the voting period.

**Authentication**: Required (must be active developer with voting power)

**Request**:

```json
{
  "supportClient": true,
  "message": "Vote on dispute 660e8400...",
  "signature": "0x1234..."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `supportClient` | boolean | Yes | True to vote for client, false for developer |
| `message` | string | Yes | Signed message |
| `signature` | string | Yes | Wallet signature |

**Responses**:

#### 200 OK

```json
{
  "message": "Vote cast successfully",
  "voteWeight": "15000.000000",
  "supportClient": true,
  "txHash": "0xabc..."
}
```

#### 400 Bad Request - Not in voting period

```json
{
  "error": "Dispute is not in voting phase"
}
```

#### 400 Bad Request - Already voted

```json
{
  "error": "You have already voted on this dispute"
}
```

#### 403 Forbidden - No voting power

```json
{
  "error": "You have no voting power for this dispute"
}
```

#### 403 Forbidden - Party to dispute

```json
{
  "error": "Dispute parties cannot vote"
}
```

### GET /:id/votes

Get all votes cast on a dispute.

**Authentication**: Optional

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | integer | No | Page number (default 1) |
| `limit` | integer | No | Results per page (default 50) |

**Responses**:

#### 200 OK

```json
{
  "votes": [
    {
      "voterAddress": "0x123...",
      "supportClient": true,
      "voteWeight": "15000.000000",
      "votedAt": "2026-03-02T14:30:00Z"
    },
    {
      "voterAddress": "0x456...",
      "supportClient": false,
      "voteWeight": "8000.000000",
      "votedAt": "2026-03-02T15:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

### POST /:id/resolve

Trigger dispute resolution after voting period ends. Anyone can call this.

**Authentication**: Optional

**Responses**:

#### 200 OK

```json
{
  "message": "Dispute resolved",
  "winner": "client",
  "clientShare": "5000.000000",
  "developerShare": "0.000000",
  "resolvedByOwner": false,
  "txHash": "0xabc..."
}
```

#### 400 Bad Request - Voting not ended

```json
{
  "error": "Voting period has not ended yet"
}
```

#### 400 Bad Request - Quorum not met

```json
{
  "error": "Quorum not met. Owner must resolve this dispute."
}
```

### POST /:id/owner-resolve

Owner resolves a dispute when quorum was not met.

**Authentication**: Required (must be platform owner)

**Request**:

```json
{
  "clientWon": true,
  "message": "Owner resolve dispute 660e8400...",
  "signature": "0x1234..."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientWon` | boolean | Yes | True if ruling in favor of client |
| `message` | string | Yes | Signed message |
| `signature` | string | Yes | Wallet signature |

**Responses**:

#### 200 OK

```json
{
  "message": "Dispute resolved by owner",
  "winner": "client",
  "clientShare": "5000.000000",
  "developerShare": "0.000000",
  "resolvedByOwner": true,
  "txHash": "0xabc..."
}
```

#### 400 Bad Request

```json
{
  "error": "Quorum was met — use regular resolution"
}
```

#### 403 Forbidden

```json
{
  "error": "Only the platform owner can use this endpoint"
}
```

### GET /active

List all active disputes (open or voting) for the disputes dashboard.

**Authentication**: Optional

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | No | Filter by status: 'open', 'voting' |
| `page` | integer | No | Page number (default 1) |
| `limit` | integer | No | Results per page (default 20) |

**Responses**:

#### 200 OK

```json
{
  "disputes": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "disputeNumber": 1,
      "projectTitle": "DeFi Dashboard Redesign",
      "status": "voting",
      "initiatorRole": "client",
      "votingDeadline": "2026-03-06T12:00:00Z",
      "totalVoteWeight": "205000.000000",
      "quorumRequired": "250000.000000",
      "createdAt": "2026-02-26T12:00:00Z"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

### GET /my/:address

List disputes involving an address (as client, developer, or voter).

**Authentication**: Optional

**Query Parameters**:

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | No | Filter: 'party', 'voter', 'all' (default 'all') |
| `page` | integer | No | Page number (default 1) |
| `limit` | integer | No | Results per page (default 20) |

**Responses**:

#### 200 OK

```json
{
  "disputes": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "disputeNumber": 1,
      "projectTitle": "DeFi Dashboard Redesign",
      "status": "resolved",
      "myRole": "voter",
      "winner": "client",
      "createdAt": "2026-02-26T12:00:00Z",
      "resolvedAt": "2026-03-06T12:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `DISPUTE_EXISTS` | 400 | Project already has an active dispute |
| `NOT_PARTY` | 403 | Caller is not a client or developer of the project |
| `EVIDENCE_PERIOD_ENDED` | 400 | Evidence submission deadline has passed |
| `NOT_VOTING_PHASE` | 400 | Dispute is not in the voting phase |
| `ALREADY_VOTED` | 400 | Developer has already voted on this dispute |
| `NO_VOTING_POWER` | 403 | Developer has zero voting power at snapshot |
| `PARTY_CANNOT_VOTE` | 403 | Dispute parties cannot vote |
| `VOTING_NOT_ENDED` | 400 | Voting period has not ended |
| `QUORUM_NOT_MET` | 400 | Quorum not met, owner must resolve |
| `QUORUM_MET` | 400 | Quorum met, use regular resolution |
| `NOT_OWNER` | 403 | Only platform owner can call this |

## Related Specs

- **Capabilities**: `capabilities/dispute-resolution/spec.md`
- **Data Models**: `data-models/dispute/schema.md`, `data-models/dispute-vote/schema.md`
