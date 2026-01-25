# Project Management API

## Purpose

Provides REST API endpoints for creating and managing projects, milestones, and client profiles with automatic developer assignment.

## Base Configuration

**Base URL**: `/api/v1`
**Authentication**: Wallet signature required for all write operations

## Endpoints


### POST /projects

Create a new project with milestones.

**Authentication**: Required (client wallet signature)

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Create project on 0xElite\n\nWallet: 0x742d35...\nTimestamp: 1706198400000",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "title": "DeFi Dashboard Frontend",
  "description": "Build a responsive React frontend for multi-chain DeFi portfolio tracking",
  "requiredSkills": ["React", "TypeScript", "Web3.js", "Tailwind CSS"],
  "totalBudget": 5000,
  "milestones": [
    {
      "title": "UI/UX Design & Setup",
      "description": "Design mockups and set up React project structure",
      "deliverables": ["Figma mockups", "Initialized React app with routing"],
      "budget": 1000
    },
    {
      "title": "Wallet Connection & Chain Switching",
      "description": "Implement wallet connection with multi-chain support",
      "deliverables": ["Web3 wallet integration", "Chain switching UI"],
      "budget": 1500
    },
    {
      "title": "Portfolio Display & Token Balances",
      "description": "Fetch and display user's token balances across chains",
      "deliverables": ["Token balance fetching", "Portfolio dashboard UI"],
      "budget": 1500
    },
    {
      "title": "Testing & Deployment",
      "description": "Write tests and deploy to production",
      "deliverables": ["Unit and integration tests", "Deployed application URL"],
      "budget": 1000
    }
  ]
}
```

**Request Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | Yes | Client wallet address |
| `message` | string | Yes | Signed message for verification |
| `signature` | string | Yes | Wallet signature of message |
| `title` | string | Yes | Project title (max 200 chars) |
| `description` | string | Yes | Detailed project description |
| `requiredSkills` | string[] | Yes | Array of required skills (min 1, max 10) |
| `totalBudget` | number | Yes | Total project budget in USDC (min 100) |
| `milestones` | Milestone[] | Yes | Array of milestones (min 1) |

**Milestone Object**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Milestone title (max 200 chars) |
| `description` | string | Yes | Milestone description |
| `deliverables` | string[] | Yes | Array of deliverable descriptions (min 1) |
| `budget` | number | Yes | Milestone budget in USDC (must sum to totalBudget) |

**Responses**:

#### 201 Created - Success

Project created and auto-assignment initiated.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "projectNumber": 1001,
  "clientAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "title": "DeFi Dashboard Frontend",
  "description": "Build a responsive React frontend for multi-chain DeFi portfolio tracking",
  "requiredSkills": ["React", "TypeScript", "Web3.js", "Tailwind CSS"],
  "totalBudget": "5000.000000",
  "status": "draft",
  "assignedDeveloper": null,
  "assignmentPending": true,
  "milestones": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "milestoneNumber": 1,
      "title": "UI/UX Design & Setup",
      "description": "Design mockups and set up React project structure",
      "deliverables": ["Figma mockups", "Initialized React app with routing"],
      "budget": "1000.000000",
      "status": "pending"
    }
  ],
  "createdAt": "2024-01-25T10:00:00Z",
  "message": "Project created successfully. Searching for available developers..."
}
```

#### 400 Bad Request - Validation Error

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "details": [
    {
      "field": "milestones",
      "message": "Milestone budgets must sum to total project budget. Expected: 5000, Got: 4500"
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

### GET /projects/:id

Get project details by ID.

**Authentication**: Optional (shows different data based on role)

**Query Parameters**: None

**Headers**:
- `X-Wallet-Address` (optional): For role-based data visibility

**Responses**:

#### 200 OK - Success (Public View)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "projectNumber": 1001,
  "title": "DeFi Dashboard Frontend",
  "description": "Build a responsive React frontend for multi-chain DeFi portfolio tracking",
  "requiredSkills": ["React", "TypeScript", "Web3.js", "Tailwind CSS"],
  "totalBudget": "5000.000000",
  "status": "active",
  "assignedDeveloper": {
    "address": "0x123...",
    "githubUsername": "alice-dev",
    "skills": ["React", "TypeScript", "Solidity"]
  },
  "milestonesCompleted": 2,
  "milestonesTotal": 4,
  "createdAt": "2024-01-25T10:00:00Z",
  "startedAt": "2024-01-25T12:00:00Z"
}
```

#### 200 OK - Success (Client View - owns project)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "projectNumber": 1001,
  "clientAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "title": "DeFi Dashboard Frontend",
  "description": "Build a responsive React frontend for multi-chain DeFi portfolio tracking",
  "requiredSkills": ["React", "TypeScript", "Web3.js", "Tailwind CSS"],
  "totalBudget": "5000.000000",
  "status": "active",
  "assignedDeveloper": {
    "address": "0x123...",
    "email": "alice@example.com",
    "githubUsername": "alice-dev"
  },
  "milestones": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "milestoneNumber": 1,
      "title": "UI/UX Design & Setup",
      "status": "completed",
      "budget": "1000.000000",
      "completedAt": "2024-01-26T14:00:00Z",
      "deliverableUrls": ["https://figma.com/file/abc", "https://github.com/user/repo/commit/123"]
    }
  ],
  "createdAt": "2024-01-25T10:00:00Z"
}
```

#### 404 Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "Project not found"
}
```

### PUT /projects/:id

Update project details (client only, draft projects only).

**Authentication**: Required (client signature, must be project owner)

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Update project on 0xElite\n\nWallet: 0x742d35...\nTimestamp: 1706198400000",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "title": "Updated Project Title",
  "description": "Updated description",
  "requiredSkills": ["React", "TypeScript", "Next.js"]
}
```

