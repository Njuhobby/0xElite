# 0xElite

**The Elite Dev Protocol** - A decentralized platform exclusively for top-tier Web3 developers.

## Overview

0xElite connects elite Web3 developers with quality projects through curated membership and proactive matching. Unlike traditional freelance platforms, we:

- **Curate membership** - Developers stake 150 USDC to prove commitment
- **Wallet-based identity** - Pure Web3 authentication, no passwords
- **On-chain verification** - Smart contracts manage stakes, escrow, and disputes
- **DAO governance** - Community-driven dispute resolution with weighted voting
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

✅ **Spec 2: Project Management - COMPLETE**

The platform now supports:
- Client registration with hybrid approach (minimal + full profiles)
- Project creation with milestone-based deliverables
- Auto-assignment algorithm (skill matching + availability + reputation)
- On-chain project registration via ProjectManager contract
- Milestone workflow (pending → in_progress → pending_review → completed)
- Role-based visibility (client/developer/public views)
- Automatic project completion when all milestones done

✅ **Spec 3: Escrow System - COMPLETE**

The platform now supports:
- USDC-based escrow for milestone payments
- Client deposits full project budget to EscrowVault contract
- Automatic payment release on milestone approval (developer + platform fee)
- Per-project freeze capability for dispute resolution
- Complete payment history and audit trail
- Frontend deposit flow (approve → deposit → activate)
- Real-time escrow status display with balance tracking

✅ **Spec 4: Matching & Assignment - COMPLETE**

The platform now supports:
- Auto-assignment algorithm with multi-factor scoring (0-130 points)
- Skill overlap scoring (0-100 points, 50% minimum required)
- Idle time bonus (0-20 points, fairness mechanism)
- Reputation bonus (0-10 points, quality incentive)
- Pending queue processing
- No-refusal policy enforcement

✅ **Spec 5: Reviews & Ratings - COMPLETE**

The platform now supports:
- Bidirectional reviews (client → developer, developer → client)
- 1-5 star ratings with comments
- Auto-calculated average ratings and rating distributions
- Review editing within 7-day window
- Per-project and per-user review queries
- Reputation tracking on developer and client profiles

✅ **Spec 6: Dispute Resolution - COMPLETE**

The platform now supports:
- On-chain dispute creation via DisputeDAO contract
- Evidence submission with deadlines
- Weighted voting by EliteToken holders (soulbound governance token)
- Quorum-based resolution with automated fund distribution
- Owner fallback resolution when quorum not met
- Dispute event synchronization to database
- Frontend dispute listing and detail pages

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js + wagmi)                        │
│                       localhost:3000                                 │
│  - /apply - Developer registration                                   │
│  - /developers/[address] - Developer profiles                        │
│  - /projects - Browse projects                                       │
│  - /projects/create - Create project                                 │
│  - /projects/[id] - Project details & milestones                     │
│  - /disputes - DAO arbitration listing                               │
│  - /disputes/[id] - Dispute details & voting                         │
│  - /dashboard/client - Client dashboard & settings                   │
│  - /dashboard/developer - Developer dashboard & settings             │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ↓
         ┌────────────────────────────────────────────┐
         │         Backend API (Express + TS)         │
         │             localhost:3001                 │
         │                                            │
         │  Developers: POST/GET/PUT /api/developers  │
         │  Projects:   POST/GET/PUT /api/projects    │
         │  Milestones: POST/PUT /api/milestones      │
         │  Clients:    POST/GET /api/clients         │
         │  Escrow:     POST/GET /api/escrow          │
         │  Reviews:    POST/GET/PUT /api/reviews     │
         │  Disputes:   POST/GET/PUT /api/disputes    │
         │                                            │
         │  + Matching Algorithm Service              │
         │  + Voting Power Sync Service               │
         └─────────┬──────────────────────┬───────────┘
                   │                      │
                   ↓                      ↓
         ┌───────────────────┐  ┌──────────────────────────┐
         │   PostgreSQL      │  │  Smart Contracts         │
         │   Database        │  │  (Arbitrum)              │
         │                   │  │                          │
         │  - developers     │  │  - StakeVault.sol        │
         │  - clients        │  │    • stake(amount)       │
         │  - projects       │  │    • unstake(amount)     │
         │  - milestones     │  │                          │
         │  - escrow_deposits│  │  - ProjectManager.sol    │
         │  - payment_history│  │    • createProject()     │
         │  - reviews        │  │    • assignDeveloper()   │
         │  - disputes       │  │    • updateProjectState()│
         │  - dispute_votes  │  │                          │
         │  - system_state   │  │  - EscrowVault.sol       │
         │                   │◄─┤    • deposit()           │
         │                   │  │    • release()           │
         │                   │  │    • releaseFee()        │
         │                   │  │    • freeze()            │
         │                   │  │                          │
         │                   │  │  - DisputeDAO.sol        │
         │                   │◄─┤    • createDispute()     │
         │                   │  │    • castVote()          │
         │                   │  │    • executeResolution() │
         │                   │  │                          │
         │                   │  │  - EliteToken.sol        │
         │                   │  │    • mint() / burn()     │
         │                   │  │    • delegate()          │
         │                   │  │    • getVotes()          │
         └───────────────────┘  └──────────────────────────┘
                                          │
                                          │ Events
                                          ↓
                                 Event Listeners
                              (Background Services)
                           - Stake events
                           - Escrow events
                           - Dispute events
