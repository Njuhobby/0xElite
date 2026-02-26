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
         │                                            │
         │  + Matching Algorithm Service              │
         │    (Auto-assignment logic)                 │
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
         │  - system_state   │  │    • assignDeveloper()   │
         │                   │◄─┤    • updateProjectState()│
         │                   │  │                          │
         │                   │  │  - EscrowVault.sol       │
         │                   │◄─┤    • deposit()           │
         │                   │  │    • release()           │
         │                   │  │    • releaseFee()        │
         │                   │  │    • freeze()            │
         └───────────────────┘  └──────────────────────────┘
                                          │
                                          │ Events
                                          ↓
                                 Event Listeners
                              (Background Services)
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
│   │   ├── ProjectManager.sol # Project lifecycle management
│   │   ├── EscrowVault.sol   # Milestone-based payment escrow
│   │   └── test/
│   │       └── MockERC20.sol # Test USDC token
│   ├── test/
│   │   ├── StakeVault.test.js     # 23 passing tests
│   │   ├── ProjectManager.test.js # 34 passing tests
│   │   └── EscrowVault.test.js    # 59 passing tests
│   ├── scripts/
│   │   └── deploy.js         # Deployment script
│   └── hardhat.config.js
│
├── backend/                   # API + Event Listener
│   ├── src/
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── developers.ts      # Developer API routes
│   │   │       ├── projects.ts        # Project API routes
│   │   │       ├── milestones.ts      # Milestone API routes
│   │   │       ├── clients.ts         # Client API routes
│   │   │       └── escrow.ts          # Escrow API routes
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
│   │   │       └── 003_create_escrow_tables.sql
│   │   ├── services/
│   │   │   ├── matchingAlgorithm.ts   # Auto-assignment logic
│   │   │   ├── escrowEventListener.ts # Escrow event sync
│   │   │   └── eventListeners/
│   │   │       └── stakeListener.ts   # Stake event sync
│   │   ├── utils/
│   │   │   ├── signature.ts           # SIWE verification
│   │   │   ├── signatureVerification.ts # Signature helper
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
│   │   │   │   └── page.tsx          # Developer registration
│   │   │   ├── developers/[address]/
│   │   │   │   └── page.tsx          # Developer profile
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx          # Browse projects
│   │   │   │   ├── create/
│   │   │   │   │   └── page.tsx      # Create project
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Project details
│   │   │   └── page.tsx              # Homepage
│   │   └── components/
│   │       ├── ConnectWallet.tsx
│   │       ├── developer/
│   │       │   ├── DeveloperApplicationForm.tsx
│   │       │   ├── StakeFlow.tsx
│   │       │   └── EditProfileModal.tsx
│   │       └── project/
│   │           ├── MilestoneManager.tsx
│   │           ├── MilestoneCard.tsx
│   │           └── ProjectStatusBadge.tsx
│   └── package.json
│
├── specs/                     # Technical specifications
│   ├── capabilities/          # Behavioral requirements
│   │   ├── developer-onboarding/
│   │   ├── project-management/
│   │   └── escrow-management/
│   ├── data-models/           # Database schemas
│   │   ├── developer/
│   │   ├── client/
│   │   ├── project/
│   │   ├── milestone/
│   │   ├── escrow/
│   │   └── payment-history/
│   ├── api/                   # API endpoints
│   │   ├── developer-management/
│   │   ├── project-management/
│   │   └── escrow-management/
│   ├── architecture/          # System design
│   │   ├── stake-vault-contract/
│   │   ├── project-manager-contract/
│   │   ├── escrow-vault-contract/
│   │   ├── escrow-event-listener/
│   │   ├── event-sync-system/
│   │   └── matching-algorithm/
│   ├── changes/
│   │   └── archive/
│   │       ├── 20260125-add-developer-onboarding/  # Spec 1
│   │       └── 20260125-add-escrow-system/         # Spec 3
│   └── RFC/                                       # All RFCs consolidated here
│       ├── RFC-001-data-sync-strategy.md
│       ├── RFC-002-onchain-storage-decisions.md
│       ├── RFC-003-DAO-Arbitration-System.md
│       ├── RFC-004-identity-and-login.md
│       ├── RFC-005-sybil-prevention.md
│       ├── RFC-006-task-assignment.md
│       └── RFC-007-data-architecture.md
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
STAKE_VAULT_ADDRESS=0x...         # From StakeVault deployment
PROJECT_MANAGER_ADDRESS=0x...     # From ProjectManager deployment
ESCROW_VAULT_ADDRESS=0x...        # From EscrowVault deployment
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

### Smart Contracts
- ✅ StakeVault contract (stake/unstake USDC)
  - 23 comprehensive tests (all passing)
  - Gas optimized (~563k deployment, ~52k additional stakes)
- ✅ ProjectManager contract (project lifecycle management)
  - 34 comprehensive tests (all passing)
  - Gas optimized (~718k deployment, ~122k create, ~74k assign)
- ✅ EscrowVault contract (milestone-based payment escrow)
  - 59 comprehensive tests (all passing)
  - Gas optimized (~132k deposit, ~91k release, ~50k freeze)
  - USDC-only (6 decimals), no native ETH
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

### Planned 📋

- [ ] **Spec 4: Matching & Assignment** (Partially Complete)
  - ✅ Auto-assignment algorithm implemented
  - ✅ Skill-based scoring
  - ✅ No-refusal policy enforced
  - [ ] Manual invitation system (optional)
  - [ ] Developer preferences (future enhancement)

- [ ] **Spec 5: Reviews & Ratings**
  - Review submission (client → developer, developer → client)
  - Rating calculations
  - Reputation tracking
  - Review display on profiles

- [ ] **Spec 6: Dispute Resolution**
  - Dispute filing
  - DAO arbitration
  - DisputeDAO contract
  - Evidence submission

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
- ✅ Role-based access control (client/developer permissions)
- ✅ State transition validation (prevent invalid milestone/project states)
- ✅ Budget validation (milestone budgets cannot exceed project budget)
- ✅ Ownership verification (only project owner can update)
- ✅ No-refusal policy enforcement (prevent selective work)
- ✅ Escrow fund protection (per-project freeze capability)
- ✅ Immutable payment history (trigger-enforced audit trail)
- ✅ Safe ERC20 transfers (OpenZeppelin SafeERC20)
- ✅ Payment atomicity (milestone only completed if payment succeeds)
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
