import express, { Request, Response } from 'express';
import { ethers } from 'ethers';
import { pool } from '../../config/database';
import { logger } from '../../utils/logger';
import { processCompletedAction, Contracts } from '../../services/pendingTxActions';

const router = express.Router();

let provider: ethers.JsonRpcProvider;
let contracts: Contracts;

export function initialize(
  rpcProvider: ethers.JsonRpcProvider,
  contractBag: Contracts
) {
  provider = rpcProvider;
  contracts = contractBag;
}

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
 *
 * Frontend calls this after confirming the tx on-chain (via useWaitForTransactionReceipt).
 * The endpoint processes the action side-effects and deletes the pending record
 * in a single atomic DB transaction.
 */
router.delete('/pending/:txHash', async (req: Request, res: Response) => {
  const { txHash } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock + fetch the pending record
    const result = await client.query(
      'SELECT * FROM pending_transactions WHERE tx_hash = $1 FOR UPDATE',
      [txHash]
    );

    if (result.rows.length === 0) {
      await client.query('COMMIT');
      logger.warn('DELETE /pending/:txHash — record not found (already processed or never created)', { txHash });
      return res.json({ success: true }); // idempotent
    }

    const row = result.rows[0];

    // 2. Process the action (update entity status, etc.)
    const actionResult = await processCompletedAction(client, row, provider, contracts);

    // 3. Delete the pending record
    await client.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [txHash]);

    await client.query('COMMIT');

    logger.info('DELETE /pending/:txHash committed', { txHash, action: row.action, data: actionResult.data });

    // 4. Best-effort post-commit work (e.g. auto-assignment)
    if (actionResult.postCommit) {
      actionResult.postCommit().catch((err) => {
        logger.error('Post-commit action failed', { txHash, error: err });
      });
    }

    res.json({ success: true, action: actionResult.action, data: actionResult.data });
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error in DELETE /pending/:txHash', { txHash, error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to process pending transaction',
    });
  } finally {
    client.release();
  }
});

export default router;
