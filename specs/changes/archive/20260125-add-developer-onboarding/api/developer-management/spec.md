# Developer Management API

## Purpose

Provides REST API endpoints for developer registration, profile management, and querying developer information.

## Base Configuration

**Base URL**: `/api/developers`
**Authentication**: Wallet signature required for write operations, optional for reads

## Endpoints

### POST /api/developers

Create a new developer profile with wallet signature verification.

**Authentication**: Wallet signature required

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Welcome to 0xElite!\n\nPlease sign this message to verify your wallet ownership.\n\nWallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\nTimestamp: 1706184000000",
  "signature": "0x8f3c7e2a1b4d5c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f",
  "email": "alice@example.com",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js", "DeFi"],
  "bio": "Full-stack Web3 developer with 3 years of experience in DeFi protocols.",
  "hourlyRate": 120
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Ethereum wallet address (checksummed) |
| `message` | string | Yes | Message that was signed |
| `signature` | string | Yes | Signature of the message |
| `email` | string | Yes | Developer email address |
| `githubUsername` | string | No | GitHub username (optional) |
| `skills` | string[] | Yes | Array of skill tags (1-10 items) |
| `bio` | string | No | Biography (max 500 characters) |
| `hourlyRate` | number | No | Hourly rate in USD |

**Responses**:

#### 201 Created - Success

Developer profile created successfully.

```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "email": "alice@example.com",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js", "DeFi"],
  "bio": "Full-stack Web3 developer with 3 years of experience in DeFi protocols.",
  "hourlyRate": 120,
  "availability": "available",
  "stakeAmount": "0",
  "status": "pending",
  "createdAt": "2024-01-25T10:00:00Z",
  "updatedAt": "2024-01-25T10:00:00Z"
}
```

#### 400 Bad Request - Validation Error

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
    },
    {
      "field": "skills",
      "message": "Must select 1-10 skills"
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

#### 409 Conflict - Duplicate Entry

```json
{
  "error": "DUPLICATE_ENTRY",
  "message": "A developer with this wallet address already exists"
}
```

OR

```json
{
  "error": "DUPLICATE_ENTRY",
  "message": "This email is already in use"
}
```

OR

```json
{
  "error": "DUPLICATE_ENTRY",
  "message": "This GitHub account is already linked to another developer"
}
```

---

### GET /api/developers/:address

Retrieve a developer's public profile.

**Authentication**: None (public endpoint)

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `address` | string | Ethereum wallet address |

**Query Parameters**: None

**Responses**:

#### 200 OK - Success (Public View)

```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js", "DeFi"],
  "bio": "Full-stack Web3 developer with 3 years of experience in DeFi protocols.",
  "hourlyRate": 120,
  "availability": "available",
  "stakeAmount": "150.000000",
  "status": "active",
  "projectsCompleted": 12,
  "reputationScore": 245,
  "onTimeRate": 0.95,
  "createdAt": "2024-01-25T10:00:00Z"
}
```

**Note**: Email is not included in public view.

#### 200 OK - Success (Owner View)

When the requesting wallet address matches the profile owner:

```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "email": "alice@example.com",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js", "DeFi"],
  "bio": "Full-stack Web3 developer with 3 years of experience in DeFi protocols.",
  "hourlyRate": 120,
  "availability": "available",
  "stakeAmount": "150.000000",
  "status": "active",
  "projectsCompleted": 12,
  "reputationScore": 245,
  "onTimeRate": 0.95,
  "createdAt": "2024-01-25T10:00:00Z",
  "updatedAt": "2024-01-25T10:00:00Z"
}
```

**Note**: Email is included when viewing own profile.

#### 404 Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Developer not found"
}
```

---

### PUT /api/developers/:address

Update a developer's profile (owner only).

**Authentication**: Wallet signature required

**Path Parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `address` | string | Ethereum wallet address |

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Update profile for 0xElite\n\nWallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\nTimestamp: 1706270400000",
  "signature": "0x9a4c8e3b2d5f6a7e8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
  "email": "alice.new@example.com",
  "skills": ["Solidity", "Rust", "React", "DeFi", "ZK-Proofs"],
  "bio": "Senior Web3 developer specializing in DeFi and zero-knowledge protocols.",
  "hourlyRate": 150,
  "availability": "busy"
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Must match path parameter |
| `message` | string | Yes | Message that was signed |
| `signature` | string | Yes | Signature of the message |
| `email` | string | No | Updated email |
| `skills` | string[] | No | Updated skills |
| `bio` | string | No | Updated bio |
| `hourlyRate` | number | No | Updated hourly rate |
| `availability` | string | No | Updated availability status |

**Notes**:
- `githubUsername` cannot be updated (locked after registration)
- Only provide fields you want to update

**Responses**:

#### 200 OK - Success

```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "email": "alice.new@example.com",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "Rust", "React", "DeFi", "ZK-Proofs"],
  "bio": "Senior Web3 developer specializing in DeFi and zero-knowledge protocols.",
  "hourlyRate": 150,
  "availability": "busy",
  "stakeAmount": "150.000000",
  "status": "active",
  "createdAt": "2024-01-25T10:00:00Z",
  "updatedAt": "2024-01-26T14:30:00Z"
}
```

#### 400 Bad Request - Validation Error

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format"
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

#### 403 Forbidden - Not Owner

```json
{
  "error": "FORBIDDEN",
  "message": "You can only edit your own profile"
}
```

#### 404 Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Developer not found"
}
```

