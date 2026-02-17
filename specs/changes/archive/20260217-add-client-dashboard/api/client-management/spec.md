# Client Management API

## Purpose

Provides REST API endpoints for client profile management, project operations from the client perspective, and dashboard data retrieval. Documents existing endpoints and additions needed for the client dashboard.

## Base Configuration

**Base URL**: `/api`
**Authentication**: Wallet signature verification (message + signature in request body or x-wallet-address header)

## Endpoints

## ADDED Endpoints

### GET /api/clients/:address/stats

Retrieve aggregated dashboard statistics for a client.

**Authentication**: None (public data)

**Path Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Client wallet address (0x...) |

**Responses**:

#### 200 OK - Success

```json
{
  "projectsCreated": 5,
  "projectsCompleted": 3,
  "totalSpent": "12.500000",
  "averageRating": 4.5,
  "totalReviews": 3,
  "activeProjects": 2,
  "totalMilestones": 15,
  "completedMilestones": 10
}
```

#### 404 Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Client not found"
}
```

### GET /api/projects/:id/escrow

Retrieve escrow status for a specific project.

**Authentication**: Required (x-wallet-address header, must be project client or assigned developer)

**Path Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Project UUID |

**Responses**:

#### 200 OK - Success

```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "totalBudget": "5.000000",
  "deposited": "5.000000",
  "released": "2.000000",
  "remaining": "3.000000",
  "milestones": [
    {
      "milestoneIndex": 0,
      "title": "Design Phase",
      "amount": "1.000000",
      "status": "completed",
      "releasedAt": "2024-01-20T10:00:00Z"
    },
    {
      "milestoneIndex": 1,
      "title": "Implementation",
      "amount": "2.000000",
      "status": "completed",
      "releasedAt": "2024-02-15T10:00:00Z"
    },
    {
      "milestoneIndex": 2,
      "title": "Testing & Deployment",
      "amount": "2.000000",
      "status": "in_progress",
      "releasedAt": null
    }
  ]
}
```

#### 403 Forbidden

```json
{
  "error": "FORBIDDEN",
  "message": "Not authorized to view escrow for this project"
}
```

#### 404 Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Project not found"
}
```

### POST /api/projects/:id/milestones/:index/approve

Client approves a milestone deliverable, triggering escrow release.

**Authentication**: Required (wallet signature, must be project client)

**Path Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Project UUID |
| `index` | number | Yes | Milestone index (0-based) |

**Request**:

```json
{
  "address": "0x1234...abcd",
  "message": "Approve milestone 1 for project 550e8400...",
  "signature": "0xabcd..."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Client wallet address |
| `message` | string | Yes | Signed message content |
| `signature` | string | Yes | Wallet signature |

**Responses**:

#### 200 OK - Success

```json
{
  "message": "Milestone approved successfully",
  "milestone": {
    "index": 1,
    "title": "Implementation",
    "status": "completed",
    "amount": "2.000000",
    "approvedAt": "2024-02-15T10:00:00Z"
  },
  "escrow": {
    "released": "3.000000",
    "remaining": "2.000000"
  }
}
```

#### 400 Bad Request

```json
{
  "error": "INVALID_STATUS",
  "message": "Milestone is not in pending_review status"
}
```

#### 401 Unauthorized

```json
{
  "error": "INVALID_SIGNATURE",
  "message": "Wallet signature verification failed"
}
```

#### 403 Forbidden

```json
{
  "error": "FORBIDDEN",
  "message": "Only the project client can approve milestones"
}
```

### POST /api/projects/:id/milestones/:index/reject

Client rejects a milestone deliverable with feedback.

**Authentication**: Required (wallet signature, must be project client)

**Path Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Project UUID |
| `index` | number | Yes | Milestone index (0-based) |

**Request**:

```json
{
  "address": "0x1234...abcd",
  "message": "Reject milestone 1 for project 550e8400...",
  "signature": "0xabcd...",
  "reason": "The implementation does not match the requirements. Missing feature X."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Client wallet address |
| `message` | string | Yes | Signed message content |
| `signature` | string | Yes | Wallet signature |
| `reason` | string | No | Rejection reason / feedback for developer |

**Responses**:

#### 200 OK - Success

```json
{
  "message": "Milestone rejected",
  "milestone": {
    "index": 1,
    "title": "Implementation",
    "status": "in_progress",
    "rejectionReason": "The implementation does not match the requirements. Missing feature X."
  }
}
```

#### 400 Bad Request

```json
{
  "error": "INVALID_STATUS",
  "message": "Milestone is not in pending_review status"
}
```

#### 401 Unauthorized

```json
{
  "error": "INVALID_SIGNATURE",
  "message": "Wallet signature verification failed"
}
```

#### 403 Forbidden

```json
{
  "error": "FORBIDDEN",
  "message": "Only the project client can reject milestones"
}
```

## Existing Endpoints (Referenced)

The following endpoints already exist and are used by the client dashboard without modification:

### POST /api/clients

Create or update client profile (upsert). Used for both registration and profile editing.

### GET /api/clients/:address

View client profile. Returns public data; includes email only when `x-wallet-address` matches.

### POST /api/projects

Create a new project. Requires client wallet signature. Supports title, description, required_skills, total_budget, and milestones.

### GET /api/projects

List projects with filtering. Supports `?clientAddress=` query parameter for client-specific project listing, plus `?status=` for status filtering.

### GET /api/projects/:id

View project details including milestones, assigned developer, and client information.

### PUT /api/projects/:id

Update a project in draft status. Validates client ownership.

### POST /api/reviews

Submit a review for a completed project.

### GET /api/reviews/project/:projectId

Get reviews for a specific project.

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_STATUS` | 400 | Resource not in required status for operation |
| `INVALID_SIGNATURE` | 401 | Wallet signature verification failed |
| `FORBIDDEN` | 403 | Not authorized for this operation |
| `NOT_FOUND` | 404 | Resource not found |
| `EMAIL_IN_USE` | 400 | Email already registered to another client |
| `INTERNAL_ERROR` | 500 | Server error |

## Related Specs

- **Capabilities**: `capabilities/client-dashboard/spec.md`
