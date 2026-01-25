# Matching Algorithm Architecture

## Purpose

Automatically matches newly created projects with available elite developers based on skill overlap, availability, and workload distribution using a scoring algorithm.

## System Context

```
┌─────────────────┐
│  POST /projects │ (Client creates project)
└────────┬────────┘
         │
         ↓
┌─────────────────────────────┐
│  Matching Algorithm Service │
│  (Node.js/TypeScript)       │
└────────┬────────────────────┘
         │
         ├──→ Query available developers (PostgreSQL)
         ├──→ Calculate match scores
         ├──→ Select best match
         └──→ Assign developer (update DB + blockchain)
```



## Components

### Component: Matching Algorithm Service

**Type**: Backend Service
**Technology**: Node.js 20 + TypeScript
**Responsibility**: Auto-assigns developers to projects using skill-based scoring algorithm with availability and workload consideration

**Algorithm Flow**:

```typescript
interface MatchingResult {
  developerId: string;
  score: number;
  skillOverlap: number;
  availabilityBonus: number;
  reputationBonus: number;
}

/**
 * Auto-assign developer to a newly created project
 *
 * @param projectId - UUID of the project to assign
 * @returns Assigned developer address or null if no match
 */
async function assignDeveloperToProject(projectId: string): Promise<string | null> {
  // 1. Fetch project details
  const project = await getProject(projectId);

  // 2. Query available developers
  const availableDevelopers = await getAvailableDevelopers();

  if (availableDevelopers.length === 0) {
    // No available developers - add to pending queue
    await addToPendingQueue(projectId);
    return null;
  }

  // 3. Calculate match scores for each developer
  const matchResults: MatchingResult[] = availableDevelopers.map(dev =>
    calculateMatchScore(project, dev)
  );

  // 4. Sort by score (highest first)
  matchResults.sort((a, b) => b.score - a.score);

  // 5. Select top match
  const bestMatch = matchResults[0];

  // 6. Assign developer
  await assignDeveloper(projectId, bestMatch.developerId);

  return bestMatch.developerId;
}

/**
 * Calculate match score between project and developer
 *
 * Score Components:
 * - Skill Overlap (0-100 points): % of required skills the developer has
 * - Availability Bonus (0-20 points): Time since last assignment
 * - Reputation Bonus (0-10 points): Developer rating
 *
 * Total: 0-130 points
 */
function calculateMatchScore(
  project: Project,
  developer: Developer
): MatchingResult {
  // Skill overlap calculation
  const requiredSkills = new Set(project.requiredSkills);
  const developerSkills = new Set(developer.skills);

  const matchingSkills = [...requiredSkills].filter(skill =>
    developerSkills.has(skill)
  );

  const skillOverlap = (matchingSkills.length / requiredSkills.size) * 100;

  // Availability bonus (developers idle longer get priority)
  let availabilityBonus = 0;
  if (developer.lastAssignmentAt) {
    const daysSinceLastAssignment =
      (Date.now() - developer.lastAssignmentAt.getTime()) / (1000 * 60 * 60 * 24);
    availabilityBonus = Math.min(daysSinceLastAssignment * 2, 20); // Max 20 points
  } else {
    availabilityBonus = 20; // Never assigned - full bonus
  }

  // Reputation bonus
  const reputationBonus = developer.averageRating
    ? (developer.averageRating / 5) * 10  // 0-5 stars → 0-10 points
    : 5; // Neutral for new developers

  // Total score
  const score = skillOverlap + availabilityBonus + reputationBonus;

  return {
    developerId: developer.walletAddress,
    score,
    skillOverlap,
    availabilityBonus,
    reputationBonus
  };
}

/**
 * Query available developers from database
 */
async function getAvailableDevelopers(): Promise<Developer[]> {
  const result = await db.query(
    `SELECT wallet_address, skills, average_rating, last_assignment_at
     FROM developers
     WHERE availability = 'available'
     AND status = 'active'
     ORDER BY last_assignment_at ASC NULLS FIRST`,
  );

  return result.rows;
}

/**
 * Assign developer to project (update DB + blockchain)
 */
async function assignDeveloper(projectId: string, developerAddress: string): Promise<void> {
  // Start transaction
  await db.query('BEGIN');

  try {
    // 1. Update project in database
    await db.query(
      `UPDATE projects
       SET assigned_developer = $1,
           assigned_at = NOW(),
           status = 'active',
           updated_at = NOW()
       WHERE id = $2`,
      [developerAddress, projectId]
    );

    // 2. Update developer status
    await db.query(
      `UPDATE developers
       SET current_project_id = $1,
           availability = 'busy',
           last_assignment_at = NOW(),
           updated_at = NOW()
       WHERE wallet_address = $2`,
      [projectId, developerAddress]
    );

    // 3. Get on-chain project ID
    const { contractProjectId } = await db.query(
      'SELECT contract_project_id FROM projects WHERE id = $1',
      [projectId]
    ).then(r => r.rows[0]);

    // 4. Update blockchain state
    const tx = await projectManagerContract.assignDeveloper(
      contractProjectId,
      developerAddress
    );
    await tx.wait();

    // 5. Send notification to developer
    await sendAssignmentNotification(developerAddress, projectId);

    // Commit transaction
    await db.query('COMMIT');

    logger.info('Developer assigned', {
      projectId,
      developerAddress,
      txHash: tx.hash
    });
  } catch (error) {
    // Rollback on error
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Process pending assignment queue
 * Called when a developer becomes available
 */
async function processPendingQueue(): Promise<void> {
  // Get pending projects (draft status, no assigned developer)
  const pendingProjects = await db.query(
    `SELECT id, required_skills
     FROM projects
     WHERE status = 'draft'
     AND assigned_developer IS NULL
     ORDER BY created_at ASC`
  );

  for (const project of pendingProjects.rows) {
    const assigned = await assignDeveloperToProject(project.id);

    if (assigned) {
      logger.info('Processed pending project', {
        projectId: project.id,
        developerAddress: assigned
      });
    } else {
      // Still no available developers, stop processing
      break;
    }
  }
}
```

