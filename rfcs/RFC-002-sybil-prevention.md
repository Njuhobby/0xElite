# RFC-002: Sybil Prevention Mechanism

## Metadata
- **Status**: Accepted
- **Created**: 2026-01-23
- **Author**: @yihaojiang

## Background

With pure wallet-based authentication (RFC-001), a single person can create unlimited wallet addresses, leading to potential Sybil attacks:

1. Creating many accounts to increase project matching probability
2. Gaming DAO voting with multiple accounts
3. Manipulating reputation systems

## Problem Statement

How do we prevent Sybil attacks while maintaining the Web3-native login experience?

## Proposed Solutions

### Option A: Identity Verification (KYC/Proof of Humanity)

Require identity verification through services like Worldcoin, BrightID, or traditional KYC.

**Pros:**
- Strong 1 human = 1 account guarantee

**Cons:**
- Reduces anonymity
- Requires trust in verification services
- May exclude users from certain regions

### Option B: Economic Staking

Require staking tokens to become a Developer member.

**Pros:**
- Makes Sybil attacks economically expensive
- No identity verification needed
- Stake can be returned (not a fee)

**Cons:**
- Wealthy attackers can still create multiple accounts
- May exclude developers with limited capital

### Option C: Social Verification (GitHub binding)

Prevent multiple accounts from binding to the same GitHub account.

**Pros:**
- Hard to maintain multiple high-quality GitHub accounts
- Natural for developer audience

**Cons:**
- Not a complete solution alone
- Some developers may not have GitHub

### Option D: Labor-based Sybil Resistance

Since developers cannot refuse assigned tasks, maintaining multiple accounts requires completing multiple workloads.

**Pros:**
- Natural economic disincentive
- No additional verification needed
- Aligned with platform mechanics

**Cons:**
- Only works for active accounts

## Decision

**Selected: Layered Defense (B + C + D)**

A three-layer Sybil prevention system:

```
Layer 1: Economic Cost
└── Stake USDC to become a Developer member
    └── Creates financial barrier to account creation

Layer 2: Labor Cost
└── Cannot refuse task assignments without reputation penalty
    └── Each account requires continuous effort to maintain
    └── One person cannot realistically maintain many accounts

Layer 3: Opportunity Cost
└── Higher reputation = access to better projects = higher income
    └── Abandoning high-reputation account for new ones is irrational
```

### Staking Mechanism

```
Initial Stake: ~150 USDC (dynamically adjustable)

Stake destination: Deposited into Aave for yield
Yield ownership: Developer keeps all interest earned

Unlock schedule:
├── Complete 10 projects → Unlock 50 USDC
├── Complete 25 projects → Unlock 50 USDC
└── Minimum retained: 50 USDC (always)

Exit process:
├── Request exit
├── 30-day cooling period (must complete current projects)
├── Return full remaining stake
└── Account deactivated, reputation reset to zero
```

### Why This Stake Return Design?

| Concern | Solution |
|---------|----------|
| "Stake returned too early → fund new accounts" | Gradual unlock tied to project completion |
| "Stake returned too late → developer complaints" | Stake earns yield while locked |
| "After unlock, low stake remaining" | High reputation = high earning potential, not worth abandoning |
| "Exit and create new account" | Exit = lose all reputation, start from zero |

### GitHub Binding (Optional Enhancement)

- Not mandatory for membership
- If bound, system rejects other accounts binding same GitHub
- Provides additional Sybil resistance for those who opt in

## Consequences

1. Developers need upfront capital (150 USDC) - may exclude some
2. Dynamic stake threshold needed to adjust for market conditions
3. Stake management adds smart contract complexity
4. Exit process needs careful implementation to prevent gaming

## Open Questions

1. How to set initial stake amount? Market-based? Fixed?
2. Should stake amount vary by developer tier/experience?
3. How to handle stake if platform shuts down?

## References

- RFC-001: Identity and Login System
- RFC-003: Task Assignment and Rejection
- [Gitcoin Passport](https://passport.gitcoin.co/) - Alternative identity aggregation
