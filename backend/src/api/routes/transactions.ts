import express, { Request, Response } from 'express';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';

const router = express.Router();

/**
 * POST /api/transactions/pending
 * Frontend submits a pending transaction after getting txHash
 */
router.post('/pending', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, action, txHash, walletAddress, metadata } = req.body;

    if (!entityType || !entityId || !action || !txHash || !walletAddress) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: entityType, entityId, action, txHash, walletAddress',
      });
    }

    await pool.query(
      `INSERT INTO pending_transactions (entity_type, entity_id, action, tx_hash, wallet_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tx_hash) DO NOTHING`,
      [entityType, entityId, action, txHash, walletAddress.toLowerCase(), metadata ? JSON.stringify(metadata) : null]
    );

    res.status(201).json({ success: true });
  } catch (error: any) {
    logger.error('Error creating pending transaction', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to create pending transaction',
    });
  }
});

/**
 * GET /api/transactions/pending?wallet=0x...
 * Frontend queries pending transactions for a wallet
 */
router.get('/pending', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'wallet query parameter required',
      });
    }

    const result = await pool.query(
      `SELECT id, entity_type, entity_id, action, tx_hash, wallet_address, metadata, created_at
       FROM pending_transactions
       WHERE wallet_address = $1
       ORDER BY created_at DESC`,
      [wallet.toLowerCase()]
    );

    res.json({ transactions: result.rows });
  } catch (error: any) {
    logger.error('Error fetching pending transactions', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch pending transactions',
    });
  }
});

/**
 * DELETE /api/transactions/pending/:txHash
 * Frontend cleans up after confirmation or failure
 */
router.delete('/pending/:txHash', async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params;

    await pool.query(
      'DELETE FROM pending_transactions WHERE tx_hash = $1',
      [txHash]
    );

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting pending transaction', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to delete pending transaction',
    });
  }
});

export default router;