**Interfaces**:
- Internal function: `assignDeveloperToProject(projectId)`
- Webhook trigger: `processPendingQueue()` on developer status change

**Dependencies**:
- PostgreSQL 15 (developers, projects tables)
- ethers.js v6 (blockchain interaction)
- ProjectManager contract (assignDeveloper function)

**Configuration**:

| Parameter | Value | Notes |
|-----------|-------|-------|
| `MIN_SKILL_OVERLAP` | 50% | Minimum required skill match percentage |
| `IDLE_BONUS_MAX` | 20 points | Maximum bonus for idle time |
| `IDLE_BONUS_RATE` | 2 points/day | Bonus accumulation rate |

**Algorithm Properties**:

**Fairness**:
- Developers with longer idle time get priority (prevents always assigning same person)
- New developers (no rating) get neutral score (5/10 points)
- Skill match is primary factor (up to 100 points)

**Efficiency**:
- O(n) complexity where n = number of available developers
- Typical case: < 100ms for 50 developers
- Database query optimized with index on `availability` + `last_assignment_at`

**Transparency**:
- Match scores logged for audit trail
- Developers can see why they were/weren't assigned (future feature)

**Edge Cases**:

1. **No available developers**: Project stays in "draft", added to pending queue
2. **Tie scores**: First in database order wins (based on `last_assignment_at ASC`)
3. **All developers busy**: Pending queue processed when any developer finishes
4. **Partial skill match**: Requires at least 50% overlap to be considered

## Design Decisions

### Decision: Use Scoring Algorithm Instead of Perfect Match

**Status**: Accepted
**Date**: 2024-01-25

**Context**:
Need to decide between waiting for perfect skill match vs. assigning best available developer with partial match.

**Decision**:
Use scoring algorithm that allows partial skill matches (minimum 50% overlap) with bonuses for availability and reputation.

**Consequences**:
- ✅ Faster project assignment (less time in pending queue)
- ✅ Fairer workload distribution among developers
- ✅ Developers with broader skill sets get more opportunities
- ⚠️ Some projects assigned to developers missing some required skills (mitigated by 50% minimum)
- ⚠️ Clients may receive developers not perfect for their needs (acceptable trade-off)

**Alternatives Considered**:
1. **Perfect match only**: Rejected due to long wait times and inefficient developer utilization
2. **Round-robin assignment**: Rejected due to ignoring skill requirements entirely
3. **Manual assignment**: Rejected due to scaling issues and human bias

### Decision: No-Refusal Policy

**Status**: Accepted
**Date**: 2024-01-25

**Context**:
Per RFC-002, developers cannot refuse assignments to prevent Sybil attacks (stake and refuse work).

**Decision**:
Auto-assignment is binding. Developers are immediately assigned without confirmation.

**Consequences**:
- ✅ Prevents Sybil attacks (developers must work or lose stake)
- ✅ Faster project starts (no waiting for acceptance)
- ✅ Predictable timelines for clients
- ⚠️ Developers may be assigned projects outside comfort zone (mitigated by skill matching)

**Alternatives Considered**:
1. **Accept/Reject with penalty**: Rejected as still allows selective work
2. **Opt-in preferences**: Rejected as introduces gaming potential

## Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| Assignment time | < 2 seconds | From project creation to assignment |
| Score calculation | < 10ms per developer | For 50 developers → 500ms total |
| Database query | < 100ms | Fetch available developers |
| Blockchain transaction | < 30 seconds | Arbitrum L2 confirmation |

## Monitoring

**Metrics**:
- Assignment success rate (% of projects assigned immediately)
- Average time in pending queue
- Skill match distribution (histogram of skill overlap percentages)
- Developer utilization (% time busy vs. available)

**Alerts**:
- Pending queue > 10 projects → need more developers
- Average assignment time > 5 seconds → database optimization needed
- Skill match < 60% frequently → need developers with different skills

## Related Specs

- **Capabilities**: `capabilities/project-management/spec.md`
- **Data Models**: `data-models/project/schema.md`, `data-models/developer/schema.md`
- **APIs**: `api/project-management/spec.md`
- **Architecture**: `architecture/project-manager-contract/spec.md`
- **RFCs**: [RFC-002](../../../../rfcs/RFC-002-sybil-prevention.md), [RFC-003](../../../../rfcs/RFC-003-task-assignment.md)