**Responses**:

#### 200 OK - Success

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Updated Project Title",
  "updatedAt": "2024-01-25T11:00:00Z"
}
```

#### 403 Forbidden - Cannot Edit Active Project

```json
{
  "error": "FORBIDDEN",
  "message": "Cannot edit project in 'active' status. Only draft projects can be edited."
}
```

### GET /projects

List projects with filtering and pagination.

**Authentication**: Optional

**Query Parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | all | Filter by status: draft, active, completed, disputed, all |
| `clientAddress` | string | - | Filter by client wallet address |
| `developerAddress` | string | - | Filter by assigned developer address |
| `skills` | string | - | Comma-separated skills to filter by |
| `limit` | number | 20 | Results per page (max 100) |
| `offset` | number | 0 | Pagination offset |
| `sortBy` | string | created_at | Sort field: created_at, total_budget, project_number |
| `sortOrder` | string | desc | Sort order: asc, desc |

**Responses**:

#### 200 OK - Success

```json
{
  "projects": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "projectNumber": 1001,
      "title": "DeFi Dashboard Frontend",
      "requiredSkills": ["React", "TypeScript"],
      "totalBudget": "5000.000000",
      "status": "active",
      "assignedDeveloper": "0x123...",
      "createdAt": "2024-01-25T10:00:00Z"
    }
  ],
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

### POST /projects/:id/milestones

Add a milestone to a draft project.

**Authentication**: Required (client signature, must be project owner)

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Add milestone to project\n\nWallet: 0x742d35...\nTimestamp: 1706198400000",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "title": "Additional Feature",
  "description": "Add dark mode support",
  "deliverables": ["Dark mode toggle", "Theme persistence"],
  "budget": 500
}
```

**Responses**:

#### 201 Created - Success

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440005",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "milestoneNumber": 5,
  "title": "Additional Feature",
  "budget": "500.000000",
  "status": "pending",
  "createdAt": "2024-01-25T11:00:00Z"
}
```

#### 400 Bad Request - Budget Exceeded

```json
{
  "error": "BUDGET_EXCEEDED",
  "message": "Adding this milestone would exceed project budget. Project budget: 5000, Current milestone total: 4500, New milestone: 1000"
}
```

### PUT /milestones/:id

Update milestone status (client or developer based on action).

**Authentication**: Required (signature from client or assigned developer)

**Request (Developer submits for review)**:

```json
{
  "address": "0x123d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Submit milestone for review\n\nWallet: 0x123...\nTimestamp: 1706198400000",
  "signature": "0x9f4c8e3a2b5d6c7e...",
  "status": "pending_review",
  "deliverableUrls": [
    "https://github.com/user/repo/pull/42",
    "https://deploy-preview-42.netlify.app"
  ]
}
```

**Request (Client approves completion)**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Approve milestone completion\n\nWallet: 0x742...\nTimestamp: 1706198400000",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "status": "completed",
  "reviewNotes": "Great work! Deployment looks perfect."
}
```

**Responses**:

#### 200 OK - Success

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "completedAt": "2024-01-26T14:00:00Z",
  "updatedAt": "2024-01-26T14:00:00Z"
}
```

#### 403 Forbidden - Invalid Status Transition

```json
{
  "error": "INVALID_TRANSITION",
  "message": "Cannot transition from 'pending' to 'completed'. Developer must submit for review first."
}
```

### POST /clients

Create or update client profile.

**Authentication**: Required (client wallet signature)

**Request**:

```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Register client profile on 0xElite\n\nWallet: 0x742...\nTimestamp: 1706198400000",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "email": "founder@techstartup.io",
  "companyName": "TechStartup Inc.",
  "description": "Building the future of decentralized finance",
  "website": "https://techstartup.io"
}
```

**Responses**:

#### 201 Created - Success

```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "email": "founder@techstartup.io",
  "companyName": "TechStartup Inc.",
  "isRegistered": true,
  "projectsCreated": 0,
  "createdAt": "2024-01-25T10:00:00Z"
}
```

#### 400 Bad Request - Email Already Used

```json
{
  "error": "EMAIL_IN_USE",
  "message": "Email address already registered to another client"
}
```

### GET /clients/:address

Get client profile information.

**Authentication**: Optional

**Responses**:

#### 200 OK - Success

```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "companyName": "TechStartup Inc.",
  "description": "Building the future of decentralized finance",
  "website": "https://techstartup.io",
  "projectsCreated": 5,
  "projectsCompleted": 3,
  "totalSpent": "15000.000000",
  "reputationScore": "4.50",
  "createdAt": "2024-01-20T10:00:00Z"
}
```

Note: Email is hidden from public view, only visible to the client themselves.

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `BUDGET_EXCEEDED` | 400 | Milestone budgets exceed project budget |
| `INVALID_SIGNATURE` | 401 | Wallet signature verification failed |
| `UNAUTHORIZED` | 401 | User not authorized for this action |
| `FORBIDDEN` | 403 | Action not allowed in current state |
| `INVALID_TRANSITION` | 403 | Invalid status transition |
| `NOT_FOUND` | 404 | Project/milestone not found |
| `EMAIL_IN_USE` | 400 | Email already registered |

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`
- **Data Models**: `data-models/project/schema.md`, `data-models/milestone/schema.md`, `data-models/client/schema.md`
- **Architecture**: `architecture/matching-algorithm/spec.md`