```

## Tech Stack

### Smart Contracts
- **Solidity**: ^0.8.22
- **Development**: Hardhat 2.x
- **Testing**: Chai + Ethers.js
- **Libraries**: OpenZeppelin Contracts v5 (upgradeable)
- **Network**: Arbitrum Sepolia (testnet) → Arbitrum One (mainnet)

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express 5
- **Language**: TypeScript
- **Database**: PostgreSQL 15+
- **Blockchain**: ethers.js v6
- **Testing**: Jest + Supertest (289 tests)
- **Validation**: Custom validators + signature verification

### Frontend
- **Framework**: Next.js 16
- **Web3**: wagmi + viem
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript
- **State**: @tanstack/react-query

## Project Structure

```
0xElite/
├── contracts/                 # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── StakeVault.sol    # USDC staking (UUPS upgradeable)
│   │   ├── ProjectManager.sol # Project lifecycle management
│   │   ├── EscrowVault.sol   # Milestone-based payment escrow
│   │   ├── DisputeDAO.sol    # DAO dispute resolution
│   │   ├── EliteToken.sol    # Soulbound governance token (xELITE)
│   │   └── test/
│   │       ├── MockERC20.sol # Test ERC20 token
│   │       └── MockUSDC.sol  # Test USDC token
│   ├── test/
│   │   ├── StakeVault.test.js     # 23 passing tests
│   │   ├── ProjectManager.test.js # 34 passing tests
│   │   ├── EscrowVault.test.js    # 59 passing tests
│   │   ├── DisputeDAO.test.js     # 61 passing tests
│   │   └── EliteToken.test.js     # 23 passing tests
│   ├── scripts/
│   │   ├── deploy.ts         # Deployment script
│   │   └── upgrade.ts        # Upgrade script
│   └── hardhat.config.ts
│
├── backend/                   # API + Event Listeners
│   ├── src/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── developers.ts      # Developer API routes
│   │   │       ├── projects.ts        # Project API routes
│   │   │       ├── milestones.ts      # Milestone API routes
│   │   │       ├── clients.ts         # Client API routes
│   │   │       ├── escrow.ts          # Escrow API routes
│   │   │       ├── reviews.ts         # Reviews API routes
│   │   │       └── disputes.ts        # Disputes API routes
│   │   ├── config/
│   │   │   ├── database.ts            # PostgreSQL connection
│   │   │   └── eventSync.ts           # Event listener config
│   │   ├── contracts/
│   │   │   └── EscrowVault.json       # EscrowVault ABI
│   │   ├── db/
│   │   │   ├── migrate.ts             # Migration runner
│   │   │   └── migrations/
│   │   │       ├── 001_create_developers_table.sql
│   │   │       ├── 002_create_project_tables.sql
│   │   │       ├── 003_create_escrow_tables.sql
│   │   │       ├── 004_create_reviews_table.sql
│   │   │       └── 005_create_dispute_tables.sql
│   │   ├── services/
│   │   │   ├── matchingAlgorithm.ts   # Auto-assignment logic
│   │   │   ├── escrowEventListener.ts # Escrow event sync
│   │   │   ├── votingPowerSync.ts     # EliteToken balance sync
│   │   │   └── eventListeners/
│   │   │       ├── stakeListener.ts   # Stake event sync
│   │   │       └── disputeListener.ts # Dispute event sync
│   │   ├── utils/
│   │   │   ├── signature.ts           # SIWE verification
│   │   │   ├── validation.ts          # Input validation
│   │   │   └── logger.ts              # Logging utility
│   │   ├── types/
│   │   │   └── developer.ts           # TypeScript types
│   │   ├── __tests__/                 # Jest test suite (289 tests)
│   │   │   ├── setup.ts
│   │   │   ├── helpers/
│   │   │   ├── utils/
│   │   │   ├── api/
│   │   │   └── services/
│   │   ├── index.ts                   # API server
│   │   └── listener.ts                # Event listener service
│   ├── jest.config.ts
│   └── package.json
│
├── frontend/                  # Next.js dApp
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Homepage
│   │   │   ├── apply/
│   │   │   │   └── page.tsx          # Developer registration
│   │   │   ├── developers/[address]/
│   │   │   │   └── page.tsx          # Developer profile
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx          # Browse projects
│   │   │   │   ├── create/
│   │   │   │   │   └── page.tsx      # Create project
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Project details
│   │   │   ├── disputes/
│   │   │   │   ├── page.tsx          # DAO arbitration listing
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Dispute details & voting
│   │   │   └── dashboard/
│   │   │       ├── client/
│   │   │       │   ├── page.tsx      # Client dashboard
│   │   │       │   ├── projects/
│   │   │       │   │   ├── page.tsx  # Client projects list
│   │   │       │   │   └── [id]/
│   │   │       │   │       └── page.tsx  # Client project detail
│   │   │       │   └── settings/
│   │   │       │       └── page.tsx  # Client settings
│   │   │       └── developer/
│   │   │           ├── page.tsx      # Developer dashboard
│   │   │           ├── projects/
│   │   │           │   └── page.tsx  # Developer projects list
│   │   │           └── settings/
│   │   │               └── page.tsx  # Developer settings
│   │   └── components/
│   │       ├── ConnectWallet.tsx
│   │       ├── client/
│   │       │   ├── CreateProjectModal.tsx
│   │       │   └── EditClientProfileModal.tsx
│   │       ├── developer/
│   │       │   ├── DeveloperApplicationForm.tsx
│   │       │   ├── StakeFlow.tsx
│   │       │   └── EditProfileModal.tsx
│   │       ├── project/
│   │       │   ├── MilestoneManager.tsx
│   │       │   ├── MilestoneCard.tsx
│   │       │   └── ProjectStatusBadge.tsx
│   │       ├── disputes/
│   │       │   ├── DisputeCard.tsx
│   │       │   └── DisputeStatusBadge.tsx
│   │       └── reviews/
│   │           ├── RatingStars.tsx
│   │           ├── ReviewCard.tsx
│   │           ├── ReviewList.tsx
│   │           └── SubmitReviewModal.tsx
│   └── package.json
│
├── specs/                     # Technical specifications
│   ├── capabilities/          # Behavioral requirements
│   │   ├── developer-onboarding/
│   │   ├── project-management/
│   │   ├── escrow-management/
│   │   ├── review-management/
│   │   ├── client-dashboard/
│   │   └── dispute-resolution/
│   ├── data-models/           # Database schemas
│   │   ├── developer/
│   │   ├── client/
│   │   ├── project/
│   │   ├── milestone/
│   │   ├── escrow/
│   │   ├── payment-history/
│   │   ├── review/
│   │   ├── dispute/
│   │   └── dispute-vote/
│   ├── api/                   # API endpoints
│   │   ├── developer-management/
│   │   ├── project-management/
│   │   ├── escrow-management/
│   │   ├── client-management/
│   │   ├── review-management/
│   │   └── dispute-management/
│   ├── architecture/          # System design
│   │   ├── stake-vault-contract/
│   │   ├── project-manager-contract/
│   │   ├── escrow-vault-contract/
│   │   ├── escrow-event-listener/
│   │   ├── event-sync-system/
│   │   ├── matching-algorithm/
│   │   ├── elite-token-contract/
│   │   ├── dispute-dao-contract/
│   │   └── dispute-event-listener/
│   ├── changes/
│   │   └── archive/
│   │       ├── 20260125-add-developer-onboarding/  # Spec 1
│   │       ├── 20260125-add-project-management/    # Spec 2
│   │       ├── 20260125-add-escrow-system/         # Spec 3
│   │       ├── 20260217-add-reviews-ratings/       # Spec 5
│   │       ├── 20260217-add-client-dashboard/      # Client dashboard
│   │       └── add-dao-arbitration/                # Spec 6
│   └── RFC/                                       # All RFCs consolidated here
│       ├── RFC-001-data-sync-strategy.md
│       ├── RFC-002-onchain-storage-decisions.md
│       ├── RFC-003-DAO-Arbitration-System.md
│       ├── RFC-004-identity-and-login.md
│       ├── RFC-005-sybil-prevention.md
│       ├── RFC-006-task-assignment.md
│       └── RFC-007-data-architecture.md
│
├── docs/
│   ├── PROJECT_OVERVIEW.md
│   └── RFC/                   # RFC documents (linked from specs)
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
npx hardhat run scripts/deploy.ts --network sepolia
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
STAKE_VAULT_ADDRESS=0x...         # From StakeVault deployment
PROJECT_MANAGER_ADDRESS=0x...     # From ProjectManager deployment
ESCROW_VAULT_ADDRESS=0x...        # From EscrowVault deployment
DISPUTE_DAO_ADDRESS=0x...         # From DisputeDAO deployment
ELITE_TOKEN_ADDRESS=0x...         # From EliteToken deployment
PRIVATE_KEY=your_backend_service_private_key  # For contract interactions
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
NEXT_PUBLIC_PROJECT_MANAGER_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=0x...
NEXT_PUBLIC_DISPUTE_DAO_ADDRESS=0x...
NEXT_PUBLIC_ELITE_TOKEN_ADDRESS=0x...
```

## Key Features Implemented

### Developer Onboarding (Spec 1)
- ✅ Wallet-based registration (Sign-In with Ethereum)
- ✅ Profile creation (email, GitHub, skills, bio, hourly rate)
- ✅ USDC staking (150 USDC minimum)
- ✅ Automatic account activation on stake confirmation
- ✅ Profile viewing (public fields + private email for owner)
- ✅ Profile editing with signature verification

### Project Management (Spec 2)
- ✅ Client registration (hybrid: minimal + full profiles)
- ✅ Project creation with milestone breakdown
- ✅ Auto-assignment algorithm (skill + availability + reputation scoring)
- ✅ Milestone workflow (pending → in_progress → pending_review → completed)
- ✅ Role-based visibility (client/developer/public views)
- ✅ Automatic project completion when all milestones done
- ✅ On-chain project registration and state tracking
- ✅ Developer stats auto-update (projects_completed, total_earned)

### Escrow System (Spec 3)
- ✅ USDC-based escrow deposits (clients deposit full project budget)
- ✅ Automatic payment release on milestone approval
  - Developer payment (budget - platform fee)
  - Platform fee collection (5-15% based on client tier)
- ✅ Per-project freeze capability for dispute resolution
- ✅ Payment history tracking (immutable audit trail)
- ✅ Frontend deposit flow (approve USDC → deposit → activate)
- ✅ Real-time escrow status display
  - Total deposited, total released, available balance
  - Payment breakdown (developer, platform, pending)
  - Progress bar visualization
- ✅ Event-driven synchronization (Deposited, Released, FeesCollected, Frozen)

### Reviews & Ratings (Spec 5)
- ✅ Bidirectional reviews (client → developer, developer → client)
- ✅ 1-5 star rating system with comments (max 1000 chars)
- ✅ Auto-calculated average ratings and rating distributions
- ✅ Review editing within 7-day window
- ✅ Per-project and per-user review queries
- ✅ Paginated and sortable review listings

### Dispute Resolution (Spec 6)
- ✅ On-chain dispute creation via DisputeDAO contract
- ✅ Evidence submission with configurable deadlines
- ✅ Weighted voting by EliteToken holders
- ✅ Quorum-based resolution (25% of total supply)
- ✅ Automated fund distribution (client/developer shares)
- ✅ Owner fallback resolution when quorum not met
- ✅ Dispute event listener (syncs on-chain events to database)
- ✅ Frontend dispute listing and detail/voting pages

### Smart Contracts
- ✅ **StakeVault** - USDC stake/unstake (UUPS upgradeable)
  - 23 comprehensive tests (all passing)
  - Gas optimized (~563k deployment, ~52k additional stakes)
- ✅ **ProjectManager** - Project lifecycle management
  - 34 comprehensive tests (all passing)
  - Gas optimized (~718k deployment, ~122k create, ~74k assign)
- ✅ **EscrowVault** - Milestone-based payment escrow
  - 59 comprehensive tests (all passing)
  - Gas optimized (~132k deposit, ~91k release, ~50k freeze)
  - USDC-only (6 decimals), no native ETH
- ✅ **DisputeDAO** - DAO dispute resolution with weighted voting
  - 61 comprehensive tests (all passing)
  - 4-phase lifecycle: creation → evidence → voting → resolution
  - Configurable arbitration fees, quorum, and time periods
- ✅ **EliteToken** - Soulbound governance token (xELITE)
  - 23 comprehensive tests (all passing)
  - Non-transferable (soulbound), only mint/burn by owner
  - ERC20Votes for on-chain voting power tracking
  - Timestamp-based checkpoints (L2-compatible)
- ✅ Cumulative staking support
- ✅ Ownership controls
- ✅ Reentrancy protection

### Backend API
**Developer Management:**
- ✅ POST /api/developers - Create profile
- ✅ GET /api/developers/:address - View profile
- ✅ PUT /api/developers/:address - Update profile
- ✅ GET /api/developers - List with filters

**Project Management:**
- ✅ POST /api/projects - Create project with auto-assignment
- ✅ GET /api/projects/:id - View project details
- ✅ PUT /api/projects/:id - Update draft projects
- ✅ GET /api/projects - List with filters

**Milestone Management:**
- ✅ POST /api/projects/:id/milestones - Add milestone
- ✅ PUT /api/milestones/:id - Update status (dev submit, client approve)

**Client Management:**
- ✅ POST /api/clients - Register client profile
- ✅ GET /api/clients/:address - View client profile

**Escrow Management:**
- ✅ POST /api/escrow/deposit - Record escrow deposit (after on-chain tx)
- ✅ GET /api/escrow/:projectId - View escrow status and balance
- ✅ GET /api/escrow/:projectId/history - View payment history
- ✅ POST /api/escrow/freeze - Freeze escrow (admin/dispute only)
- ✅ POST /api/escrow/unfreeze - Unfreeze after dispute resolution

**Review Management:**
- ✅ POST /api/reviews - Submit review (after project completion)
- ✅ GET /api/reviews/developer/:address - Get developer reviews (paginated)
- ✅ GET /api/reviews/client/:address - Get client reviews (paginated)
- ✅ GET /api/reviews/project/:projectId - Get project reviews
- ✅ PUT /api/reviews/:id - Edit review (within 7 days)

**Dispute Management:**
- ✅ POST /api/disputes - Create dispute (client or developer)
- ✅ GET /api/disputes/:id - View dispute details
- ✅ GET /api/disputes/project/:projectId - Get project disputes
- ✅ PUT /api/disputes/:id/evidence - Submit/update evidence
- ✅ GET /api/disputes/:id/votes - Get dispute votes
- ✅ GET /api/disputes/active/list - List active disputes (paginated)
- ✅ GET /api/disputes/my/:address - Get user's disputes (paginated)

**Features:**
- ✅ Wallet signature verification
- ✅ Input validation and error handling
- ✅ Uniqueness checks (wallet, email, GitHub)
- ✅ Role-based access control
- ✅ Automatic payment release on milestone completion
- ✅ Platform fee calculation (tier-based: 5-15%)

### Matching Algorithm
- ✅ Multi-factor scoring system (0-130 points)
- ✅ Skill overlap (0-100 points, 50% minimum required)
- ✅ Idle time bonus (0-20 points, fairness mechanism)
- ✅ Reputation bonus (0-10 points, quality incentive)
- ✅ Pending queue processing
- ✅ No-refusal policy enforcement

### Event Synchronization
- ✅ Historical event sync with batching
- ✅ Real-time event listening
- ✅ Checkpoint system for crash recovery
- ✅ Retry logic with exponential backoff
- ✅ Health monitoring
- ✅ Stake event listener
- ✅ Escrow event listener
- ✅ Dispute event listener

### Voting Power Sync
- ✅ EliteToken balance synchronization
- ✅ Formula: `voting_power = total_earned × (average_rating / 5.0)`
- ✅ Automatic mint/burn to match calculated power
- ✅ Per-developer and batch sync support

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

**Example: Create Project**

```bash
POST /api/projects
Content-Type: application/json

