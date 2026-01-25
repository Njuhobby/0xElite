import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { verifySignature } from '../../utils/signature';
import { logger } from '../../utils/logger';

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
    const { address, message, signature, status, deliverableUrls, reviewNotes } = req.body;

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

    // Fetch milestone
    const milestoneResult = await db.query(
      `SELECT m.*, p.client_address, p.assigned_developer, p.status as project_status
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

    // Validate status transitions
    const currentStatus = milestone.status;
    const validTransitions: Record<string, string[]> = {
      pending: ['in_progress'],
      in_progress: ['pending_review', 'disputed'],
      pending_review: ['completed', 'in_progress', 'disputed'],
      completed: [],
      disputed: ['in_progress'],
    };

    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.status(403).json({
        error: 'INVALID_TRANSITION',
        message: `Cannot transition from '${currentStatus}' to '${status}'`,
      });
    }

    // Developer can: pending → in_progress, in_progress → pending_review
    // Client can: pending_review → completed, pending_review → in_progress
    if (isDeveloper && !['in_progress', 'pending_review'].includes(status)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Developer can only mark milestones as in_progress or pending_review',
      });
    }

    if (isClient && currentStatus !== 'pending_review' && status !== 'disputed') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Client can only approve/reject milestones in pending_review status',
      });
    }

    // Validate deliverable URLs for pending_review
    if (status === 'pending_review' && (!deliverableUrls || deliverableUrls.length === 0)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Deliverable URLs required when submitting for review',
      });
    }

    // Update milestone
    const updates: string[] = [`status = $1`];
    const values: any[] = [status];
    let paramCount = 2;

    if (status === 'in_progress' && currentStatus === 'pending') {
      updates.push(`started_at = NOW()`);
    }

    if (status === 'pending_review') {
      updates.push(`submitted_at = NOW()`);
      updates.push(`deliverable_urls = $${paramCount++}`);
      values.push(JSON.stringify(deliverableUrls));
    }

    if (status === 'completed') {
      updates.push(`completed_at = NOW()`);
      if (reviewNotes) {
        updates.push(`review_notes = $${paramCount++}`);
        values.push(reviewNotes);
      }
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await db.query(
      `UPDATE milestones SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );

    // If milestone completed, check if all project milestones are done
    if (status === 'completed') {
      const projectMilestonesResult = await db.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'completed') as completed
         FROM milestones
         WHERE project_id = $1`,
        [milestone.project_id]
      );

      const { total, completed } = projectMilestonesResult.rows[0];

      if (parseInt(total) === parseInt(completed)) {
        // All milestones completed - update project status
        await db.query(
          `UPDATE projects
           SET status = 'completed',
               completed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [milestone.project_id]
        );

        // Update on-chain state
        const projectResult = await db.query(
          'SELECT contract_project_id FROM projects WHERE id = $1',
          [milestone.project_id]
        );

        const contractProjectId = projectResult.rows[0].contract_project_id;

        try {
          const tx = await projectManagerContract.updateProjectState(contractProjectId, 2); // Completed
          await tx.wait();

          logger.info('Project marked as completed on-chain', {
            projectId: milestone.project_id,
            contractProjectId,
          });
        } catch (error) {
          logger.error('Failed to update project state on-chain', { error });
        }

        // Update developer stats
        if (milestone.assigned_developer) {
          await db.query(
            `UPDATE developers
             SET projects_completed = projects_completed + 1,
                 availability = 'available',
                 current_project_id = NULL,
                 updated_at = NOW()
             WHERE wallet_address = $1`,
            [milestone.assigned_developer]
          );
        }

        // Update client stats
        await db.query(
          `UPDATE clients
           SET projects_completed = projects_completed + 1,
               total_spent = total_spent + $1,
               updated_at = NOW()
           WHERE wallet_address = $2`,
          [milestone.total_budget || 0, milestone.client_address]
        );
      }
    }

    res.json({
      id,
      projectId: milestone.project_id,
      status,
      completedAt: status === 'completed' ? new Date() : null,
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
