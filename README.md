# 0xElite

**The Elite Dev Protocol** - A decentralized platform exclusively for top-tier Web3 developers.

## Overview

0xElite connects elite Web3 developers with quality projects through curated membership and proactive matching. Unlike traditional freelance platforms, we:

- **Curate membership** - Developers stake 150 USDC to prove commitment
- **Wallet-based identity** - Pure Web3 authentication, no passwords
- **On-chain verification** - Smart contracts manage stakes and reputation
- **Event-driven sync** - Blockchain events automatically update off-chain database
- **Secure by design** - Signature verification for all write operations

## Current Status

✅ **Spec 1: Developer Identity & Onboarding - COMPLETE**

The platform now supports:
- Developer registration with wallet signatures
- USDC staking for Sybil resistance
- Profile creation and management
- Automatic account activation on stake
- Public and private profile views

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Frontend (Next.js + wagmi)                  │
│                   localhost:3000                             │
│  - /apply - Developer registration                           │
│  - /developers/[address] - Profile pages                     │
└────────────────────┬────────────────────┬────────────────────┘
                     │                    │
                     ↓                    ↓
         ┌───────────────────┐  ┌─────────────────────┐
         │   Backend API     │  │   StakeVault.sol    │
         │  (Express + TS)   │  │   (Arbitrum)        │
         │  localhost:3001   │  │                     │
         │                   │  │  - stake(amount)    │
         │  POST /developers │  │  - unstake(amount)  │
         │  GET  /developers │  │  - getStake(addr)   │
         │  PUT  /developers │  │                     │
         └─────────┬─────────┘  └──────────┬──────────┘
                   │                       │
                   ↓                       │
         ┌───────────────────┐             │
         │    PostgreSQL     │             │
         │    Database       │             │
         │                   │◄────────────┘
         │  - developers     │   Event Listener
         │  - system_state   │   (Background Service)
         └───────────────────┘
```

## Tech Stack

### Smart Contracts
- **Solidity**: ^0.8.20
- **Development**: Hardhat 2.x
- **Testing**: Chai + Ethers.js
- **Libraries**: OpenZeppelin Contracts v5
- **Network**: Arbitrum Sepolia (testnet) → Arbitrum One (mainnet)

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express 5
- **Language**: TypeScript
- **Database**: PostgreSQL 15+
- **Blockchain**: ethers.js v6
- **Validation**: Custom validators + signature verification

### Frontend
- **Framework**: Next.js 14
- **Web3**: wagmi + viem
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Project Structure

```
0xElite/
├── contracts/                 # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── StakeVault.sol    # USDC staking contract
│   │   └── MockUSDC.sol      # Test token
│   ├── test/
│   │   └── StakeVault.test.js  # 23 passing tests
│   ├── scripts/
│   │   └── deploy.js         # Deployment script
│   └── hardhat.config.js
│
├── backend/                   # API + Event Listener
│   ├── src/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       └── developers.ts      # Developer API routes
│   │   ├── config/
│   │   │   ├── database.ts            # PostgreSQL connection
│   │   │   └── eventSync.ts           # Event listener config
│   │   ├── db/
│   │   │   ├── migrate.ts             # Migration runner
│   │   │   └── migrations/
│   │   │       └── 001_create_developers_table.sql
│   │   ├── services/
│   │   │   └── eventListeners/
│   │   │       └── stakeListener.ts   # Blockchain event sync
│   │   ├── utils/
│   │   │   ├── signature.ts           # SIWE verification
│   │   │   ├── validation.ts          # Input validation
│   │   │   └── logger.ts              # Logging utility
│   │   ├── types/
│   │   │   └── developer.ts           # TypeScript types
│   │   ├── index.ts                   # API server
│   │   └── listener.ts                # Event listener service
│   └── package.json
│
├── frontend/                  # Next.js dApp
│   ├── src/
│   │   ├── app/
│   │   │   ├── apply/
│   │   │   │   └── page.tsx          # Registration page
│   │   │   └── developers/[address]/
│   │   │       └── page.tsx          # Profile page
│   │   └── components/
│   │       ├── ConnectWallet.tsx
│   │       └── developer/
│   │           ├── DeveloperApplicationForm.tsx
│   │           ├── StakeFlow.tsx
│   │           └── EditProfileModal.tsx
│   └── package.json
│
├── specs/                     # Technical specifications
│   ├── changes/
│   │   └── add-developer-onboarding/   # Spec 1 implementation
│   ├── rfcs/
│   │   ├── RFC-001-identity-and-login.md
│   │   ├── RFC-002-sybil-prevention.md
│   │   ├── RFC-003-task-assignment.md
│   │   └── RFC-004-data-architecture.md
│   └── schema.md
│
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- A Web3 wallet (MetaMask, etc.)
- Alchemy/Infura API key for RPC access

### 1. Smart Contracts

```bash
cd contracts
npm install
cp .env.example .env
# Edit .env: Add RPC_URL, PRIVATE_KEY

# Run tests
npx hardhat test

# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia
# Note the deployed contract addresses
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: Add DATABASE_URL, RPC_URL, STAKE_VAULT_ADDRESS, etc.

# Run database migrations
npm run migrate

# Start API server (Terminal 1)
npm run dev

# Start event listener (Terminal 2)
npm run dev:listener
```

**Backend runs on:**
- API Server: `http://localhost:3001`
- Event Listener: Background process

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env: Add NEXT_PUBLIC_API_URL, contract addresses

npm run dev
```

**Frontend runs on:** `http://localhost:3000`

## Environment Configuration

### Contracts (.env)
```bash
RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_deployer_private_key
```

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://localhost:5432/oxelite_dev

# Blockchain
RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
STAKE_VAULT_ADDRESS=0x...  # From contract deployment
START_BLOCK=0

