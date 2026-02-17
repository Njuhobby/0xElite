# Review Management API

## Purpose

Provides REST API endpoints for submitting, retrieving, and editing reviews and ratings for developers and clients.

## Base Configuration

**Base URL**: `/api/reviews`
**Authentication**: Wallet signature required for POST/PUT, optional for GET

## Endpoints

## ADDED Endpoints

### POST /api/reviews

Submit a new review for a developer or client after project completion.

**Authentication**: Required (wallet signature)

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Submit review for project 123\n\nWallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\nTimestamp: 1706198400000",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "rating": 5,
  "comment": "Excellent developer, delivered high-quality work ahead of schedule. Great communication throughout the project."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Wallet address of reviewer (must be client or developer on project) |
| `message` | string | Yes | Message that was signed |
| `signature` | string | Yes | Wallet signature of message |
| `projectId` | UUID | Yes | Project being reviewed |
| `rating` | integer | Yes | Star rating (1-5) |
| `comment` | string | No | Review text (max 1000 characters) |

**Responses**:

#### 201 Created - Success

Review successfully created.

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "reviewerAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "revieweeAddress": "0x8f3c7e2a1b4d5c6e9a0b2d4f6e8c1a3b5d7e9f1c",
  "reviewerType": "client",
  "rating": 5,
  "comment": "Excellent developer, delivered high-quality work ahead of schedule. Great communication throughout the project.",
  "createdAt": "2024-01-26T10:00:00Z",
  "updatedAt": "2024-01-26T10:00:00Z",
  "canEdit": true
}
```

#### 400 Bad Request - Validation Error

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid review data",
  "details": [
    {
      "field": "rating",
      "message": "Rating must be between 1 and 5"
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

#### 403 Forbidden - Unauthorized Reviewer

```json
{
  "error": "UNAUTHORIZED",
  "message": "You are not authorized to review this project"
}
```

#### 404 Not Found - Project Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Project not found"
}
```

#### 409 Conflict - Review Already Exists

```json
{
  "error": "REVIEW_ALREADY_EXISTS",
  "message": "You have already reviewed this project"
}
```

#### 422 Unprocessable Entity - Project Not Completed

```json
{
  "error": "PROJECT_NOT_COMPLETED",
  "message": "Can only review completed projects"
}
```

### GET /api/reviews/developer/:address

Get all reviews for a specific developer.

**Authentication**: Optional

**Path Parameters**:
- `address` (string, required): Developer wallet address

**Query Parameters**:
- `limit` (integer, optional): Number of reviews per page (default: 20, max: 100)
- `offset` (integer, optional): Pagination offset (default: 0)
- `sort` (string, optional): Sort order - "newest" or "oldest" (default: "newest")

**Responses**:

#### 200 OK - Success

```json
{
  "developerAddress": "0x8f3c7e2a1b4d5c6e9a0b2d4f6e8c1a3b5d7e9f1c",
  "averageRating": 4.75,
  "totalReviews": 8,
  "ratingDistribution": {
    "5": 6,
    "4": 2,
    "3": 0,
    "2": 0,
    "1": 0
  },
  "reviews": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "projectId": "550e8400-e29b-41d4-a716-446655440000",
      "projectTitle": "DeFi Dashboard Frontend",
      "reviewerAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "reviewerType": "client",
      "rating": 5,
      "comment": "Excellent developer, delivered high-quality work ahead of schedule.",
      "createdAt": "2024-01-26T10:00:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440002",
      "projectId": "550e8400-e29b-41d4-a716-446655440011",
      "projectTitle": "NFT Marketplace Smart Contracts",
      "reviewerAddress": "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      "reviewerType": "client",
      "rating": 4,
      "comment": "Good work, minor delays but overall satisfied.",
      "createdAt": "2024-01-20T14:30:00Z"
    }
  ],
  "pagination": {
    "total": 8,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

#### 404 Not Found - Developer Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Developer not found"
}
```

### GET /api/reviews/client/:address

Get all reviews for a specific client.

**Authentication**: Optional

**Path Parameters**:
- `address` (string, required): Client wallet address

**Query Parameters**:
- `limit` (integer, optional): Number of reviews per page (default: 20, max: 100)
- `offset` (integer, optional): Pagination offset (default: 0)
- `sort` (string, optional): Sort order - "newest" or "oldest" (default: "newest")

**Responses**:

#### 200 OK - Success