{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "message": "Create project on 0xElite...",
  "signature": "0x8f3c7e2a1b4d5c6e...",
  "title": "DeFi Dashboard Frontend",
  "description": "Build a responsive React frontend for DeFi portfolio tracking",
  "requiredSkills": ["React", "TypeScript", "Web3.js"],
  "totalBudget": 5000,
  "milestones": [
    {
      "title": "UI/UX Design & Setup",
      "description": "Design mockups and initialize project",
      "deliverables": ["Figma mockups", "React app setup"],
      "budget": 1000
    },
    {
      "title": "Wallet Integration",
      "description": "Implement wallet connection and chain switching",
      "deliverables": ["Web3 wallet integration", "Multi-chain support"],
      "budget": 1500
    }
  ]
}
```

## User Flows

### Developer Onboarding Flow

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

### Client Project Creation Flow

1. **Connect Wallet** - Client connects wallet (no registration required)
2. **Navigate to /projects/create** - Click "Create Project"
3. **Fill Project Details** - Title, description, required skills, total budget
4. **Add Milestones** - Break project into deliverables with individual budgets
5. **Sign Message** - Verify wallet ownership
6. **On-Chain Registration** - ProjectManager.createProject() called
7. **Auto-Assignment Triggered** - Matching algorithm runs
8. **Developer Assigned** - Best matching available developer assigned
9. **Project Activated** - Status: "draft" → "active"
10. **Track Progress** - View milestones at /projects/[id]

### Milestone Completion Flow

1. **Developer Starts Work** - Marks milestone "in_progress"
2. **Developer Submits** - Provides deliverable URLs, marks "pending_review"
3. **Client Reviews** - Views submitted deliverables
4. **Client Approves** - Marks milestone "completed", adds review notes
5. **Payment Released** - Escrow automatically releases funds:
   - Developer receives payment (milestone budget - platform fee)
   - Platform collects fee (5-15% based on client tier)
   - Both transactions recorded in payment_history
6. **All Milestones Done** - Project auto-completes
7. **Stats Updated** - Developer projects_completed++, client projects_completed++

### Escrow Deposit Flow

1. **Project Created** - Client creates project with milestones
2. **Approve USDC** - Client approves EscrowVault to spend USDC
3. **Deposit to Escrow** - Client deposits full project budget to EscrowVault
4. **Record Deposit** - Backend records deposit and activates project
5. **Track Status** - View escrow balance and payment history at /projects/[id]

### Dispute Resolution Flow

1. **Dispute Created** - Client or developer initiates dispute on-chain
2. **Evidence Period** - Both parties submit evidence URIs within deadline
3. **Voting Starts** - Transitions to voting phase after evidence deadline
4. **DAO Votes** - EliteToken holders cast weighted votes
5. **Resolution** - If quorum met, execute resolution; otherwise owner resolves
6. **Fund Distribution** - Escrow funds distributed based on outcome (client/developer shares)

## Testing

### Smart Contracts
```bash
cd contracts
npx hardhat test
```

**StakeVault Coverage:** 23/23 tests passing
- Deployment validation
- Staking (sufficient/insufficient amounts)
- Cumulative staking
- Unstaking
- Access control
- Reentrancy protection

**ProjectManager Coverage:** 34/34 tests passing
- Project creation and validation
- Developer assignment
- State transitions
- Access control
- Edge cases (rapid creation, state isolation)
- View functions

**EscrowVault Coverage:** 59/59 tests passing
- Deployment and configuration
- Deposit functionality (validation, events, balance tracking)
- Release functionality (developer payment, fee collection)
- Freeze/unfreeze (dispute handling)
- Dispute resolution (fund distribution)
- Access control (onlyProjectManager, onlyDisputeDAO)
- Edge cases (insufficient balance, frozen escrow)
- Gas optimization verification

**DisputeDAO Coverage:** 61/61 tests passing
- Deployment and initialization
- Dispute creation and validation
- Evidence submission
- Voting (start, cast, weighted)
- Resolution (quorum-based, owner fallback)
- View functions
- Admin functions

**EliteToken Coverage:** 23/23 tests passing
- Deployment and initialization
- Minting and burning
- Soulbound enforcement (non-transferable)
- Voting power and delegation
- Access control

### Backend API
```bash
cd backend
npm test                # Run all 289 tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

