import { ethers } from 'ethers';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { processCompletedAction, Contracts } from './pendingTxActions';

const CONFIRMATIONS = Number(process.env.CONFIRMATIONS ?? 1);
const POLL_INTERVAL = Number(process.env.PENDING_TX_POLL_INTERVAL ?? 5000);
const TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

let provider: ethers.JsonRpcProvider;
let contracts: Contracts;

export function startPendingTransactionPoller(
  rpcProvider: ethers.JsonRpcProvider,
  contractBag: Contracts
) {
  provider = rpcProvider;
  contracts = contractBag;

  logger.info('Starting pending transaction poller', { interval: POLL_INTERVAL, confirmations: CONFIRMATIONS });
  setInterval(pollPendingTransactions, POLL_INTERVAL);
}

async function pollPendingTransactions() {
  try {
    const result = await pool.query('SELECT * FROM pending_transactions');
    if (result.rows.length === 0) return;

    const currentBlock = await provider.getBlockNumber();

    for (const row of result.rows) {
      try {
        await processPendingTransaction(row, currentBlock);
      } catch (err) {
        logger.error('Error processing pending tx', { txHash: row.tx_hash, error: err });
      }
    }
  } catch (err) {
    logger.error('Error in pending transaction poll cycle', { error: err });
  }
}

async function processPendingTransaction(row: any, currentBlock: number) {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);

  if (!receipt) {
    // Check timeout
    const elapsed = Date.now() - new Date(row.created_at).getTime();
    if (elapsed > TIMEOUT_MS) {
      logger.warn('Pending tx timed out, removing', { txHash: row.tx_hash });
      await pool.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [row.tx_hash]);
    }
    return;
  }

  // Check confirmations
  const confirmations = currentBlock - receipt.blockNumber;
  if (confirmations < CONFIRMATIONS) {
    return; // Not enough confirmations yet
  }

  if (receipt.status === 0) {
    // Reverted
    logger.warn('Pending tx reverted, removing', { txHash: row.tx_hash, action: row.action });
    await pool.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [row.tx_hash]);
    return;
  }

  // Success — process + delete atomically
  logger.info('Pending tx confirmed, processing', { txHash: row.tx_hash, action: row.action, confirmations });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const actionResult = await processCompletedAction(client, row, provider, contracts);
    await client.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [row.tx_hash]);

    await client.query('COMMIT');

    logger.info('Poller: committed action', { txHash: row.tx_hash, action: row.action, data: actionResult.data });

    // Best-effort post-commit work
    if (actionResult.postCommit) {
      actionResult.postCommit().catch((err) => {
        logger.error('Poller: post-commit action failed', { txHash: row.tx_hash, error: err });
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
