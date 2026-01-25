import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { verifySignature } from '../../utils/signatureVerification';

const router = express.Router();

let db: Pool;
let escrowVaultContract: ethers.Contract;
let escrowVaultAddress: string;

export function initialize(database: Pool, contract: ethers.Contract) {
  db = database;
  escrowVaultContract = contract;
  escrowVaultAddress = contract.target as string;
}

/**
 * POST /api/escrow/deposit
 * Record escrow deposit (called after on-chain deposit)
 */
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { address, message, signature, projectId, amount, txHash } = req.body;

    // Validate required fields
    if (!address || !message || !signature || !projectId || !amount || !txHash) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: address, message, signature, projectId, amount, txHash',
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

    // Get project to verify ownership and budget
    const projectResult = await db.query(
      'SELECT id, client_address, total_budget, escrow_deposited FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const project = projectResult.rows[0];

    // Verify caller is project client
    if (project.client_address.toLowerCase() !== address.toLowerCase()) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only project client can deposit escrow',
      });
    }

    // Check if escrow already deposited
    if (project.escrow_deposited) {
      return res.status(409).json({
        error: 'ESCROW_EXISTS',
        message: 'Escrow already deposited for this project',
      });
    }

    // Validate amount matches total budget
    const totalBudget = parseFloat(project.total_budget);
    if (Math.abs(amount - totalBudget) > 0.01) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Amount must equal project total budget (${totalBudget} USDC)`,
        details: [{ field: 'amount', message: `Expected ${totalBudget}, got ${amount}` }],
      });
    }

    // Note: The actual deposit should already be on-chain
    // This endpoint just records it in our database
    // The event listener will also process this, so we use ON CONFLICT DO NOTHING

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Get contract_project_id
      const contractProjectId = projectResult.rows[0].contract_project_id;

      // Create escrow_deposits record (event listener may have already done this)
      await client.query(
        `INSERT INTO escrow_deposits (
          project_id, contract_project_id, total_deposited, deposit_tx_hash
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (project_id) DO NOTHING`,
        [projectId, contractProjectId, amount, txHash]
      );

      // Update projects table
      await client.query(
        `UPDATE projects SET
          escrow_deposited = true,
          escrow_deposit_tx_hash = $1,
          escrow_deposited_at = NOW(),
          status = 'active'
        WHERE id = $2 AND escrow_deposited = false`,
        [txHash, projectId]
      );

      await client.query('COMMIT');

      // Get updated escrow info
      const escrowResult = await db.query(
        'SELECT * FROM escrow_deposits WHERE project_id = $1',
        [projectId]
      );

      const projectUpdated = await db.query(
        'SELECT id, status, escrow_deposited FROM projects WHERE id = $1',
        [projectId]
      );

      res.status(200).json({
        escrow: {
          id: escrowResult.rows[0].id,
          projectId: escrowResult.rows[0].project_id,
          totalDeposited: parseFloat(escrowResult.rows[0].total_deposited),
          totalReleased: parseFloat(escrowResult.rows[0].total_released),
          escrowBalance: parseFloat(escrowResult.rows[0].escrow_balance),
          isFrozen: escrowResult.rows[0].is_frozen,
          depositTxHash: escrowResult.rows[0].deposit_tx_hash,
          createdAt: escrowResult.rows[0].created_at,
        },
        project: {
          id: projectUpdated.rows[0].id,
          status: projectUpdated.rows[0].status,
          escrowDeposited: projectUpdated.rows[0].escrow_deposited,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error recording escrow deposit:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to record escrow deposit',
    });
  }
});

/**
 * GET /api/escrow/:projectId
 * Get escrow status and balance for a project
 */
router.get('/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    // Get escrow info
    const escrowResult = await db.query(
      `SELECT * FROM escrow_deposits WHERE project_id = $1`,
      [projectId]
    );

    if (escrowResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No escrow found for this project',
      });
    }

    const escrow = escrowResult.rows[0];

    // Get milestone breakdown
    const milestonesResult = await db.query(
      `SELECT
        COUNT(*) as total_milestones,
        COUNT(*) FILTER (WHERE status = 'completed') as milestones_completed,
        COALESCE(SUM(payment_amount), 0) as developer_payments,
        COALESCE(SUM(platform_fee), 0) as platform_fees,
        COALESCE(SUM(budget) FILTER (WHERE status IN ('pending', 'in_progress', 'pending_review')), 0) as pending_milestones
      FROM milestones
      WHERE project_id = $1`,
      [projectId]
    );

    const breakdown = milestonesResult.rows[0];

    res.status(200).json({
      escrow: {
        projectId: escrow.project_id,
        totalDeposited: parseFloat(escrow.total_deposited),
        totalReleased: parseFloat(escrow.total_released),
        escrowBalance: parseFloat(escrow.escrow_balance),
        isFrozen: escrow.is_frozen,
        createdAt: escrow.created_at,
        updatedAt: escrow.updated_at,
      },
      breakdown: {
        milestonesCompleted: parseInt(breakdown.milestones_completed),
        totalMilestones: parseInt(breakdown.total_milestones),
        developerPayments: parseFloat(breakdown.developer_payments),
        platformFees: parseFloat(breakdown.platform_fees),
        pendingMilestones: parseFloat(breakdown.pending_milestones),
      },
    });
  } catch (error: any) {
    console.error('Error getting escrow status:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to get escrow status',
    });
  }
});

/**
 * GET /api/escrow/:projectId/history
 * Get complete payment history for a project
 */
router.get('/:projectId/history', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { type, limit = '100', offset = '0' } = req.query;

    // Validate limit and offset
    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = parseInt(offset as string) || 0;

    // Build query
    let query = `
      SELECT
        id, project_id, milestone_id, transaction_type, amount,
        from_address, to_address, tx_hash, block_number, block_timestamp,
        platform_fee, developer_payment, notes
      FROM payment_history
      WHERE project_id = $1
    `;
    const params: any[] = [projectId];

    // Add type filter if provided
    if (type) {
      query += ` AND transaction_type = $${params.length + 1}`;
      params.push(type);
    }

    // Add ordering and pagination
    query += ` ORDER BY block_timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offsetNum);

    const historyResult = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM payment_history WHERE project_id = $1';
    const countParams: any[] = [projectId];

    if (type) {
      countQuery += ' AND transaction_type = $2';
      countParams.push(type);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    if (historyResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No payment history found for this project',
      });
    }

    // Format history
    const history = historyResult.rows.map((row) => ({
      id: row.id,
      transactionType: row.transaction_type,
      amount: parseFloat(row.amount),
      fromAddress: row.from_address,
      toAddress: row.to_address,
      txHash: row.tx_hash,
      blockNumber: row.block_number,
      blockTimestamp: row.block_timestamp,
      milestoneId: row.milestone_id,
      platformFee: row.platform_fee ? parseFloat(row.platform_fee) : null,
      developerPayment: row.developer_payment ? parseFloat(row.developer_payment) : null,
      notes: row.notes,
    }));

    res.status(200).json({
      projectId,
      total,
      limit: limitNum,
      offset: offsetNum,
      history,
    });
  } catch (error: any) {
    console.error('Error getting payment history:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to get payment history',
    });
  }
});