**Test Coverage:** 289/289 tests passing across 14 test files

| Category | File | Tests |
|----------|------|-------|
| Utils | validation.test.ts | 72 |
| Utils | signature.test.ts | 11 |
| API | reviews.test.ts | 27 |
| API | developers.test.ts | 26 |
| API | projects.test.ts | 26 |
| API | disputes.test.ts | 23 |
| API | escrow.test.ts | 19 |
| API | milestones.test.ts | 18 |
| API | clients.test.ts | 12 |
| Services | escrowEventListener.test.ts | 14 |
| Services | matchingAlgorithm.test.ts | 13 |
| Services | disputeListener.test.ts | 12 |
| Services | votingPowerSync.test.ts | 8 |
| Services | stakeListener.test.ts | 8 |

All tests run with mocked dependencies (no real DB or blockchain needed).

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
| Data Sync Strategy | On-chain/off-chain data synchronization | [RFC-001](./docs/RFC/RFC-001-data-sync-strategy.md) |
| On-chain Storage | What goes on-chain vs off-chain | [RFC-002](./docs/RFC/RFC-002-onchain-storage-decisions.md) |
| DAO Arbitration | Community-driven dispute resolution | [RFC-003](./docs/RFC/RFC-003-DAO-Arbitration-System.md) |
| Identity & Login | Pure wallet login, 1:1 binding | [RFC-004](./docs/RFC/RFC-004-identity-and-login.md) |
| Sybil Prevention | 150 USDC stake + labor cost + opportunity cost | [RFC-005](./docs/RFC/RFC-005-sybil-prevention.md) |
| Task Assignment | No-refusal policy with exceptions | [RFC-006](./docs/RFC/RFC-006-task-assignment.md) |
| Data Architecture | On-chain: stakes, funds, disputes<br>Off-chain: profiles, ratings, matching | [RFC-007](./docs/RFC/RFC-007-data-architecture.md) |