```json
{
  "clientAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "averageRating": 4.5,
  "totalReviews": 4,
  "ratingDistribution": {
    "5": 2,
    "4": 2,
    "3": 0,
    "2": 0,
    "1": 0
  },
  "reviews": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440003",
      "projectId": "550e8400-e29b-41d4-a716-446655440000",
      "projectTitle": "DeFi Dashboard Frontend",
      "reviewerAddress": "0x8f3c7e2a1b4d5c6e9a0b2d4f6e8c1a3b5d7e9f1c",
      "reviewerType": "developer",
      "rating": 5,
      "comment": "Great client, clear requirements and prompt payment.",
      "createdAt": "2024-01-26T11:00:00Z"
    }
  ],
  "pagination": {
    "total": 4,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

#### 404 Not Found - Client Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Client not found"
}
```

### GET /api/reviews/project/:projectId

Get both reviews for a specific project (client's review of developer + developer's review of client).

**Authentication**: Optional

**Path Parameters**:
- `projectId` (UUID, required): Project ID

**Responses**:

#### 200 OK - Success

```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "projectTitle": "DeFi Dashboard Frontend",
  "clientAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "developerAddress": "0x8f3c7e2a1b4d5c6e9a0b2d4f6e8c1a3b5d7e9f1c",
  "reviews": {
    "clientReview": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "reviewerAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "revieweeAddress": "0x8f3c7e2a1b4d5c6e9a0b2d4f6e8c1a3b5d7e9f1c",
      "rating": 5,
      "comment": "Excellent developer, delivered high-quality work ahead of schedule.",
      "createdAt": "2024-01-26T10:00:00Z"
    },
    "developerReview": {
      "id": "770e8400-e29b-41d4-a716-446655440003",
      "reviewerAddress": "0x8f3c7e2a1b4d5c6e9a0b2d4f6e8c1a3b5d7e9f1c",
      "revieweeAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "rating": 5,
      "comment": "Great client, clear requirements and prompt payment.",
      "createdAt": "2024-01-26T11:00:00Z"
    }
  }
}
```

**Note**: If only one side has reviewed, the other review will be `null`.

#### 404 Not Found - Project Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Project not found"
}
```

### PUT /api/reviews/:id

Edit an existing review (within 7 days of submission).

**Authentication**: Required (wallet signature, must be original reviewer)

**Path Parameters**:
- `id` (UUID, required): Review ID

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Edit review 660e8400-e29b-41d4-a716-446655440001\n\nWallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\nTimestamp: 1706284800000",
  "signature": "0x9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
  "rating": 4,
  "comment": "Updated review: Good developer, minor communication issues but delivered quality work."
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Wallet address of reviewer (must match original reviewer) |
| `message` | string | Yes | Message that was signed |
| `signature` | string | Yes | Wallet signature of message |
| `rating` | integer | No | Updated star rating (1-5) |
| `comment` | string | No | Updated review text (max 1000 characters, null to remove) |

**Responses**:

#### 200 OK - Success

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "reviewerAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "revieweeAddress": "0x8f3c7e2a1b4d5c6e9a0b2d4f6e8c1a3b5d7e9f1c",
  "reviewerType": "client",
  "rating": 4,
  "comment": "Updated review: Good developer, minor communication issues but delivered quality work.",
  "createdAt": "2024-01-26T10:00:00Z",
  "updatedAt": "2024-01-27T15:30:00Z",
  "canEdit": true
}
```

#### 400 Bad Request - Validation Error

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid review data",
  "details": [
    {
      "field": "rating",
      "message": "Rating must be between 1 and 5"
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

#### 403 Forbidden - Not Original Reviewer

```json
{
  "error": "FORBIDDEN",
  "message": "Only the original reviewer can edit this review"
}
```

#### 404 Not Found - Review Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Review not found"
}
```

#### 422 Unprocessable Entity - Edit Window Expired

```json
{
  "error": "EDIT_WINDOW_EXPIRED",
  "message": "Reviews can only be edited within 7 days of submission"
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_SIGNATURE` | 401 | Wallet signature verification failed |
| `UNAUTHORIZED` | 403 | Not authorized to review this project |
| `FORBIDDEN` | 403 | Not authorized to edit this review |
| `NOT_FOUND` | 404 | Project, developer, client, or review not found |
| `REVIEW_ALREADY_EXISTS` | 409 | Duplicate review for same project |
| `PROJECT_NOT_COMPLETED` | 422 | Can only review completed projects |
| `EDIT_WINDOW_EXPIRED` | 422 | Review edit window (7 days) has expired |

## Related Specs

- **Capabilities**: `capabilities/review-management/spec.md`
- **Data Models**: `data-models/review/schema.md`, `data-models/developer/schema.md`, `data-models/client/schema.md`
