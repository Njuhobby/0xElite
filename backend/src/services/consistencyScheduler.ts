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
 *   3. sweepOverdueDisputes
 *      Find disputes whose voting_deadline has passed but status is still
 *      'voting'. The EVM has no cron — without an external trigger after the
 *      deadline, disputes (and the escrowed funds) would stay stuck. Two
 *      branches:
 *        - quorum met → backend acts as keeper, calls executeResolution.
 *        - quorum NOT met → executeResolution would revert (QuorumNotMet),
 *          only owner can call ownerResolve(clientWon). Notify admins once
 *          per dispute so they know to act via OwnerResolvePanel.
 *
 * All three tasks are: backend computes an expectation, queries / writes the
 * chain, fixes drift. The chain is never asked to know about anything off-chain.
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
import { createNotificationBatch } from './notificationService';
import { getAdminAddresses } from '../utils/auth';
import VotingPowerSync from './votingPowerSync';

const PENDING_TX_INTERVAL = Number(process.env.PENDING_TX_POLL_INTERVAL ?? 5000);
const VOTING_POWER_INTERVAL = Number(process.env.VOTING_POWER_SWEEP_INTERVAL ?? 300_000);
const OVERDUE_DISPUTE_INTERVAL = Number(process.env.OVERDUE_DISPUTE_SWEEP_INTERVAL ?? 300_000);
const CONFIRMATIONS = Number(process.env.CONFIRMATIONS ?? 1);
const PENDING_TX_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// On-chain DisputeStatus enum: 0=Open, 1=Voting, 2=Resolved
const DISPUTE_STATUS_VOTING = 1;

let provider: ethers.JsonRpcProvider;
let contracts: Contracts;
let votingPowerSync: VotingPowerSync;
let pendingTxRunning = false;
let votingPowerRunning = false;
let overdueDisputeRunning = false;

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
// Task 3 — finalize overdue disputes (keeper for executeResolution)
// =============================================================================

async function sweepOverdueDisputes(): Promise<void> {
  if (overdueDisputeRunning) return;
  overdueDisputeRunning = true;
  try {
    // All overdue voting-state disputes — branch on quorum below.
    const result = await pool.query(
      `SELECT id, chain_dispute_id, dispute_number, total_vote_weight,
              quorum_required, owner_resolution_notified_at
         FROM disputes
        WHERE status = 'voting'
          AND voting_deadline < NOW()
          AND chain_dispute_id IS NOT NULL
          AND quorum_required IS NOT NULL`
    );

    if (result.rows.length === 0) return;

    for (const row of result.rows) {
      const quorumMet =
        Number(row.total_vote_weight) >= Number(row.quorum_required);
      try {
        if (quorumMet) {
          await finalizeOneDispute(row.chain_dispute_id, row.id);
        } else if (!row.owner_resolution_notified_at) {
          await notifyAdminsForOwnerResolve(row.id, row.dispute_number);
        }
      } catch (err) {
        logger.error('sweepOverdueDisputes: handling failed', {
          disputeId: row.id,
          chainDisputeId: row.chain_dispute_id,
          quorumMet,
          error: err,
        });
      }
    }
  } catch (err) {
    logger.error('sweepOverdueDisputes: tick failed', { error: err });
  } finally {
    overdueDisputeRunning = false;
  }
}

async function finalizeOneDispute(chainDisputeId: number, disputeId: string): Promise<void> {
  // Re-check on-chain status before sending — protects against (a) racing
  // with a manual frontend trigger and (b) a previous sweep tick whose tx
  // landed but whose DB row hasn't been updated by chainReconciler yet.
  const core = await contracts.disputeDAO.getDisputeCore(chainDisputeId);
  const onChainStatus = Number(core[4]);
  if (onChainStatus !== DISPUTE_STATUS_VOTING) {
    logger.info('sweepOverdueDisputes: already resolved on-chain, skipping', {
      disputeId,
      chainDisputeId,
      onChainStatus,
    });
    return;
  }

  logger.info('sweepOverdueDisputes: calling executeResolution', {
    disputeId,
    chainDisputeId,
  });

  const tx = await contracts.disputeDAO.executeResolution(chainDisputeId);
  await tx.wait(CONFIRMATIONS);

  // DB update happens via chainReconciler picking up the DisputeResolved event.
  // We deliberately don't write to disputes here to keep one source of DB truth.
  logger.info('sweepOverdueDisputes: executeResolution mined', {
    disputeId,
    chainDisputeId,
    txHash: tx.hash,
  });
}

async function notifyAdminsForOwnerResolve(
  disputeId: string,
  disputeNumber: number
): Promise<void> {
  const admins = getAdminAddresses();
  if (admins.length === 0) {
    logger.warn('sweepOverdueDisputes: no admins configured, cannot notify', {
      disputeId,
    });
    return;
  }

  // Stamp first; if the notification batch fails halfway, the next sweep
  // will skip this dispute (acceptable — better than spamming).
  const stamp = await pool.query(
    `UPDATE disputes
        SET owner_resolution_notified_at = NOW()
      WHERE id = $1
        AND owner_resolution_notified_at IS NULL
      RETURNING id`,
    [disputeId]
  );
  if (stamp.rowCount === 0) return; // raced with another tick

  await createNotificationBatch(
    admins,
    'dispute_owner_resolve_required',
    `Dispute #${disputeNumber} needs manual resolution`,
    `Voting period ended without quorum. Use the owner resolve panel to rule on the dispute.`,
    `/disputes/${disputeId}`
  );

  logger.info('sweepOverdueDisputes: notified admins for owner resolve', {
    disputeId,
    disputeNumber,
    adminCount: admins.length,
  });
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
    overdueDisputeIntervalMs: OVERDUE_DISPUTE_INTERVAL,
    confirmations: CONFIRMATIONS,
  });

  // Eager initial pass for all tasks, then schedule recurring ticks.
  void drainPendingTransactions();
  void sweepVotingPowerDrift();
  void sweepOverdueDisputes();

  setInterval(drainPendingTransactions, PENDING_TX_INTERVAL);
  setInterval(sweepVotingPowerDrift, VOTING_POWER_INTERVAL);
  setInterval(sweepOverdueDisputes, OVERDUE_DISPUTE_INTERVAL);
}
