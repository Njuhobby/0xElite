# 0xElite

**Where Top Web3 Talent Meets Quality Projects**

A decentralized platform that connects elite Web3 developers with quality projects through curated membership, on-chain escrow, and DAO governance.

![Solidity](https://img.shields.io/badge/Solidity-^0.8.22-363636?logo=solidity)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)
![Arbitrum](https://img.shields.io/badge/Arbitrum-Sepolia-28A0F0?logo=arbitrum)
![License](https://img.shields.io/badge/License-MIT-green)

---

## The Problem

Traditional freelance platforms suffer from a race to the bottom — clients get unreliable talent, developers compete on price instead of quality, funds sit in opaque escrow systems, and disputes are resolved by centralized arbitrators with no accountability. There's no trust layer.

**0xElite fixes this** by using Web3 primitives — staking, smart contract escrow, and DAO governance — to align incentives for both sides.

## How It Works

**Curated Membership** — Developers stake USDC to join, proving commitment and enabling Sybil resistance. Only serious builders get in.

**Smart Matching** — An algorithm scores developers on skill overlap, availability, and reputation to auto-assign the best fit for each project.

**On-Chain Escrow** — Clients deposit the full project budget into a smart contract. Funds release automatically per milestone — no manual invoicing, no trust required.

**DAO Arbitration** — Disputes are resolved by community vote (weighted by soulbound governance tokens), not by a centralized support team.

## Architecture

```
┌──────────────────────────────────────────────┐
│        Frontend (Next.js + wagmi + viem)      │
│                localhost:3000                  │
└───────────────────┬──────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────┐
│         Backend API (Express + TypeScript)     │
│                localhost:3001                  │
│                                                │
│   + Matching Algorithm    + Event Listeners    │
└─────────┬────────────────────────┬────────────┘
          │                        │
          ▼                        ▼
┌──────────────────┐   ┌───────────────────────┐
│   PostgreSQL     │   │   Smart Contracts     │
│                  │◄──┤   (Arbitrum)          │
│   Profiles,      │   │                       │
│   Projects,      │   │   StakeVault          │
│   Ratings,       │   │   ProjectManager      │
│   History        │   │   EscrowVault         │
│                  │   │   DisputeDAO          │
│                  │   │   EliteToken (xELITE) │
└──────────────────┘   └───────────────────────┘
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Contracts** | Solidity, Hardhat, OpenZeppelin v5 (UUPS upgradeable), Ethers.js |
| **Backend** | Node.js, Express 5, TypeScript, PostgreSQL, ethers.js v6, Jest |
| **Frontend** | Next.js 16, wagmi, viem, Tailwind CSS 4, React Query |

## Quick Start

**Prerequisites:** Node.js 20+, PostgreSQL 15+, a Web3 wallet

```bash
# 1. Run smart contract tests
cd contracts && npm install && npx hardhat test

# 2. Run backend tests
cd ../backend && npm install && npm test

# 3. Start the frontend
cd ../frontend && npm install && npm run dev
```

Each package has its own `.env.example` — copy and configure before running in development mode. See the setup details in each subdirectory.

## Documentation

| Resource | Description |
|----------|-------------|
| [`specs/`](./specs/) | Full technical specifications — capabilities, data models, API definitions |
| [`specs/architecture/`](./specs/architecture/) | System design docs for each contract and service |
| [`specs/RFC/`](./specs/RFC/) | RFCs on key design decisions (data sync, on-chain storage, identity, Sybil prevention, etc.) |
| [`docs/`](./docs/) | Project overview and supplementary docs |

## License

MIT

---

Built as a Web3 Capstone Project.
