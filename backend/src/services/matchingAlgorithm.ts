import { Pool } from 'pg';
import { ethers } from 'ethers';
import { logger } from '../utils/logger';

interface MatchingResult {
  developerId: string;
  score: number;
  skillOverlap: number;
  availabilityBonus: number;
  reputationBonus: number;
}

interface Developer {
  walletAddress: string;
  skills: string[];
  averageRating: number | null;
  lastAssignmentAt: Date | null;
}

interface Project {
  id: string;
  requiredSkills: string[];
  totalBudget: string;
  contractProjectId: number;
}

// Configuration
const MIN_SKILL_OVERLAP_PERCENT = 50;
const IDLE_BONUS_MAX = 20;
const IDLE_BONUS_RATE = 2; // points per day

/**
 * Auto-assign developer to a newly created project
 *
 * @param db - PostgreSQL connection pool
 * @param projectManagerContract - ethers.js contract instance
 * @param projectId - UUID of the project to assign
 * @returns Assigned developer address or null if no match
 */
export async function assignDeveloperToProject(
  db: Pool,
  projectManagerContract: ethers.Contract,
  projectId: string
): Promise<string | null> {
  try {
    // 1. Fetch project details
    const projectResult = await db.query(
      'SELECT id, required_skills, total_budget, contract_project_id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    const project: Project = {
      id: projectResult.rows[0].id,
      requiredSkills: projectResult.rows[0].required_skills,
      totalBudget: projectResult.rows[0].total_budget,
      contractProjectId: projectResult.rows[0].contract_project_id,
    };

    // 2. Query available developers
    const availableDevelopers = await getAvailableDevelopers(db);

    if (availableDevelopers.length === 0) {
      logger.info('No available developers for project assignment', { projectId });
      // Project stays in "draft" status, will be picked up when a developer becomes available
      return null;
    }

    // 3. Calculate match scores for each developer
    const matchResults: MatchingResult[] = availableDevelopers.map(dev =>
      calculateMatchScore(project, dev)
    );

    // 4. Filter by minimum skill overlap
    const validMatches = matchResults.filter(
      match => match.skillOverlap >= MIN_SKILL_OVERLAP_PERCENT
    );

    if (validMatches.length === 0) {
      logger.info('No developers meet minimum skill overlap requirement', {
        projectId,
        requiredSkills: project.requiredSkills,
        minOverlap: MIN_SKILL_OVERLAP_PERCENT,
      });
      return null;
    }

    // 5. Sort by score (highest first)
    validMatches.sort((a, b) => b.score - a.score);

    // 6. Select top match
    const bestMatch = validMatches[0];

    logger.info('Found best match for project', {
      projectId,
      developer: bestMatch.developerId,
      score: bestMatch.score,
      skillOverlap: bestMatch.skillOverlap,
    });

    // 7. Assign developer
    await assignDeveloper(db, projectManagerContract, project, bestMatch.developerId);

    return bestMatch.developerId;
  } catch (error) {
    logger.error('Error assigning developer to project', { projectId, error });
    throw error;
  }
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
function calculateMatchScore(project: Project, developer: Developer): MatchingResult {
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
    availabilityBonus = Math.min(daysSinceLastAssignment * IDLE_BONUS_RATE, IDLE_BONUS_MAX);
  } else {
    // Never assigned - full bonus
    availabilityBonus = IDLE_BONUS_MAX;
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
    reputationBonus,
  };
}

/**
 * Query available developers from database
 */
async function getAvailableDevelopers(db: Pool): Promise<Developer[]> {
  const result = await db.query(
    `SELECT wallet_address, skills, average_rating, last_assignment_at
     FROM developers
     WHERE availability = 'available'
     AND status = 'active'
     ORDER BY last_assignment_at ASC NULLS FIRST`
  );

  return result.rows.map(row => ({
    walletAddress: row.wallet_address,
    skills: row.skills,
    averageRating: row.average_rating,
    lastAssignmentAt: row.last_assignment_at,
  }));
}