#### 409 Conflict - Duplicate Email

```json
{
  "error": "DUPLICATE_ENTRY",
  "message": "This email is already in use"
}
```

---

### GET /api/developers

List developers with filtering and pagination.

**Authentication**: None (public endpoint)

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page (max 100) |
| `skills` | string | - | Comma-separated skill tags to filter by |
| `availability` | string | - | Filter by availability status |
| `status` | string | active | Filter by account status |
| `sort` | string | createdAt | Sort field (createdAt, reputationScore) |
| `order` | string | desc | Sort order (asc, desc) |

**Responses**:

#### 200 OK - Success

```json
{
  "data": [
    {
      "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
      "githubUsername": "alice-dev",
      "skills": ["Solidity", "React", "Node.js", "DeFi"],
      "bio": "Full-stack Web3 developer with 3 years of experience in DeFi protocols.",
      "hourlyRate": 120,
      "availability": "available",
      "stakeAmount": "150.000000",
      "status": "active",
      "projectsCompleted": 12,
      "reputationScore": 245,
      "createdAt": "2024-01-25T10:00:00Z"
    },
    {
      "walletAddress": "0x8ba1f109551bd432803012645ac136ddd64dba72",
      "githubUsername": "bob-blockchain",
      "skills": ["Rust", "Solana", "Smart Contracts"],
      "bio": "Solana ecosystem developer.",
      "hourlyRate": 100,
      "availability": "available",
      "stakeAmount": "150.000000",
      "status": "active",
      "projectsCompleted": 8,
      "reputationScore": 180,
      "createdAt": "2024-01-20T15:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

#### 400 Bad Request - Invalid Query Parameters

```json
{
  "error": "INVALID_QUERY",
  "message": "Invalid query parameters",
  "details": [
    {
      "field": "limit",
      "message": "Limit cannot exceed 100"
    }
  ]
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `INVALID_SIGNATURE` | 401 | Wallet signature verification failed |
| `FORBIDDEN` | 403 | Action not permitted for this user |
| `NOT_FOUND` | 404 | Developer not found |
| `DUPLICATE_ENTRY` | 409 | Wallet, email, or GitHub already exists |
| `INVALID_QUERY` | 400 | Invalid query parameters |

## Related Specs

- **Capabilities**: `capabilities/developer-onboarding/spec.md`
- **Data Models**: `data-models/developer/schema.md`
- **Architecture**: `architecture/stake-vault-contract/spec.md`, `architecture/event-sync-system/spec.md`
