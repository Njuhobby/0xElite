# RFC-003: Task Assignment and Rejection Policy

## Metadata
- **Status**: Accepted
- **Created**: 2026-01-23
- **Author**: @yihaojiang

## Background

0xElite uses a **proactive matching** model rather than passive job boards. The platform assigns developers to projects based on skills, availability, and reputation. This document defines the rules around task assignment and what happens when developers decline assignments.

## Problem Statement

1. Can developers refuse assigned tasks?
2. What are the consequences of refusal?
3. How do we balance platform efficiency with developer autonomy?
4. How does this interact with Sybil prevention?

## Proposed Solutions

### Option A: Complete Freedom

Developers can freely accept or reject any assignment.

**Pros:**
- Maximum developer autonomy
- Developers only take projects they're excited about

**Cons:**
- Defeats the purpose of proactive matching
- Clients face delays as assignments bounce around
- Enables gaming (accept only easy/high-paying projects)

### Option B: No Refusal Allowed

Developers must accept all assignments or face severe penalties.

**Pros:**
- Maximum platform efficiency
- Strong Sybil resistance (each account = workload commitment)

**Cons:**
- Too rigid, developers may have legitimate reasons
- Could lead to poor quality work on unwanted projects

### Option C: Limited Refusal with Consequences

Developers can refuse, but it impacts their reputation. Legitimate exceptions are defined.

**Pros:**
- Balances efficiency and autonomy
- Maintains Sybil resistance
- Accommodates real-life situations

**Cons:**
- More complex to implement
- Edge cases need careful handling

## Decision

**Selected: Option C - Limited Refusal with Consequences**

### Rejection Penalty Structure

```
Rejection consequences (rolling 90-day window):

1st rejection: Warning + Reputation -5%
2nd rejection: Reputation -15%
3rd rejection: Reputation -30% + Matching suspended 30 days
4th rejection: Review for membership revocation
```

### Valid Exceptions (No Penalty)

| Exception | Condition |
|-----------|-----------|
| Capacity limit | Already has 2+ active projects |
| Skill mismatch | Project requires skills not in developer's profile |
| Vacation mode | Pre-set "unavailable" status before assignment |
| Conflict of interest | Competing project, disclosed proactively |

### How Exceptions Work

```
Assignment received
       ↓
Developer claims exception within 24 hours
       ↓
Platform reviews:
├── Valid exception → Reassign, no penalty
└── Invalid exception → Counts as rejection
```

### Sybil Resistance Connection

This policy creates natural Sybil resistance through labor cost:

```
Multiple accounts scenario:

Account A: Assigned Project X → Must complete or lose reputation
Account B: Assigned Project Y → Must complete or lose reputation
Account C: Assigned Project Z → Must complete or lose reputation

Reality: One person cannot do 3x the work
Result: Either burnout, or rejections tank all accounts' reputation
Conclusion: Maintaining multiple accounts is impractical
```

### Fair Distribution Considerations

To prevent "rich get richer" (senior developers monopolizing projects):

```
Matching algorithm factors:

Base reputation weight:     60%
Skill match weight:         30%
Newcomer bonus:             10%

Modifiers:
├── Newcomer protection: First 90 days +20% matching priority
├── Active project penalty: 2+ projects in progress → -30%
├── Cooldown: Just completed project → 48h reduced priority
└── Newcomer quota: 20% of monthly projects reserved for new members
```

## Consequences

1. Developers must be thoughtful about availability before joining
2. Platform needs robust exception handling system
3. Matching algorithm must be transparent to build trust
4. May need adjustment based on real usage patterns

## Open Questions

1. Should rejection penalties decay over time?
2. How to handle repeated edge cases (developer always "at capacity")?
3. Should high-reputation developers get more flexibility?
4. How to define "skill mismatch" objectively?

## References

- RFC-001: Identity and Login System
- RFC-002: Sybil Prevention Mechanism
- 0xElite Project Plan - Section 4.2 (Project Management)