# Server
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000

# Event Sync
CONFIRMATIONS=2
BATCH_SIZE=1000
```

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_STAKE_VAULT_ADDRESS=0x...
```

## Key Features Implemented

### Developer Onboarding
- ✅ Wallet-based registration (Sign-In with Ethereum)
- ✅ Profile creation (email, GitHub, skills, bio, hourly rate)
- ✅ USDC staking (150 USDC minimum)
- ✅ Automatic account activation on stake confirmation
- ✅ Profile viewing (public fields + private email for owner)
- ✅ Profile editing with signature verification

### Smart Contracts
- ✅ StakeVault contract (stake/unstake USDC)
- ✅ 23 comprehensive tests (all passing)
- ✅ Gas optimized (~563k deployment, ~52k additional stakes)
- ✅ Cumulative staking support
- ✅ Ownership controls

### Backend API
- ✅ POST /api/developers - Create profile
- ✅ GET /api/developers/:address - View profile
- ✅ PUT /api/developers/:address - Update profile
- ✅ GET /api/developers - List with filters
- ✅ Wallet signature verification
- ✅ Input validation and error handling
- ✅ Uniqueness checks (wallet, email, GitHub)

### Event Synchronization
- ✅ Historical event sync with batching
- ✅ Real-time event listening
- ✅ Checkpoint system for crash recovery
- ✅ Retry logic with exponential backoff
- ✅ Health monitoring

## API Documentation

Full API documentation available in [backend/README.md](./backend/README.md)

**Example: Create Developer Profile**

```bash
POST /api/developers
Content-Type: application/json

{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Welcome to 0xElite!...",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "email": "alice@example.com",
  "githubUsername": "alice-dev",
  "skills": ["Solidity", "React", "Node.js"],
  "bio": "Full-stack Web3 developer",
  "hourlyRate": 120
}
```

## User Flow

1. **Connect Wallet** - User connects via wagmi
2. **Navigate to /apply** - Click "Apply as Developer"
3. **Fill Profile Form** - Email, GitHub, skills, bio, hourly rate
4. **Approve USDC** - Approve StakeVault contract
5. **Stake 150 USDC** - Lock stake in contract
6. **Sign Message** - Verify wallet ownership
7. **Profile Created** - Status: "pending"
8. **Event Detected** - Listener syncs stake to database
9. **Account Activated** - Status: "pending" → "active"
10. **View Profile** - Navigate to /developers/[address]

## Testing

### Smart Contracts
```bash
cd contracts
npx hardhat test
```

**Coverage:** 23/23 tests passing
- Deployment validation
- Staking (sufficient/insufficient amounts)
- Cumulative staking
- Unstaking
- Access control
- Reentrancy protection

### Backend API
```bash
cd backend
npm run dev
# Use Postman/curl to test endpoints
```

### Frontend
```bash
cd frontend
npm run dev
# Manual testing in browser
```

## Design Decisions

Key architectural decisions documented in RFCs:

| Topic | Decision | RFC |
|-------|----------|-----|
| Identity & Login | Pure wallet login, 1:1 binding | [RFC-001](./rfcs/RFC-001-identity-and-login.md) |
| Sybil Prevention | 150 USDC stake + labor cost + opportunity cost | [RFC-002](./rfcs/RFC-002-sybil-prevention.md) |
| Task Assignment | No-refusal policy with exceptions | [RFC-003](./rfcs/RFC-003-task-assignment.md) |
| Data Architecture | On-chain: stakes, funds, disputes<br>Off-chain: profiles, ratings, matching | [RFC-004](./rfcs/RFC-004-data-architecture.md) |

## Roadmap

### Completed ✅
- [x] **Spec 1: Developer Identity & Onboarding**
  - Smart contracts (StakeVault)
  - Database schema
  - Backend API
  - Event listener
  - Frontend pages

### In Progress 🚧
- [ ] **Spec 2: Project Management**
  - Project creation and lifecycle
  - Milestone management
  - ProjectManager contract

### Planned 📋
- [ ] **Spec 3: Escrow System**
  - Milestone-based payments
  - EscrowVault contract
  - Fund protection

- [ ] **Spec 4: Matching & Assignment**
  - Developer-project matching algorithm
  - Invitation system
  - Task assignment

- [ ] **Spec 5: Reviews & Ratings**
  - Review submission
  - Rating calculations
  - Reputation tracking

- [ ] **Spec 6: Dispute Resolution**
  - Dispute filing
  - DAO arbitration
  - DisputeDAO contract

## Development Scripts

### Contracts
```bash
npx hardhat compile          # Compile contracts
npx hardhat test            # Run tests
npx hardhat node            # Start local node
npx hardhat run scripts/deploy.js  # Deploy
```

### Backend
```bash
npm run dev                 # Start API server
npm run dev:listener        # Start event listener
npm run migrate             # Run database migrations
npm run build               # Build TypeScript
npm start                   # Run production build
```

### Frontend
```bash
npm run dev                 # Start dev server
npm run build               # Build for production
npm start                   # Start production server
npm run lint                # Run linter
```

## Security Considerations

- ✅ Wallet signature verification (SIWE)
- ✅ Reentrancy protection in contracts
- ✅ Input validation on all endpoints
- ✅ Safe ERC20 transfer checks
- ✅ Uniqueness constraints (wallet, email, GitHub)
- ⚠️ Smart contract audit pending
- ⚠️ Rate limiting not yet implemented
- ⚠️ Email verification not yet implemented

## Contributing

This is a Capstone project. For inquiries, please see the documentation in `/specs`.

## License

MIT

---

**Built for Web3 Capstone Project**

For detailed specifications, see [specs/](./specs/) directory.