/**
 * POST /api/escrow/freeze
 * Freeze escrow to prevent releases (admin/dispute only)
 */
router.post('/freeze', async (req: Request, res: Response) => {
  try {
    const { address, message, signature, projectId, reason } = req.body;

    // Validate required fields
    if (!address || !message || !signature || !projectId || !reason) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: address, message, signature, projectId, reason',
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

    // TODO: Check if address is admin or dispute contract
    // For now, we'll let the smart contract enforce this
    // In production, add role-based access control here

    // Get project contract_project_id
    const projectResult = await db.query(
      'SELECT contract_project_id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const contractProjectId = projectResult.rows[0].contract_project_id;

    // Call smart contract freeze function
    // Note: This requires the caller to be DisputeDAO
    try {
      const tx = await escrowVaultContract.freeze(contractProjectId);
      await tx.wait();
    } catch (error: any) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Only admins or dispute contract can freeze escrow',
      });
    }

    // Get updated escrow info (event listener will update it)
    // Give it a moment to process
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const escrowResult = await db.query(
      'SELECT * FROM escrow_deposits WHERE project_id = $1',
      [projectId]
    );

    res.status(200).json({
      escrow: {
        projectId: escrowResult.rows[0].project_id,
        isFrozen: escrowResult.rows[0].is_frozen,
        frozenAt: escrowResult.rows[0].frozen_at,
        frozenBy: escrowResult.rows[0].frozen_by,
      },
      message: 'Escrow frozen successfully',
    });
  } catch (error: any) {
    console.error('Error freezing escrow:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to freeze escrow',
    });
  }
});

/**
 * POST /api/escrow/unfreeze
 * Unfreeze escrow after dispute resolution (admin/dispute only)
 */
router.post('/unfreeze', async (req: Request, res: Response) => {
  try {
    const { address, message, signature, projectId, resolutionNotes } = req.body;

    // Validate required fields
    if (!address || !message || !signature || !projectId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: address, message, signature, projectId',
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

    // Get project contract_project_id
    const projectResult = await db.query(
      'SELECT contract_project_id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const contractProjectId = projectResult.rows[0].contract_project_id;

    // Call smart contract unfreeze function
    try {
      const tx = await escrowVaultContract.unfreeze(contractProjectId);
      await tx.wait();
    } catch (error: any) {
      if (error.message.includes('EscrowNotFrozen')) {
        return res.status(409).json({
          error: 'NOT_FROZEN',
          message: 'Escrow is not currently frozen',
        });
      }
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Only admins or dispute contract can unfreeze escrow',
      });
    }

    // Get updated escrow info
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const escrowResult = await db.query(
      'SELECT * FROM escrow_deposits WHERE project_id = $1',
      [projectId]
    );

    res.status(200).json({
      escrow: {
        projectId: escrowResult.rows[0].project_id,
        isFrozen: escrowResult.rows[0].is_frozen,
        frozenAt: escrowResult.rows[0].frozen_at,
        frozenBy: escrowResult.rows[0].frozen_by,
      },
      message: 'Escrow unfrozen successfully',
    });
  } catch (error: any) {
    console.error('Error unfreezing escrow:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to unfreeze escrow',
    });
  }
});

export default router;
