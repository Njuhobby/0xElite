# 0xElite

**The Elite Dev Protocol** - A decentralized platform exclusively for top-tier Web3 developers.

## Overview

0xElite connects elite Web3 developers with quality projects through curated membership and proactive matching. Unlike traditional freelance platforms, we:

- **Curate membership** - Only verified developers accepted through DAO voting
- **Match proactively** - Platform assembles teams, no bidding wars
- **Secure payments** - Milestone-based escrow with on-chain protection
- **Build reputation** - Soulbound tokens (SBT) for immutable track records

## Key Features

| Feature | Description |
|---------|-------------|
| **Wallet Login** | Web3-native authentication, no passwords |
| **Membership NFT** | Non-transferable proof of elite status |
| **Reputation SBT** | On-chain career history that follows you |
| **Smart Escrow** | Funds protected until milestones delivered |
| **DAO Arbitration** | Decentralized dispute resolution |
| **Anti-Sybil** | Staking + labor cost prevents fake accounts |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│                    wagmi + viem + Tailwind                   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Membership   │    │    Project    │    │    Escrow     │
│     NFT       │    │    Manager    │    │    Vault      │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Reputation   │    │   Dispute     │    │   Treasury    │
│     SBT       │    │     DAO       │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity 0.8.20+, Foundry |
| Contract Libraries | OpenZeppelin |
| Frontend | Next.js 14, TypeScript |
| Web3 Integration | wagmi, viem |
| Styling | Tailwind CSS |
| Storage | IPFS (Pinata) |
| Network | Sepolia (testnet), Arbitrum/Base (mainnet) |

## Project Structure

```
0xElite/
├── frontend/              # Next.js dApp
│   ├── src/
│   │   ├── app/           # Pages and layouts
│   │   ├── components/    # React components
│   │   ├── providers/     # Web3 providers
│   │   └── config/        # wagmi configuration
│   └── package.json
│
├── contracts/             # Smart contracts (coming soon)
│
├── specs/                 # Technical specifications
│   ├── architecture/      # System design docs
│   ├── capabilities/      # Feature specs
│   ├── data-models/       # Data structure definitions
│   └── api/               # API specifications
│
├── rfcs/                  # Design decisions & discussions
│   ├── RFC-001-identity-and-login.md
│   ├── RFC-002-sybil-prevention.md
│   └── RFC-003-task-assignment.md
│
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Web3 wallet (MetaMask, etc.)

### Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Documentation

- [Project Plan](./0xElite-ProjectPlan.md) - Full project specification
- [RFCs](./rfcs/) - Design decisions and rationale
- [Specs](./specs/) - Technical specifications

### Key Design Decisions

| Topic | RFC |
|-------|-----|
| Identity & Login | [RFC-001](./rfcs/RFC-001-identity-and-login.md) |
| Sybil Prevention | [RFC-002](./rfcs/RFC-002-sybil-prevention.md) |
| Task Assignment | [RFC-003](./rfcs/RFC-003-task-assignment.md) |

## Roadmap

- [x] Phase 1: Frontend scaffold with Web3 integration
- [ ] Phase 2: Core smart contracts (Membership, Reputation)
- [ ] Phase 3: Project management & Escrow contracts
- [ ] Phase 4: DAO arbitration system
- [ ] Phase 5: Testnet deployment & audit

## License

MIT

---

Built for Web3 Capstone Project
