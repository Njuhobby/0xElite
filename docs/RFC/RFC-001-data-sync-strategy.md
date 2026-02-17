# RFC-001: On-chain and Off-chain Data Synchronization Strategy

| Field       | Value                                   |
|-------------|-----------------------------------------|
| RFC         | 001                                     |
| Title       | On-chain and Off-chain Data Synchronization Strategy |
| Author      | 0xElite Team                            |
| Status      | Accepted                                |
| Created     | 2026-02-17                              |
| Updated     | 2026-02-17                              |

---

## 1. Context

0xElite is a decentralized platform that manages user funds through smart contracts (EscrowVault, StakeVault, ProjectManager) while also maintaining a traditional backend (Express.js + PostgreSQL) for complex queries, search, and UI rendering.

This creates a fundamental question: **how should the frontend retrieve on-chain data?**

---

## 2. Problem Statement

Smart contracts emit events and store state on-chain, but:

- Querying the blockchain directly is slow and limited (no complex filtering, sorting, or aggregation)
- The frontend needs fast, responsive data access
- Users need to trust that the data they see is accurate

We need a synchronization strategy that balances **performance**, **decentralization**, and **trustworthiness**.

---

## 3. Options Considered

### Option A: Backend Indexer Only (Self-hosted)

```
Blockchain → Event Listener → PostgreSQL → REST API → Frontend
```

- **How it works**: A Node.js service (escrowEventListener.ts) listens to on-chain events, writes to PostgreSQL. Frontend reads from REST API.
- **Pros**: Fast queries, full flexibility, simple to implement
- **Cons**: Centralized — if our database is tampered with, users see wrong data. If our server goes down, users lose access. Users must trust us.

### Option B: Direct On-chain Reads Only

```
Frontend → wagmi/viem → Blockchain (RPC)
```

- **How it works**: Frontend calls contract view functions directly via wagmi hooks (useReadContract).
- **Pros**: Fully decentralized, trustless, real-time accurate
- **Cons**: Slow, no complex queries (can't do "list all projects sorted by budget"), expensive for heavy reads, RPC rate limits

### Option C: The Graph (Decentralized Indexer)

```
Blockchain → Subgraph → GraphQL API → Frontend
```

- **How it works**: Write a Subgraph definition, deploy to The Graph network. Multiple independent nodes index the data. Frontend queries via GraphQL.
- **Pros**: Decentralized indexing, community-maintained, no single point of failure
- **Cons**: Learning curve (GraphQL, Subgraph schema), costs GRT tokens per query, less flexible than custom backend

### Option D: Hybrid Approach (Recommended)

```
Critical data:    Frontend → wagmi → Blockchain (direct read)
Historical data:  Frontend → The Graph (decentralized index)
Off-chain data:   Frontend → Backend API → PostgreSQL
```

- **How it works**: Use the right tool for each data type based on trust requirements.
- **Pros**: Best of all worlds — trustless for critical data, performant for complex queries
- **Cons**: More complexity in frontend, multiple data sources to manage

---

## 4. Decision

**We adopt a phased hybrid approach (Option D).**

### Phase 1: Current (MVP)

Use **Option A** (self-hosted indexer) for all data.

**Rationale**: We are in early development. The priority is shipping a working product. The escrowEventListener already works and syncs on-chain events to PostgreSQL. This is sufficient for MVP and testing.

**Accepted tradeoffs**:
- Database is the source of truth for the UI (centralized)
- Users must trust us not to tamper with data
- If our server goes down, UI loses data access (but funds are safe on-chain)

### Phase 2: Short-term Improvement

Add **direct on-chain reads** for critical financial data.

**What changes**:
- Escrow balances: read directly from EscrowVault contract via wagmi
- Stake amounts: read directly from StakeVault contract via wagmi
- Project frozen status: read directly from chain
- Keep backend indexer as a cache/fallback for historical queries

**Rationale**: Users should not have to trust us for data that determines how much money they have. Direct on-chain reads ensure accuracy for the most important data points.

### Phase 3: Long-term

Migrate historical/aggregate data to **The Graph**.

**What changes**:
- Create Subgraphs for EscrowVault, StakeVault, ProjectManager
- Frontend queries The Graph for transaction history, project listings, developer stats
- Backend database only stores truly off-chain data (profiles, descriptions, matching preferences)
- Backend indexer is retired or kept only for platform-internal analytics

**Rationale**: Removes the single point of failure for indexed data. The Graph is the industry standard (used by Uniswap, Aave, OpenSea).

---

## 5. Data Source Matrix

| Data | Phase 1 (Now) | Phase 2 | Phase 3 |
|------|---------------|---------|---------|
| Escrow balance | Database | **Direct chain read** | Direct chain read |
| Stake amount | Database | **Direct chain read** | Direct chain read |
| Project frozen status | Database | **Direct chain read** | Direct chain read |
| Transaction history | Database | Database | **The Graph** |
| Project list (with filters) | Database | Database | **The Graph** + Database |
| Developer profile | Database | Database | Database |
| Project description | Database | Database | Database |
| Matching algorithm | Database | Database | Database |
| User email | Database | Database | Database |

---

## 6. Implications for escrowEventListener

The escrowEventListener (backend/src/services/escrowEventListener.ts) will evolve across phases:

- **Phase 1**: Primary data source for all on-chain data
- **Phase 2**: Still runs, but frontend uses direct chain reads for critical data. Indexer serves as cache for complex queries and historical data.
- **Phase 3**: Potentially retired if The Graph covers all indexed data needs. May be kept for internal analytics or as a fallback.

The listener is NOT wasted work — it was necessary for MVP and still useful as a reference implementation for the Subgraph mapping logic.

---

## 7. Industry Precedent

| Project | Critical Data | Historical Data | Off-chain Data |
|---------|---------------|-----------------|----------------|
| Uniswap | Direct chain read | The Graph | None (fully on-chain) |
| Aave | Direct chain read | The Graph | Governance forum |
| OpenSea | Direct chain read | Backend indexer | Backend database |
| Compound | Direct chain read | The Graph | Backend API |

Our Phase 3 architecture aligns with the Aave/Compound model, which is appropriate for a platform that has both on-chain financial operations and off-chain business logic (matching, profiles).

---

## 8. Open Questions

1. **When to start Phase 2?** — Recommended after contracts are deployed to testnet and basic user testing begins.
2. **When to start Phase 3?** — Recommended when user volume justifies the overhead of maintaining a Subgraph, or when trust/decentralization becomes a user requirement.
3. **Should we add a "Verify on-chain" button in the UI?** — Would let users compare what the UI shows vs. what's actually on-chain. Low effort, high trust signal.

---

## 9. References

- [The Graph Documentation](https://thegraph.com/docs/)
- [OpenZeppelin Defender (monitoring)](https://docs.openzeppelin.com/defender/)
- [wagmi useReadContract](https://wagmi.sh/react/api/hooks/useReadContract)
- escrowEventListener implementation: `backend/src/services/escrowEventListener.ts`
