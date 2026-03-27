import { Router } from 'express';
import { ethers } from 'ethers';
import { pool } from '../../config/database';
import { verifySignature } from '../../utils/signature';
import type { Developer } from '../../types/developer';
import { createNotification } from '../../services/notificationService';
import { processPendingQueue } from '../../services/matchingAlgorithm';

const router = Router();

let projectManagerContract: ethers.Contract;

export function initialize(contract: ethers.Contract) {
  projectManagerContract = contract;
}

/**
 * Read admin addresses from env at call time (not module load) for testability
 */
function getAdminAddresses(): string[] {
  const raw = process.env.ADMIN_ADDRESSES || '';
  return raw
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
}

/**
 * Verify that the caller is an admin: valid signature + address in admin list
 */
function verifyAdmin(
  address: string,
  message: string,
  signature: string
): { valid: boolean; error?: { status: number; code: string; message: string } } {
  const isValidSignature = verifySignature(message, signature, address);
  if (!isValidSignature) {
    return {
      valid: false,
      error: { status: 401, code: 'INVALID_SIGNATURE', message: 'Wallet signature verification failed' },
    };
  }

  const adminAddresses = getAdminAddresses();
  if (!adminAddresses.includes(address.toLowerCase())) {
    return {
      valid: false,
      error: { status: 403, code: 'FORBIDDEN', message: 'Only admin wallets can perform this action' },
    };
  }

  return { valid: true };
}

/**
 * GET /api/admin/developers
 * List all developers for admin review (paginated, optional status filter)
 */
router.get('/developers', async (req, res) => {
  try {
    const { page = '1', limit = '20', status } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const validStatuses = ['pending', 'staked', 'active', 'rejected', 'suspended'];
    const filterStatus = typeof status === 'string' && validStatuses.includes(status) ? status : null;

    const whereClause = filterStatus ? `WHERE status = $1` : '';
    const countParams = filterStatus ? [filterStatus] : [];

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM developers ${whereClause}`,
      countParams
    );
    const total = parseInt(countResult.rows[0].count);

    const queryParams = filterStatus
      ? [filterStatus, limitNum, offset]
      : [limitNum, offset];
    const result = await pool.query<Developer>(
      `SELECT * FROM developers ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${filterStatus ? 2 : 1} OFFSET $${filterStatus ? 3 : 2}`,
      queryParams
    );

    const developers = result.rows.map((dev) => ({
      walletAddress: dev.wallet_address,
      email: dev.email,
      githubUsername: dev.github_username,
      skills: dev.skills,
      bio: dev.bio,
      hourlyRate: dev.hourly_rate,
      stakeAmount: dev.stake_amount,
      stakedAt: dev.staked_at,
      status: dev.status,
      createdAt: dev.created_at,
    }));

    return res.json({
      data: developers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error listing developers:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * PUT /api/admin/developers/:address/approve
 * Admin approves a staked developer (staked → active)
 */
router.put('/developers/:address/approve', async (req, res) => {
  try {
    const { address: developerAddress } = req.params;
    const { address, message, signature, notes } = req.body;

    // Verify admin
    const auth = verifyAdmin(address, message, signature);
    if (!auth.valid) {
      return res.status(auth.error!.status).json({
        error: auth.error!.code,
        message: auth.error!.message,
      });
    }

    const walletAddress = developerAddress.toLowerCase();
    const adminAddress = address.toLowerCase();

    // Find developer
    const existing = await pool.query<Developer>(
      'SELECT * FROM developers WHERE wallet_address = $1',
      [walletAddress]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Developer not found',
      });
    }

    const developer = existing.rows[0];

    if (developer.status !== 'staked') {
      return res.status(422).json({
        error: 'INVALID_STATE',
        message: "Developer is not in 'staked' status",
      });
    }

    // Approve: staked → active
    const result = await pool.query<Developer>(
      `UPDATE developers
       SET status = 'active',
           admin_notes = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE wallet_address = $3
       RETURNING *`,
      [notes || null, adminAddress, walletAddress]
    );

    const updated = result.rows[0]!;

    await createNotification(
      walletAddress,
      'developer_approved',
      'Application Approved',
      'Your developer application has been approved. You are now an active member of 0xElite.',
      '/dashboard/developer'
    );

    // Try to assign pending draft projects to the newly approved developer
    if (projectManagerContract) {
      processPendingQueue(pool, projectManagerContract).catch((err) =>
        console.error('Error processing pending queue after approval:', err)
      );
    }

    return res.json({
      message: 'Developer approved successfully',
      developer: {
        walletAddress: updated.wallet_address,
        status: updated.status,
        reviewedBy: updated.reviewed_by,
        reviewedAt: updated.reviewed_at,
      },
    });
  } catch (error) {
    console.error('Error approving developer:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * PUT /api/admin/developers/:address/reject
 * Admin rejects a staked developer (staked → rejected)
 */
router.put('/developers/:address/reject', async (req, res) => {
  try {
    const { address: developerAddress } = req.params;
    const { address, message, signature, reason } = req.body;

    // Validate required reason
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Rejection reason is required',
      });
    }

    // Verify admin
    const auth = verifyAdmin(address, message, signature);
    if (!auth.valid) {
      return res.status(auth.error!.status).json({
        error: auth.error!.code,
        message: auth.error!.message,
      });
    }

    const walletAddress = developerAddress.toLowerCase();
    const adminAddress = address.toLowerCase();

    // Find developer
    const existing = await pool.query<Developer>(
      'SELECT * FROM developers WHERE wallet_address = $1',
      [walletAddress]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Developer not found',
      });
    }

    const developer = existing.rows[0];

    if (developer.status !== 'staked') {
      return res.status(422).json({
        error: 'INVALID_STATE',
        message: "Developer is not in 'staked' status",
      });
    }

    // Reject: staked → rejected
    const result = await pool.query<Developer>(
      `UPDATE developers
       SET status = 'rejected',
           admin_notes = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE wallet_address = $3
       RETURNING *`,
      [reason.trim(), adminAddress, walletAddress]
    );

    const updated = result.rows[0]!;

    await createNotification(
      walletAddress,
      'developer_rejected',
      'Application Rejected',
      `Your developer application was not approved. Reason: ${reason.trim()}`,
      '/dashboard/developer'
    );

    return res.json({
      message: 'Developer rejected',
      developer: {
        walletAddress: updated.wallet_address,
        status: updated.status,
        adminNotes: updated.admin_notes,
        reviewedBy: updated.reviewed_by,
        reviewedAt: updated.reviewed_at,
      },
    });
  } catch (error) {
    console.error('Error rejecting developer:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;
