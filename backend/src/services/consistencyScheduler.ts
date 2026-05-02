/**
 * Consistency scheduler — backend-owned reconciliation loop.
 *
 * The chain is treated as a passive source of truth. The backend periodically
 * asks the chain "is what I expect actually true?" and repairs DB drift if
 * not. Two tasks share this loop because they're conceptually the same shape:
 *
 *   1. drainPendingTransactions
 *      Walk `pending_transactions`. For each row, ask the chain whether the
 *      tx confirmed; if yes, run the side-effect handler and delete the row.
 *      Keyed off DB-tracked txHashes the frontend recorded before/after
 *      submitting the on-chain tx.
 *
 *   2. sweepVotingPowerDrift
 *      Find developers whose voting_power != elite_token_balance and
 *      mint/burn xELITE to repair. Keyed off derived-state mismatches in the
 *      developers table.
 *
 * Both tasks are: backend computes an expectation, queries the chain, fixes
 * drift. The chain is never asked to know about anything off-chain.
 *
 * Note: this is the catch-all for **expected** drift. Events from txs the
 * backend didn't expect (e.g. someone calls the contract directly bypassing
 * the frontend) fall through to chainReconciler instead, which scans block
 * ranges chronologically.
 */

import { ethers } from 'ethers';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { processCompletedAction, Contracts } from './pendingTxActions';
import VotingPowerSync from './votingPowerSync';

const PENDING_TX_INTERVAL = Number(process.env.PENDING_TX_POLL_INTERVAL ?? 5000);
const VOTING_POWER_INTERVAL = Number(process.env.VOTING_POWER_SWEEP_INTERVAL ?? 300_000);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS ?? 1);
const PENDING_TX_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

let provider: ethers.JsonRpcProvider;
let contracts: Contracts;
let votingPowerSync: VotingPowerSync;
let pendingTxRunning = false;
let votingPowerRunning = false;

// =============================================================================
// Task 1 — drain pending_transactions
// =============================================================================

async function drainPendingTransactions(): Promise<void> {
  if (pendingTxRunning) return;
  pendingTxRunning = true;
  try {
    const result = await pool.query('SELECT * FROM pending_transactions');
    if (result.rows.length === 0) return;

    const currentBlock = await provider.getBlockNumber();

    for (const row of result.rows) {
      try {
        await processOnePendingTx(row, currentBlock);
      } catch (err) {
        logger.error('Error processing pending tx', { txHash: row.tx_hash, error: err });
      }
    }
  } catch (err) {
    logger.error('drainPendingTransactions: tick failed', { error: err });
  } finally {
    pendingTxRunning = false;
  }
}

async function processOnePendingTx(row: any, currentBlock: number): Promise<void> {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);

  if (!receipt) {
    // Not yet mined. Drop the row only after the timeout so we don't keep
    // chasing a tx the user may have abandoned.
    const elapsed = Date.now() - new Date(row.created_at).getTime();
    if (elapsed > PENDING_TX_TIMEOUT_MS) {
      logger.warn('Pending tx timed out, removing', { txHash: row.tx_hash });
      await pool.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [row.tx_hash]);
    }
    return;
  }

  const confirmations = currentBlock - receipt.blockNumber;
  if (confirmations < CONFIRMATIONS) return;

  if (receipt.status === 0) {
    logger.warn('Pending tx reverted, removing', { txHash: row.tx_hash, action: row.action });
    await pool.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [row.tx_hash]);
    return;
  }

  logger.info('Pending tx confirmed, processing', {
    txHash: row.tx_hash,
    action: row.action,
    confirmations,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actionResult = await processCompletedAction(client, row, provider, contracts);
    await client.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [row.tx_hash]);
    await client.query('COMMIT');

    logger.info('ConsistencyScheduler: committed action', {
      txHash: row.tx_hash,
      action: row.action,
      data: actionResult.data,
    });

    if (actionResult.postCommit) {
      actionResult.postCommit().catch((err) => {
        logger.error('ConsistencyScheduler: post-commit action failed', {
          txHash: row.tx_hash,
          error: err,
        });
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Task 2 — sweep voting-power drift
// =============================================================================

async function sweepVotingPowerDrift(): Promise<void> {
  if (votingPowerRunning) return;
  votingPowerRunning = true;
  try {
    await votingPowerSync.syncAll();
  } catch (err) {
    logger.error('sweepVotingPowerDrift: tick failed', { error: err });
  } finally {
    votingPowerRunning = false;
  }
}

// =============================================================================
// Entry point
// =============================================================================

export function startConsistencyScheduler(
  rpcProvider: ethers.JsonRpcProvider,
  contractBag: Contracts,
  vps: VotingPowerSync
): void {
  provider = rpcProvider;
  contracts = contractBag;
  votingPowerSync = vps;

  logger.info('Starting consistency scheduler', {
    pendingTxIntervalMs: PENDING_TX_INTERVAL,
    votingPowerIntervalMs: VOTING_POWER_INTERVAL,
    confirmations: CONFIRMATIONS,
  });

  // Eager initial pass for both tasks, then schedule recurring ticks.
  void drainPendingTransactions();
  void sweepVotingPowerDrift();

  setInterval(drainPendingTransactions, PENDING_TX_INTERVAL);
  setInterval(sweepVotingPowerDrift, VOTING_POWER_INTERVAL);
}