/**
 * Assign developer to project (update DB + blockchain)
 */
async function assignDeveloper(
  db: Pool,
  projectManagerContract: ethers.Contract,
  project: Project,
  developerAddress: string
): Promise<void> {
  const client = await db.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    // 1. Update project in database
    await client.query(
      `UPDATE projects
       SET assigned_developer = $1,
           assigned_at = NOW(),
           status = 'active',
           started_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [developerAddress, project.id]
    );

    // 2. Update developer status (triggers will handle availability sync)
    await client.query(
      `UPDATE developers
       SET current_project_id = $1,
           last_assignment_at = NOW(),
           updated_at = NOW()
       WHERE wallet_address = $2`,
      [project.id, developerAddress]
    );

    // 3. Update blockchain state
    logger.info('Assigning developer on-chain', {
      contractProjectId: project.contractProjectId,
      developer: developerAddress,
    });

    const tx = await projectManagerContract.assignDeveloper(
      project.contractProjectId,
      developerAddress
    );
    const receipt = await tx.wait();

    logger.info('Developer assigned on-chain', {
      projectId: project.id,
      developer: developerAddress,
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Commit transaction
    await client.query('COMMIT');

    logger.info('Developer assigned successfully', {
      projectId: project.id,
      developerAddress,
    });
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    logger.error('Failed to assign developer', {
      projectId: project.id,
      developerAddress,
      error,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process pending assignment queue
 * Called when a developer becomes available
 */
export async function processPendingQueue(
  db: Pool,
  projectManagerContract: ethers.Contract
): Promise<void> {
  try {
    // Get pending projects (draft status, no assigned developer)
    const pendingProjectsResult = await db.query(
      `SELECT id, required_skills
       FROM projects
       WHERE status = 'draft'
       AND assigned_developer IS NULL
       ORDER BY created_at ASC`
    );

    const pendingProjects = pendingProjectsResult.rows;

    if (pendingProjects.length === 0) {
      logger.info('No pending projects in queue');
      return;
    }

    logger.info('Processing pending assignment queue', {
      pendingCount: pendingProjects.length,
    });

    for (const project of pendingProjects) {
      const assigned = await assignDeveloperToProject(
        db,
        projectManagerContract,
        project.id
      );

      if (assigned) {
        logger.info('Processed pending project', {
          projectId: project.id,
          developerAddress: assigned,
        });
      } else {
        // Still no available developers, stop processing
        logger.info('No more available developers, stopping queue processing');
        break;
      }
    }
  } catch (error) {
    logger.error('Error processing pending queue', { error });
    throw error;
  }
}

/**
 * Get match score for a developer and project (without assignment)
 * Useful for showing developers why they were/weren't assigned
 */
export async function getMatchScoreForDeveloper(
  db: Pool,
  projectId: string,
  developerAddress: string
): Promise<MatchingResult | null> {
  try {
    // Fetch project
    const projectResult = await db.query(
      'SELECT id, required_skills, total_budget FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return null;
    }

    const project: Project = {
      id: projectResult.rows[0].id,
      requiredSkills: projectResult.rows[0].required_skills,
      totalBudget: projectResult.rows[0].total_budget,
      contractProjectId: 0, // Not needed for scoring
    };

    // Fetch developer
    const developerResult = await db.query(
      `SELECT wallet_address, skills, average_rating, last_assignment_at
       FROM developers
       WHERE wallet_address = $1`,
      [developerAddress]
    );

    if (developerResult.rows.length === 0) {
      return null;
    }

    const developer: Developer = {
      walletAddress: developerResult.rows[0].wallet_address,
      skills: developerResult.rows[0].skills,
      averageRating: developerResult.rows[0].average_rating,
      lastAssignmentAt: developerResult.rows[0].last_assignment_at,
    };

    return calculateMatchScore(project, developer);
  } catch (error) {
    logger.error('Error calculating match score', { projectId, developerAddress, error });
    throw error;
  }
}
