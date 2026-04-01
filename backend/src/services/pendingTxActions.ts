import { ethers } from 'ethers';
import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { assignDeveloperToProject } from './matchingAlgorithm';

export interface PendingTxRow {
  action: string;
  entity_id: string;
  entity_type: string;
  tx_hash: string;
  metadata: any;
}

export interface ActionResult {
  action: string;
  data?: Record<string, unknown>;
  /** Runs after the DB transaction commits (best-effort, e.g. auto-assignment). */
  postCommit?: () => Promise<void>;
}

/**
 * Process the side-effects of a confirmed pending transaction.
 * All DB writes go through the supplied `client` so the caller can
 * wrap everything (status update + pending record deletion) in a
 * single atomic transaction.
 */
export async function processCompletedAction(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  projectManagerContract: ethers.Contract
): Promise<ActionResult> {
  logger.info('processCompletedAction: start', { action: row.action, entityId: row.entity_id, txHash: row.tx_hash });

  let result: ActionResult;

  switch (row.action) {
    case 'create_project':
      result = await handleCreateProject(client, row, provider, projectManagerContract);
      break;
    case 'deposit_escrow':
      result = await handleDepositEscrow(client, row, projectManagerContract);
      break;
    case 'approve_usdc':
      result = { action: 'approve_usdc' };
      break;
    case 'stake':
      result = await handleStake(client, row);
      break;
    case 'approve_milestone':
      result = await handleApproveMilestone(client, row);
      break;
    default:
      logger.warn('processCompletedAction: unknown action', { action: row.action });
      result = { action: row.action };
  }

  logger.info('processCompletedAction: done', { action: row.action, entityId: row.entity_id, data: result.data });
  return result;
}

async function handleCreateProject(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  projectManagerContract: ethers.Contract
): Promise<ActionResult> {
  // We still need the receipt to parse the ProjectCreated event for contractProjectId
  const receipt = await provider.getTransactionReceipt(row.tx_hash);
  if (!receipt) {
    logger.error('handleCreateProject: receipt not found', { txHash: row.tx_hash });
    return { action: 'create_project' };
  }

  const event = receipt.logs.find((log) => {
    try {
      const parsed = projectManagerContract.interface.parseLog(log);
      return parsed?.name === 'ProjectCreated';
    } catch {
      return false;
    }
  });

  if (!event) {
    logger.error('handleCreateProject: ProjectCreated event not found in receipt', { txHash: row.tx_hash });
    return { action: 'create_project' };
  }

  const parsed = projectManagerContract.interface.parseLog(event)!;
  const contractProjectId = parsed.args.projectId.toString();

  const updateResult = await client.query(
    `UPDATE projects
     SET contract_project_id = $1, status = 'created_on_chain', updated_at = NOW()
     WHERE id = $2 AND status = 'draft'`,
    [contractProjectId, row.entity_id]
  );

  logger.info('handleCreateProject: project updated', {
    projectId: row.entity_id,
    contractProjectId,
    rowsAffected: updateResult.rowCount,
  });

  return { action: 'create_project', data: { contractProjectId } };
}

async function handleDepositEscrow(
  client: PoolClient,
  row: PendingTxRow,
  projectManagerContract: ethers.Contract
): Promise<ActionResult> {
  const projectResult = await client.query(
    'SELECT contract_project_id, total_budget FROM projects WHERE id = $1',
    [row.entity_id]
  );

  if (projectResult.rows.length === 0) {
    logger.warn('handleDepositEscrow: project not found', { entityId: row.entity_id });
    return { action: 'deposit_escrow' };
  }

  const project = projectResult.rows[0];
  const amount = row.metadata?.amount || parseFloat(project.total_budget);

  await client.query(
    `INSERT INTO escrow_deposits (project_id, contract_project_id, total_deposited, deposit_tx_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id) DO NOTHING`,
    [row.entity_id, project.contract_project_id, amount, row.tx_hash]
  );

  const updateResult = await client.query(
    `UPDATE projects SET
      escrow_deposited = true,
      escrow_deposit_tx_hash = $1,
      escrow_deposited_at = NOW(),
      status = 'deposited'
     WHERE id = $2 AND escrow_deposited = false`,
    [row.tx_hash, row.entity_id]
  );

  logger.info('handleDepositEscrow: project status updated', {
    projectId: row.entity_id,
    rowsAffected: updateResult.rowCount,
  });

  // Auto-assignment must happen after commit (it reads committed data + may send on-chain tx)
  const entityId = row.entity_id;
  return {
    action: 'deposit_escrow',
    postCommit: async () => {
      try {
        const assignedDeveloper = await assignDeveloperToProject(pool, projectManagerContract, entityId);
        if (assignedDeveloper) {
          logger.info('handleDepositEscrow: developer auto-assigned', { projectId: entityId, assignedDeveloper });
        }
      } catch (err) {
        logger.error('handleDepositEscrow: auto-assignment failed', { projectId: entityId, error: err });
      }
    },
  };
}

async function handleStake(client: PoolClient, row: PendingTxRow): Promise<ActionResult> {
  const updateResult = await client.query(
    `UPDATE developers SET status = 'staked', updated_at = NOW()
     WHERE wallet_address = LOWER($1) AND status IN ('pending', 'created')`,
    [row.entity_id]
  );
  logger.info('handleStake: developer status updated', { walletAddress: row.entity_id, rowsAffected: updateResult.rowCount });
  return { action: 'stake' };
}

async function handleApproveMilestone(client: PoolClient, row: PendingTxRow): Promise<ActionResult> {
  const milestoneIndex = row.metadata?.milestoneIndex;
  if (milestoneIndex == null) {
    logger.error('handleApproveMilestone: missing milestoneIndex in metadata', { txHash: row.tx_hash });
    return { action: 'approve_milestone' };
  }

  const updateResult = await client.query(
    `UPDATE milestones SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE project_id = $1 AND on_chain_index = $2 AND status != 'completed'`,
    [row.entity_id, milestoneIndex]
  );
  logger.info('handleApproveMilestone: milestone approved', {
    projectId: row.entity_id,
    milestoneIndex,
    rowsAffected: updateResult.rowCount,
  });
  return { action: 'approve_milestone' };
}
