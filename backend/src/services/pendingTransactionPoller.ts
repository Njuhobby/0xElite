import { ethers } from 'ethers';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { assignDeveloperToProject } from './matchingAlgorithm';

const CONFIRMATIONS = Number(process.env.CONFIRMATIONS ?? 1);
const POLL_INTERVAL = Number(process.env.PENDING_TX_POLL_INTERVAL ?? 5000);
const TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

let provider: ethers.JsonRpcProvider;
let projectManagerContract: ethers.Contract;

export function startPendingTransactionPoller(
  rpcProvider: ethers.JsonRpcProvider,
  pmContract: ethers.Contract
) {
  provider = rpcProvider;
  projectManagerContract = pmContract;

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
      await deletePending(row.tx_hash);
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
    await deletePending(row.tx_hash);
    return;
  }

  // Success — process based on action
  logger.info('Pending tx confirmed, processing', { txHash: row.tx_hash, action: row.action, confirmations });

  switch (row.action) {
    case 'create_project':
      await handleCreateProject(row, receipt);
      break;
    case 'deposit_escrow':
      await handleDepositEscrow(row);
      break;
    case 'approve_usdc':
      // No entity update needed for approve
      break;
    case 'stake':
      await handleStake(row);
      break;
    case 'approve_milestone':
      await handleApproveMilestone(row);
      break;
    default:
      logger.warn('Unknown pending tx action', { action: row.action });
  }

  await deletePending(row.tx_hash);
}

async function handleCreateProject(row: any, receipt: ethers.TransactionReceipt) {
  // Parse ProjectCreated event from receipt to get contractProjectId
  const event = receipt.logs.find((log) => {
    try {
      const parsed = projectManagerContract.interface.parseLog(log);
      return parsed?.name === 'ProjectCreated';
    } catch {
      return false;
    }
  });

  if (!event) {
    logger.error('ProjectCreated event not found in tx', { txHash: row.tx_hash });
    return;
  }

  const parsed = projectManagerContract.interface.parseLog(event)!;
  const contractProjectId = parsed.args.projectId.toString();

  await pool.query(
    `UPDATE projects
     SET contract_project_id = $1, status = 'created_on_chain', updated_at = NOW()
     WHERE id = $2 AND status = 'draft'`,
    [contractProjectId, row.entity_id]
  );

  logger.info('Project updated with contract ID via poller', {
    projectId: row.entity_id,
    contractProjectId,
  });
}

async function handleDepositEscrow(row: any) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get project info
    const projectResult = await client.query(
      'SELECT contract_project_id, total_budget FROM projects WHERE id = $1',
      [row.entity_id]
    );

    if (projectResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    const project = projectResult.rows[0];
    const amount = row.metadata?.amount || parseFloat(project.total_budget);

    // Create escrow deposit record
    await client.query(
      `INSERT INTO escrow_deposits (project_id, contract_project_id, total_deposited, deposit_tx_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id) DO NOTHING`,
      [row.entity_id, project.contract_project_id, amount, row.tx_hash]
    );

    // Update project status
    await client.query(
      `UPDATE projects SET
        escrow_deposited = true,
        escrow_deposit_tx_hash = $1,
        escrow_deposited_at = NOW(),
        status = 'deposited'
       WHERE id = $2 AND escrow_deposited = false`,
      [row.tx_hash, row.entity_id]
    );

    await client.query('COMMIT');

    // Trigger auto-assignment
    try {
      const assignedDeveloper = await assignDeveloperToProject(pool, projectManagerContract, row.entity_id);
      if (assignedDeveloper) {
        logger.info('Developer auto-assigned via poller', { projectId: row.entity_id, assignedDeveloper });
      }
    } catch (err) {
      logger.error('Auto-assignment failed in poller', { projectId: row.entity_id, error: err });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function handleStake(row: any) {
  await pool.query(
    `UPDATE developers SET status = 'staked', updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'created')`,
    [row.entity_id]
  );
  logger.info('Developer staked status updated via poller', { developerId: row.entity_id });
}

async function handleApproveMilestone(row: any) {
  const milestoneIndex = row.metadata?.milestoneIndex;
  if (milestoneIndex == null) {
    logger.error('Missing milestoneIndex in metadata', { txHash: row.tx_hash });
    return;
  }

  await pool.query(
    `UPDATE milestones SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE project_id = $1 AND on_chain_index = $2 AND status != 'completed'`,
    [row.entity_id, milestoneIndex]
  );
  logger.info('Milestone approved via poller', { projectId: row.entity_id, milestoneIndex });
}

async function deletePending(txHash: string) {
  await pool.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [txHash]);
}
