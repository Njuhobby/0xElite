import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { verifySignature } from '../../utils/signature';
import { logger } from '../../utils/logger';
import { createNotification } from '../../services/notificationService';

const router = express.Router();

// Database and contract instances
let db: Pool;
let projectManagerContract: ethers.Contract;

export function initialize(database: Pool, contract: ethers.Contract) {
  db = database;
  projectManagerContract = contract;
}

// =====================================================
// POST /api/projects/:projectId/milestones - Add Milestone
// =====================================================

router.post('/:projectId/milestones', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { address, message, signature, title, description, deliverables, budget } = req.body;

    // Validation
    if (!address || !message || !signature) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Address, message, and signature required',
      });
    }

    if (!title || !description || !Array.isArray(deliverables) || deliverables.length === 0 || !budget) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Title, description, deliverables, and budget required',
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(message, signature, address);
    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    // Fetch project
    const projectResult = await db.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const project = projectResult.rows[0];

    // Check ownership
    if (project.client_address !== address.toLowerCase()) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only project owner can add milestones',
      });
    }

    // Check status
    if (project.status !== 'draft') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Cannot add milestones to non-draft projects',
      });
    }

    // Check budget
    const milestonesResult = await db.query(
      'SELECT COALESCE(SUM(budget), 0) as total FROM milestones WHERE project_id = $1',
      [projectId]
    );

    const currentTotal = parseFloat(milestonesResult.rows[0].total);
    const newTotal = currentTotal + budget;

    if (newTotal > parseFloat(project.total_budget)) {
      return res.status(400).json({
        error: 'BUDGET_EXCEEDED',
        message: `Adding this milestone would exceed project budget. Project budget: ${project.total_budget}, Current milestone total: ${currentTotal}, New milestone: ${budget}`,
      });
    }

    // Get next milestone number
    const maxMilestoneResult = await db.query(
      'SELECT COALESCE(MAX(milestone_number), 0) as max FROM milestones WHERE project_id = $1',
      [projectId]
    );
    const nextMilestoneNumber = maxMilestoneResult.rows[0].max + 1;

    // Create milestone
    const milestoneResult = await db.query(
      `INSERT INTO milestones (
        project_id, milestone_number, title, description, deliverables, budget,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())
      RETURNING *`,
      [projectId, nextMilestoneNumber, title, description, JSON.stringify(deliverables), budget]
    );

    const milestone = milestoneResult.rows[0];

    res.status(201).json({
      id: milestone.id,
      projectId: milestone.project_id,
      milestoneNumber: milestone.milestone_number,
      title: milestone.title,
      budget: milestone.budget,
      status: milestone.status,
      createdAt: milestone.created_at,
    });
  } catch (error: any) {
    logger.error('Error adding milestone', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to add milestone',
    });
  }
});

// =====================================================
// PUT /api/milestones/:id - Update Milestone Status
// =====================================================

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { address, message, signature, status, reviewNotes } = req.body;

    // Validation
    if (!address || !message || !signature || !status) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Address, message, signature, and status required',
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(message, signature, address);
    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const milestoneResult = await db.query(
      `SELECT m.*, p.client_address, p.assigned_developer, p.status as project_status,
              p.title as project_title, p.total_budget,
              p.contract_project_id, m.on_chain_index
       FROM milestones m
       JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1`,
      [id]
    );

    if (milestoneResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Milestone not found',
      });
    }

    const milestone = milestoneResult.rows[0];
    const isClient = milestone.client_address === address.toLowerCase();
    const isDeveloper = milestone.assigned_developer === address.toLowerCase();

    // Check authorization
    if (!isClient && !isDeveloper) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only project client or assigned developer can update milestone',
      });
    }

    // Validate status transitions. Developer goes pending → pending_review
    // (notify complete); milestone completion goes through the on-chain
    // approveMilestone path, not this endpoint, so 'completed' is not a legal
    // target here.
    const currentStatus = milestone.status;
    const validTransitions: Record<string, string[]> = {
      pending: ['pending_review'],
      in_progress: ['pending_review', 'disputed'],
      pending_review: ['pending', 'disputed'],
      completed: [],
      disputed: ['pending'],
    };

    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.status(403).json({
        error: 'INVALID_TRANSITION',
        message: `Cannot transition from '${currentStatus}' to '${status}'`,
      });
    }

    if (isDeveloper && status !== 'pending_review') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Developer can only mark milestones as pending_review',
      });
    }

    if (isClient && currentStatus !== 'pending_review' && status !== 'disputed') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Client can only send back / dispute milestones in pending_review status',
      });
    }

    // Update milestone
    const updates: string[] = [`status = $1`];
    const values: any[] = [status];
    let paramCount = 2;

    if (status === 'pending_review') {
      updates.push(`submitted_at = NOW()`);
      if (!milestone.started_at) {
        updates.push(`started_at = NOW()`);
      }
    }

    if (reviewNotes) {
      updates.push(`review_notes = $${paramCount++}`);
      values.push(reviewNotes);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await db.query(
      `UPDATE milestones SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    if (status === 'pending_review') {
      await createNotification(
        milestone.client_address,
        'milestone_submitted',
        'Milestone Submitted for Review',
        `A milestone in your project "${milestone.project_title}" has been submitted and is ready for your review.`,
        `/dashboard/client/projects/${milestone.project_id}`
      );
    }

    // Relay the status change on-chain — approveMilestone in the contract
    // requires the milestone to be in PendingReview state, so dev's
    // "pending → pending_review" transition has to land on-chain too.
    if (milestone.on_chain_index !== null) {
      const milestoneStatusMap: Record<string, number> = {
        pending: 0,
        in_progress: 1,
        pending_review: 2,
        disputed: 4,
      };
      const onChainStatus = milestoneStatusMap[status];
      if (onChainStatus !== undefined) {
        try {
          const tx = await projectManagerContract.updateMilestoneStatus(
            milestone.contract_project_id,
            milestone.on_chain_index,
            onChainStatus
          );
          await tx.wait();
          logger.info('Milestone status updated on-chain', {
            milestoneId: id,
            contractProjectId: milestone.contract_project_id,
            onChainIndex: milestone.on_chain_index,
            newStatus: status,
          });
        } catch (error) {
          logger.error('Failed to update milestone status on-chain', { error, milestoneId: id });
          // Don't fail the request — DB is already updated, on-chain update can be retried
        }
      }
    }

    res.json({
      id,
      projectId: milestone.project_id,
      status,
      updatedAt: new Date(),
    });
  } catch (error: any) {
    logger.error('Error updating milestone', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to update milestone',
    });
  }
});

export default router;
