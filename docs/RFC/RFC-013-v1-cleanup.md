# RFC-013: Drop Legacy V1 ProjectManager API

| Field    | Value                                          |
|----------|------------------------------------------------|
| RFC      | 013                                            |
| Title    | Drop Legacy V1 ProjectManager API              |
| Author   | 0xElite Team                                   |
| Status   | Accepted                                       |
| Created  | 2026-05-04                                     |
| Updated  | 2026-05-04                                     |

---

## 1. Context

When RFC-008 moved milestone state on-chain, it added new contract entrypoints to `ProjectManager`:

- `createProjectWithMilestones(totalBudget, milestoneBudgets[], milestoneHashes[])`
- `assignDevelopers(projectId, address[])`
- `approveMilestone(projectId, milestoneIndex)`
- `updateMilestoneStatus(projectId, milestoneIndex, newStatus)`

The pre-existing entrypoints that the new API was meant to supersede:

- `createProject(totalBudget)` (single-developer, no milestones)
- `assignDeveloper(projectId, address)` (singular, paired with the above)
- `updateProjectState(projectId, newState)` (off-chain backend relayed milestone-driven state changes onto the chain)

For a few weeks both APIs coexisted in the contract. Some terminology in the codebase referred to "V1" and "V2" as if they were distinct contract versions — they weren't. The "V1" entrypoints were always sitting in the same contract as the "V2" ones; it was a dual API on a single deployment, not an upgrade story.

User pushback once this became apparent: *"等下，哪里的v1 v2合约，我们现在只在本地debug，完全没有上线，根本用不到contract升级啊？"*

---

## 2. Problem Statement

We were carrying compatibility code (parallel API surfaces, conditional branches keyed off a `uses_onchain_milestones` flag in the `projects` table, fallback paths in MilestoneCard) for an upgrade scenario that did not exist. The platform was never deployed publicly; there was nothing to be backwards-compatible *with*.

This carried real costs:

- ~600 lines of dead branches in backend route handlers and frontend components.
- The `uses_onchain_milestones` flag in the schema was always TRUE since V2 launch but conditionally read everywhere.
- New developer reading the code couldn't tell which branch was canonical.
- Tests had stale stubs for V1 entrypoints that no test path actually exercised.

---

## 3. Decision

Treat the local-debug state as the only state. Remove every V1 surface:

### 3.1 Contract (`ProjectManager.sol`)

Remove these symbols entirely:

- `function createProject(uint256 totalBudget) external returns (uint256)`
- `function assignDeveloper(uint256 projectId, address developer) external`
- `function updateProjectState(uint256 projectId, ProjectState newState) external`
- `event DeveloperAssigned(uint256 indexed projectId, address indexed developer)`

Keep `event ProjectStateChanged(...)` — the V2 paths (`createProjectWithMilestones`, `_checkProjectCompletion`, `assignDevelopers`) emit it, so it's still meaningful.

### 3.2 Backend

- `backend/src/index.ts`: drop V1 ABI entries (`createProject`, `assignDeveloper`, `updateProjectState`, `DeveloperAssigned`) from the contract instance. Drop V1 ABI from `pendingTxActions.Contracts`.
- `backend/src/api/routes/projects.ts`: stop reading or writing `uses_onchain_milestones` in queries and INSERT/UPDATE statements. Stop returning it in API responses.
- `backend/src/api/routes/milestones.ts`: drop the V2_ONCHAIN_REQUIRED 422 guard, drop the entire ~220-line `if (status === 'completed')` block (platform fee tier calc, escrow release, project-completion bookkeeping, `updateProjectState` relay) — this was the V1 backend-mediated approval pipeline. The whole route file was eventually deleted in RFC-009 once Mark-as-Complete moved to dev-signed.
- `backend/src/services/matchingAlgorithm.ts`: change `assignDeveloper(projectId, address)` calls to `assignDevelopers(projectId, [address])` (V2 plural).
- Migration `016_drop_uses_onchain_milestones.sql`: `ALTER TABLE projects DROP COLUMN uses_onchain_milestones`.

### 3.3 Frontend

- `MilestoneCard.tsx`: remove the V1 fallback branch in `handleApprove` — always go on-chain via wagmi.
- Remove the `usesOnchainMilestones` field from the `Milestone` interface and any consumer.

### 3.4 Tests

- `contracts/test/ProjectManager.test.js`: delete the "Simple Project Creation", "assignDeveloper (single)", and "Project State Management" describe blocks. Migrate remaining tests to V2 entrypoints.
- `contracts/test/DisputeDAO.test.js`: `setupProject` helper migrated to `createProjectWithMilestones` + `assignDevelopers`.
- `backend/src/__tests__/api/milestones.test.ts`: deleted later (RFC-009) when the route file was deleted.

---

## 4. Consequences

- The contract surface is smaller — easier to reason about, fewer attack-surface lines.
- The "V1/V2" terminology is retired; there's just "the API". When/if a real contract upgrade happens, it'll be a real version — proxy upgrade with explicit migration RFC.
- Code reviewers no longer need to track which branch is canonical.
- Net diff: ~580 lines deleted across 11 files (commit `c13092ff`).
- Database schema drift between dev environments is minimal; migration 016 is idempotent.

---

## 5. Lessons

- "Backwards-compatible scaffolding for an unshipped product" is a cost without a benefit. The instinct to support both old and new behavior is correct only when there's a real old user base on the old behavior.
- "V1 / V2" naming creates the *impression* of an upgrade story even when there is none. Naming matters: in this codebase, alternative API surfaces in the same contract should be named for what they do, not by version.
- Local-debug-only environments give us license to delete forward without compatibility shims. Use it.

---

## 6. References

- Implementation: commit `c13092ff` "refactor: drop legacy V1 project/milestone code paths"
- Schema: `backend/src/db/migrations/016_drop_uses_onchain_milestones.sql`
- Related: RFC-008 (on-chain milestones — what V2 added), RFC-010 (further simplification on top of the cleaned-up milestone surface)