## Roadmap

### Completed ✅
- [x] **Spec 1: Developer Identity & Onboarding**
  - Smart contracts (StakeVault)
  - Database schema (developers, system_state)
  - Backend API (4 endpoints)
  - Event listener (stake sync)
  - Frontend pages (/apply, /developers/[address])

- [x] **Spec 2: Project Management**
  - Smart contracts (ProjectManager)
  - Database schema (projects, milestones, clients)
  - Backend API (8 endpoints)
  - Matching algorithm service (auto-assignment)
  - Frontend pages (/projects, /projects/create, /projects/[id])

- [x] **Spec 3: Escrow System**
  - Smart contract (EscrowVault - deposit, release, freeze)
  - Database schema (escrow_deposits, payment_history)
  - Backend API (5 escrow endpoints)
  - Event listener (blockchain synchronization with checkpoint recovery)
  - Milestone integration (automatic payment release on approval)
  - Frontend deposit flow (3-step: approve → deposit → record)
  - Frontend escrow status display (balances, breakdown, progress)

- [x] **Spec 4: Matching & Assignment**
  - Auto-assignment algorithm (skill + availability + reputation scoring)
  - Skill-based scoring (50% minimum overlap)
  - No-refusal policy enforcement
  - Pending queue processing

- [x] **Spec 5: Reviews & Ratings**
  - Database schema (reviews table, rating triggers)
  - Backend API (5 review endpoints)
  - Bidirectional reviews (client ↔ developer)
  - Auto-calculated ratings and distributions
  - Frontend review components (ReviewList, ReviewCard, SubmitReviewModal, RatingStars)

