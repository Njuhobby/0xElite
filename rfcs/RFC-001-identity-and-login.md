# RFC-001: Identity and Login System

## Metadata
- **Status**: Accepted
- **Created**: 2026-01-23
- **Author**: @yihaojiang

## Background

0xElite is a Web3 platform connecting elite developers with quality projects. A fundamental design decision is how users authenticate and how accounts are structured.

Key considerations:
- The platform serves two user types: Clients (project owners) and Developers
- Developers need verifiable credentials and on-chain reputation
- The system should be Web3-native while remaining practical

## Problem Statement

1. How should users log in to the platform?
2. Should Clients and Developers have the same login mechanism?
3. How should wallet addresses relate to user accounts?

## Proposed Solutions

### Option A: Pure Wallet Login (Web3 Native)

Users connect wallet, sign a verification message, and are logged in. Wallet address = identity.

**Pros:**
- No passwords to manage
- Fully decentralized
- Natural fit for on-chain reputation (SBT)
- Wallet address can own NFTs, receive payments directly

**Cons:**
- Users must have a wallet
- Losing wallet = losing account
- One person can have unlimited wallets/accounts (Sybil risk)

### Option B: Hybrid Login (Email + Wallet)

Traditional registration with email/password, then bind a wallet.

**Pros:**
- Lower barrier to entry
- Account recovery possible
- Familiar to Web2 users

**Cons:**
- Not Web3-native
- Requires maintaining user database
- Email can also be created infinitely (same Sybil risk)

### Option C: Social + Wallet (OAuth)

Login via GitHub/Google, then bind wallet.

**Pros:**
- Developer-friendly (GitHub verification built-in)
- Easier onboarding

**Cons:**
- Depends on centralized services
- Not aligned with decentralization ethos

## Decision

**Selected: Option A - Pure Wallet Login**

Rationale:
- Maintains Web3-native experience
- Aligns with platform's decentralized architecture
- Wallet address directly links to Membership NFT and Reputation SBT
- Sybil risks are addressed separately (see RFC-002)

### Implementation Details

```
Login Flow:
1. User clicks "Connect Wallet"
2. Wallet prompts signature of verification message
3. Backend verifies signature
4. If wallet has Membership NFT → logged in as Developer
5. If no Membership NFT → can operate as Client or apply for Developer membership
```

### Client vs Developer Authentication

Same login mechanism, different registration flows:

| Role | Login | Registration |
|------|-------|--------------|
| Client | Wallet signature | Immediate access, can post projects |
| Developer | Wallet signature | Apply → Stake → Verification → DAO Vote → Membership NFT |

### Wallet-Account Relationship

**1:1 binding** - Wallet address IS the account identity.

- Membership NFT bound to this address
- Reputation SBT bound to this address
- All payments sent to this address

## Consequences

1. Users without wallets cannot use the platform (acceptable for Web3 target audience)
2. Wallet security becomes critical for users
3. Need robust Sybil prevention (addressed in RFC-002)
4. Lost wallet = lost reputation (could add social recovery in future)

## Open Questions

1. Should we support multiple wallet types (EOA vs smart contract wallets)?
2. Future consideration: Account abstraction (ERC-4337) for better UX?

## References

- [ERC-4337: Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)
- RFC-002: Sybil Prevention Mechanism
