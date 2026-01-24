# 0xElite Backend API

Backend API server for the 0xElite platform.

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+

### Installation

```bash
npm install
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `RPC_URL`: Ethereum RPC endpoint (Alchemy/Infura)
- `STAKE_VAULT_ADDRESS`: Deployed StakeVault contract address
- `PORT`: API server port (default: 3001)
- `ALLOWED_ORIGINS`: CORS allowed origins (comma-separated)

### Database Setup

Run migrations to create database schema:

```bash
npm run migrate
```

## Development

Start API server with hot reload:

```bash
npm run dev
```

Start event listener service:

```bash
npm run dev:listener
```

**Note**: Both services should run simultaneously in separate terminals:
- API server (port 3001): Handles HTTP requests
- Event listener: Syncs blockchain events to database

## API Endpoints

### Developer Management

#### POST /api/developers
Create a new developer profile.

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Welcome to 0xElite!\\n\\nPlease sign this message...",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "email": "alice@example.com",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js"],
  "bio": "Full-stack Web3 developer",
  "hourlyRate": 120
}
```

**Response (201):**
```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "email": "alice@example.com",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js"],
  "bio": "Full-stack Web3 developer",
  "hourlyRate": 120,
  "availability": "available",
  "stakeAmount": "0",
  "status": "pending",
  "createdAt": "2024-01-25T10:00:00Z",
  "updatedAt": "2024-01-25T10:00:00Z"
}
```

#### GET /api/developers/:address
Get developer profile by wallet address.

**Response (200):**
```json
{
  "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js"],
  "bio": "Full-stack Web3 developer",
  "hourlyRate": 120,
  "availability": "available",
  "stakeAmount": "150.000000",
  "status": "active",
  "createdAt": "2024-01-25T10:00:00Z"
}
```

#### PUT /api/developers/:address
Update developer profile (owner only).

**Request:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Update profile for 0xElite\\n\\nWallet: 0x742d35Cc...",
  "signature": "0x9a4c8e3b2d5f6a...",
  "email": "alice.new@example.com",
  "skills": ["Solidity", "Rust", "React"],
  "availability": "busy"
}
```

#### GET /api/developers
List developers with pagination and filters.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `skills` (string): Comma-separated skills to filter by
- `availability` (string): Filter by availability status
- `status` (string): Filter by account status (default: active)
- `sort` (string): Sort field (createdAt, reputationScore)
- `order` (string): Sort order (asc, desc)

**Response (200):**
```json
{
  "data": [
    {
      "walletAddress": "0x742d35cc6634c0532925a3b844bc9e7595f0beb",
      "githubUsername": "alice-dev",
      "skills": ["Solidity", "React", "Node.js"],
      "bio": "Full-stack Web3 developer",
      "hourlyRate": 120,
      "availability": "available",
      "stakeAmount": "150.000000",
      "status": "active",
      "createdAt": "2024-01-25T10:00:00Z"
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

## Build for Production

```bash
npm run build

# Start API server
npm start

# Start event listener (in separate process)
npm run start:listener
```

## Event Listener Service

The event listener service runs independently and synchronizes blockchain events with the database.

### How It Works

1. **Historical Sync**: On startup, syncs all past events from `START_BLOCK` to current block
2. **Real-time Listening**: Continuously listens for new `Staked` events
3. **Checkpoint System**: Saves last processed block to database for recovery
4. **Retry Logic**: Automatically retries failed operations with exponential backoff
5. **Health Monitoring**: Checks sync lag every 30 seconds

### Event Processing

When a `Staked` event is detected:
1. Wait for block confirmations (default: 2)
2. Update developer `stake_amount` in database
3. Change developer `status` from 'pending' to 'active'
4. Set `staked_at` timestamp
5. Send welcome email (placeholder)

### Recovery

If the service crashes:
1. Restarts automatically (via PM2 or systemd)
2. Loads last processed block from `system_state` table
3. Syncs from checkpoint to current block
4. Resumes real-time listening

### Configuration

Event sync settings in `.env`:
- `RPC_URL`: Blockchain RPC endpoint
- `STAKE_VAULT_ADDRESS`: StakeVault contract address
- `START_BLOCK`: Initial block to sync from (0 for full history)
- `BATCH_SIZE`: Events per batch during historical sync (default: 1000)
- `CONFIRMATIONS`: Block confirmations to wait (default: 2)
- `RETRY_ATTEMPTS`: Failed event retry attempts (default: 3)
- `RETRY_DELAY`: Delay between retries in ms (default: 5000)

### Monitoring

Health check endpoint available at: `GET /health` (API server only)

For production, implement:
- Metrics export (Prometheus)
- Alerting (PagerDuty, Slack)
- Log aggregation (DataDog, CloudWatch)

## Project Structure

```
backend/
├── src/
│   ├── api/
│   │   └── routes/
│   │       └── developers.ts         # Developer API routes
│   ├── config/
│   │   ├── database.ts               # Database connection
│   │   └── eventSync.ts              # Event listener config
│   ├── db/
│   │   ├── migrate.ts                # Migration runner
│   │   └── migrations/               # SQL migration files
│   ├── services/
│   │   └── eventListeners/
│   │       └── stakeListener.ts      # Blockchain event listener
│   ├── types/                        # TypeScript type definitions
│   ├── utils/
│   │   ├── signature.ts              # Signature verification
│   │   ├── validation.ts             # Input validation
│   │   └── logger.ts                 # Logging utility
│   ├── index.ts                      # API server entry point
│   └── listener.ts                   # Event listener entry point
├── .env.example                      # Environment template
├── package.json
├── tsconfig.json
└── README.md
```