- [x] **Spec 6: Dispute Resolution**
  - Smart contracts (DisputeDAO, EliteToken)
  - Database schema (disputes, dispute_votes)
  - Backend API (7 dispute endpoints)
  - Event listener (dispute sync)
  - Voting power sync service (EliteToken balance management)
  - Frontend pages (/disputes, /disputes/[id])

- [x] **Client Dashboard**
  - Frontend pages (/dashboard/client, projects, settings)
  - Client profile management
  - Project tracking views

- [x] **Developer Dashboard**
  - Frontend pages (/dashboard/developer, projects, settings)
  - Developer profile management
  - Project tracking views

### Remaining Work 📋

- [ ] Deploy DisputeDAO and EliteToken contracts (deploy script not yet updated)
- [ ] Smart contract audit
- [ ] Rate limiting on API endpoints
- [ ] Email verification
- [ ] Manual developer invitation system (optional enhancement)
- [ ] Developer work preferences (optional enhancement)

## Development Scripts

### Contracts
```bash
npx hardhat compile              # Compile contracts
npx hardhat test                 # Run tests (200 total)
npx hardhat node                 # Start local node
npx hardhat run scripts/deploy.ts  # Deploy
npx hardhat run scripts/upgrade.ts # Upgrade proxy
```

### Backend
```bash
npm run dev                 # Start API server
npm run dev:listener        # Start event listener
npm run migrate             # Run database migrations
npm run build               # Build TypeScript
npm start                   # Run production build
npm test                    # Run Jest tests (289 tests)
npm run test:watch          # Jest watch mode
npm run test:coverage       # Jest with coverage
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
- ✅ Role-based access control (client/developer permissions)
- ✅ State transition validation (prevent invalid milestone/project states)
- ✅ Budget validation (milestone budgets cannot exceed project budget)
- ✅ Ownership verification (only project owner can update)
- ✅ No-refusal policy enforcement (prevent selective work)
- ✅ Escrow fund protection (per-project freeze capability)
- ✅ Immutable payment history (trigger-enforced audit trail)
- ✅ Safe ERC20 transfers (OpenZeppelin SafeERC20)
- ✅ Payment atomicity (milestone only completed if payment succeeds)
- ✅ Soulbound token enforcement (EliteToken non-transferable)
- ✅ Quorum-based dispute resolution (prevents minority attacks)
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
