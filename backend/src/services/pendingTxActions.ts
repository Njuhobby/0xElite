import { ethers } from 'ethers';
import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { assignDeveloperToProject } from './matchingAlgorithm';
import { createNotification } from './notificationService';

export interface PendingTxRow {
  action: string;
  entity_id: string;
  entity_type: string;
  tx_hash: string;
  metadata: any;
}

/**
 * Bag of on-chain contracts the action handlers can parse events from
 * or call view functions on. Add a new field when a new contract needs
 * its events interpreted by the pendingTx pipeline.
 */
export interface Contracts {
  projectManager: ethers.Contract;
  disputeDAO: ethers.Contract;
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
  contracts: Contracts
): Promise<ActionResult> {
  logger.info('processCompletedAction: start', { action: row.action, entityId: row.entity_id, txHash: row.tx_hash });

  let result: ActionResult;

  switch (row.action) {
    case 'create_project':
      result = await handleCreateProject(client, row, provider, contracts.projectManager);
      break;
    case 'deposit_escrow':
      result = await handleDepositEscrow(client, row, contracts.projectManager);
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
    case 'create_dispute':
      result = await handleCreateDispute(client, row, provider, contracts.disputeDAO);
      break;
    case 'submit_evidence':
      result = await handleSubmitEvidence(client, row, provider, contracts.disputeDAO);
      break;
    case 'start_voting':
      result = await handleStartVoting(client, row, provider, contracts.disputeDAO);
      break;
    case 'cast_vote':
      result = await handleCastVote(client, row, provider, contracts.disputeDAO);
      break;
    case 'execute_resolution':
      result = await handleExecuteResolution(client, row, provider, contracts.disputeDAO);
      break;
    case 'owner_resolve':
      result = await handleOwnerResolve(client, row, provider, contracts.disputeDAO);
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

  const parsed = findEvent(receipt, projectManagerContract, 'ProjectCreated');
  if (!parsed) {
    logger.error('handleCreateProject: ProjectCreated event not found in receipt', { txHash: row.tx_hash });
    return { action: 'create_project' };
  }

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

// =============================================================================
// Dispute handlers — entity_id conventions:
//   create_dispute: project UUID (no dispute row exists yet; handler inserts it)
//   submit_evidence/start_voting/cast_vote/execute_resolution/owner_resolve:
//                   dispute UUID (row already exists, handler updates it)
// =============================================================================

async function handleCreateDispute(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  disputeDAO: ethers.Contract
): Promise<ActionResult> {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);
  if (!receipt) {
    logger.error('handleCreateDispute: receipt not found', { txHash: row.tx_hash });
    return { action: 'create_dispute' };
  }

  const parsed = findEvent(receipt, disputeDAO, 'DisputeCreated');
  if (!parsed) {
    logger.error('handleCreateDispute: DisputeCreated event not found', { txHash: row.tx_hash });
    return { action: 'create_dispute' };
  }

  const chainDisputeId = Number(parsed.args.disputeId);
  const initiator = (parsed.args.initiator as string).toLowerCase();

  // Idempotency: if a later retry re-enters here, bail out instead of double-inserting.
  const existing = await client.query(
    'SELECT id FROM disputes WHERE chain_dispute_id = $1',
    [chainDisputeId]
  );
  if (existing.rows.length > 0) {
    logger.info('handleCreateDispute: dispute already synced', { chainDisputeId });
    return { action: 'create_dispute', data: { disputeId: existing.rows[0].id, chainDisputeId } };
  }

  const projectResult = await client.query(
    'SELECT id, title, client_address, assigned_developer FROM projects WHERE id = $1',
    [row.entity_id]
  );
  if (projectResult.rows.length === 0) {
    logger.error('handleCreateDispute: project not found', { entityId: row.entity_id });
    return { action: 'create_dispute' };
  }
  const project = projectResult.rows[0];
  const projectTitle: string = project.title;
  const clientAddr = project.client_address?.toLowerCase();
  const devAddr = project.assigned_developer?.toLowerCase();
  if (!clientAddr || !devAddr) {
    logger.error('handleCreateDispute: project missing client or developer', { projectId: project.id });
    return { action: 'create_dispute' };
  }

  const timeline = await disputeDAO.getDisputeTimeline(chainDisputeId);
  const clientEvidenceURI: string = timeline[0];
  const developerEvidenceURI: string = timeline[1];
  const evidenceDeadlineSec: bigint = timeline[2];

  const core = await disputeDAO.getDisputeCore(chainDisputeId);
  const arbitrationFeeRaw: bigint = core[7];
  const feeUsdc = (Number(arbitrationFeeRaw) / 1e6).toFixed(6);

  const isClientInitiator = initiator === clientAddr;

  const insertResult = await client.query(
    `INSERT INTO disputes (
       project_id, client_address, developer_address, initiator_address,
       initiator_role, status, client_evidence_uri, developer_evidence_uri,
       evidence_deadline, arbitration_fee, chain_dispute_id, creation_tx_hash
     ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      project.id,
      clientAddr,
      devAddr,
      initiator,
      isClientInitiator ? 'client' : 'developer',
      clientEvidenceURI || null,
      developerEvidenceURI || null,
      new Date(Number(evidenceDeadlineSec) * 1000),
      feeUsdc,
      chainDisputeId,
      row.tx_hash,
    ]
  );
  const disputeId = insertResult.rows[0].id;

  await client.query(
    `UPDATE projects SET status = 'disputed', updated_at = NOW()
     WHERE id = $1 AND status != 'disputed'`,
    [project.id]
  );

  await client.query(
    `UPDATE escrow_deposits
       SET is_frozen = true, frozen_at = NOW(), frozen_by = $1
     WHERE project_id = $2`,
    [initiator, project.id]
  );

  logger.info('handleCreateDispute: dispute synced', { disputeId, chainDisputeId, projectId: project.id });

  const initiatorRole = isClientInitiator ? 'client' : 'developer';
  const opposingAddr = isClientInitiator ? devAddr : clientAddr;
  const opposingRole = isClientInitiator ? 'developer' : 'client';
  const disputeLink = `/disputes/${disputeId}`;

  return {
    action: 'create_dispute',
    data: { disputeId, chainDisputeId },
    postCommit: async () => {
      // Notify the party who just got disputed against.
      await createNotification(
        opposingAddr,
        'dispute_filed',
        'Dispute filed against you',
        `A dispute has been opened on "${projectTitle}". You have 3 days to submit counter-evidence before voting begins.`,
        disputeLink
      );
      // Confirmation for the initiator.
      await createNotification(
        initiator,
        'dispute_created',
        'Dispute filed',
        `Your dispute on "${projectTitle}" is open. The escrow is frozen and the ${opposingRole} has 3 days to respond.`,
        disputeLink
      );
      logger.info('handleCreateDispute: notifications sent', {
        disputeId,
        initiatorRole,
        opposingRole,
      });
    },
  };
}

async function handleSubmitEvidence(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  disputeDAO: ethers.Contract
): Promise<ActionResult> {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);
  if (!receipt) {
    logger.error('handleSubmitEvidence: receipt not found', { txHash: row.tx_hash });
    return { action: 'submit_evidence' };
  }

  const parsed = findEvent(receipt, disputeDAO, 'EvidenceSubmitted');
  if (!parsed) {
    logger.error('handleSubmitEvidence: EvidenceSubmitted event not found', { txHash: row.tx_hash });
    return { action: 'submit_evidence' };
  }

  const party = (parsed.args.party as string).toLowerCase();
  const evidenceURI = parsed.args.evidenceURI as string;

  const disputeResult = await client.query(
    'SELECT id, client_address FROM disputes WHERE id = $1',
    [row.entity_id]
  );
  if (disputeResult.rows.length === 0) {
    logger.error('handleSubmitEvidence: dispute not found', { entityId: row.entity_id });
    return { action: 'submit_evidence' };
  }
  const dispute = disputeResult.rows[0];
  const isClient = party === dispute.client_address.toLowerCase();
  const field = isClient ? 'client_evidence_uri' : 'developer_evidence_uri';

  await client.query(
    `UPDATE disputes SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
    [evidenceURI, dispute.id]
  );

  logger.info('handleSubmitEvidence: evidence recorded', { disputeId: dispute.id, party });
  return { action: 'submit_evidence', data: { disputeId: dispute.id, party } };
}

async function handleStartVoting(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  disputeDAO: ethers.Contract
): Promise<ActionResult> {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);
  if (!receipt) {
    logger.error('handleStartVoting: receipt not found', { txHash: row.tx_hash });
    return { action: 'start_voting' };
  }

  const parsed = findEvent(receipt, disputeDAO, 'VotingStarted');
  if (!parsed) {
    logger.error('handleStartVoting: VotingStarted event not found', { txHash: row.tx_hash });
    return { action: 'start_voting' };
  }

  const chainDisputeId = Number(parsed.args.disputeId);
  const votingDeadline = new Date(Number(parsed.args.votingDeadline) * 1000);
  const votingSnapshot = new Date(Number(parsed.args.votingSnapshot) * 1000);

  // quorumNumerator lives on the contract; default 25 (%). Read it to stay correct
  // if an owner ever changes it.
  const voting = await disputeDAO.getDisputeVoting(chainDisputeId);
  const snapshotTotalSupplyRaw: bigint = voting[3];
  const quorumNumerator: bigint = await disputeDAO.quorumNumerator();
  const snapshotTotalSupply = Number(snapshotTotalSupplyRaw) / 1e6;
  const quorumRequired = ((snapshotTotalSupply * Number(quorumNumerator)) / 100).toFixed(6);

  const result = await client.query(
    `UPDATE disputes SET
       status = 'voting',
       voting_deadline = $1,
       voting_snapshot = $2,
       quorum_required = $3,
       updated_at = NOW()
     WHERE id = $4 AND status = 'open'`,
    [votingDeadline, votingSnapshot, quorumRequired, row.entity_id]
  );

  // Capture the parties so we can exclude them from the broadcast.
  const partiesResult = await client.query(
    'SELECT client_address, developer_address, project_id FROM disputes WHERE id = $1',
    [row.entity_id]
  );
  const parties = partiesResult.rows[0];
  const projectTitleResult = parties
    ? await client.query('SELECT title FROM projects WHERE id = $1', [parties.project_id])
    : null;
  const projectTitle: string = projectTitleResult?.rows[0]?.title ?? 'a project';

  logger.info('handleStartVoting: voting started', {
    disputeId: row.entity_id,
    rowsAffected: result.rowCount,
    quorumRequired,
  });

  return {
    action: 'start_voting',
    data: { votingDeadline, quorumRequired },
    postCommit: async () => {
      if (!parties) return;
      // Broadcast to all xELITE holders except the two dispute parties.
      // `developers.elite_token_balance` is kept in sync with on-chain balances.
      const holders = await pool.query<{ wallet_address: string }>(
        `SELECT wallet_address FROM developers
          WHERE elite_token_balance > 0
            AND wallet_address != $1
            AND wallet_address != $2`,
        [parties.client_address.toLowerCase(), parties.developer_address.toLowerCase()]
      );
      const link = `/disputes/${row.entity_id}`;
      const deadlineText = votingDeadline.toLocaleDateString();
      for (const { wallet_address } of holders.rows) {
        await createNotification(
          wallet_address,
          'voting_started',
          'A dispute is open for voting',
          `Voting opened on "${projectTitle}". Cast your vote before ${deadlineText}.`,
          link
        );
      }
      logger.info('handleStartVoting: broadcast sent', {
        disputeId: row.entity_id,
        recipients: holders.rows.length,
      });
    },
  };
}

async function handleCastVote(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  disputeDAO: ethers.Contract
): Promise<ActionResult> {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);
  if (!receipt) {
    logger.error('handleCastVote: receipt not found', { txHash: row.tx_hash });
    return { action: 'cast_vote' };
  }

  const parsed = findEvent(receipt, disputeDAO, 'VoteCast');
  if (!parsed) {
    logger.error('handleCastVote: VoteCast event not found', { txHash: row.tx_hash });
    return { action: 'cast_vote' };
  }

  const voter = (parsed.args.voter as string).toLowerCase();
  const supportClient = Boolean(parsed.args.supportClient);
  const weight = (Number(parsed.args.weight) / 1e6).toFixed(6);

  const insert = await client.query(
    `INSERT INTO dispute_votes (dispute_id, voter_address, support_client, vote_weight, tx_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (dispute_id, voter_address) DO NOTHING`,
    [row.entity_id, voter, supportClient, weight, row.tx_hash]
  );

  // Only bump the tallies if this INSERT actually took effect (avoids double counting on retry).
  if ((insert.rowCount ?? 0) === 1) {
    const tallyField = supportClient ? 'client_vote_weight' : 'developer_vote_weight';
    await client.query(
      `UPDATE disputes SET
         ${tallyField} = ${tallyField} + $1::decimal,
         total_vote_weight = total_vote_weight + $1::decimal,
         updated_at = NOW()
       WHERE id = $2`,
      [weight, row.entity_id]
    );
  }

  logger.info('handleCastVote: vote recorded', { disputeId: row.entity_id, voter, supportClient, weight });
  return { action: 'cast_vote', data: { voter, supportClient, weight } };
}

async function handleExecuteResolution(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  disputeDAO: ethers.Contract
): Promise<ActionResult> {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);
  if (!receipt) {
    logger.error('handleExecuteResolution: receipt not found', { txHash: row.tx_hash });
    return { action: 'execute_resolution' };
  }

  const parsed = findEvent(receipt, disputeDAO, 'DisputeResolved');
  if (!parsed) {
    logger.error('handleExecuteResolution: DisputeResolved event not found', { txHash: row.tx_hash });
    return { action: 'execute_resolution' };
  }

  const clientWon = Boolean(parsed.args.clientWon);
  const clientShare = (Number(parsed.args.clientShare) / 1e6).toFixed(6);
  const developerShare = (Number(parsed.args.developerShare) / 1e6).toFixed(6);

  return finalizeResolution(client, row.entity_id, row.tx_hash, {
    clientWon,
    clientShare,
    developerShare,
    byOwner: false,
  });
}

async function handleOwnerResolve(
  client: PoolClient,
  row: PendingTxRow,
  provider: ethers.JsonRpcProvider,
  disputeDAO: ethers.Contract
): Promise<ActionResult> {
  const receipt = await provider.getTransactionReceipt(row.tx_hash);
  if (!receipt) {
    logger.error('handleOwnerResolve: receipt not found', { txHash: row.tx_hash });
    return { action: 'owner_resolve' };
  }

  const parsed = findEvent(receipt, disputeDAO, 'DisputeResolvedByOwner');
  if (!parsed) {
    logger.error('handleOwnerResolve: DisputeResolvedByOwner event not found', { txHash: row.tx_hash });
    return { action: 'owner_resolve' };
  }

  const clientWon = Boolean(parsed.args.clientWon);

  // Owner-resolve event does not carry share amounts. Derive from the project's
  // current remaining escrow balance (winner gets 100%, same as on-chain logic).
  const balanceResult = await client.query(
    `SELECT ed.escrow_balance::text AS remaining
       FROM disputes d
       JOIN escrow_deposits ed ON ed.project_id = d.project_id
      WHERE d.id = $1`,
    [row.entity_id]
  );
  const remaining: string = balanceResult.rows[0]?.remaining ?? '0';
  const clientShare = clientWon ? remaining : '0';
  const developerShare = clientWon ? '0' : remaining;

  return finalizeResolution(client, row.entity_id, row.tx_hash, {
    clientWon,
    clientShare,
    developerShare,
    byOwner: true,
  });
}

async function finalizeResolution(
  client: PoolClient,
  disputeId: string,
  txHash: string,
  opts: {
    clientWon: boolean;
    clientShare: string;
    developerShare: string;
    byOwner: boolean;
  }
): Promise<ActionResult> {
  const { clientWon, clientShare, developerShare, byOwner } = opts;
  const action = byOwner ? 'owner_resolve' : 'execute_resolution';

  const updateResult = await client.query(
    `UPDATE disputes SET
       status = 'resolved',
       winner = $1,
       resolved_by_owner = $2,
       client_share = $3,
       developer_share = $4,
       resolution_tx_hash = $5,
       updated_at = NOW()
     WHERE id = $6 AND status = 'voting'
     RETURNING project_id`,
    [
      clientWon ? 'client' : 'developer',
      byOwner,
      clientShare,
      developerShare,
      txHash,
      disputeId,
    ]
  );

  if (updateResult.rowCount === 0) {
    logger.warn('finalizeResolution: no dispute row updated (already resolved or wrong status?)', { disputeId });
    return { action };
  }

  const projectId: string = updateResult.rows[0].project_id;
  const newProjectStatus = clientWon ? 'cancelled' : 'completed';

  await client.query(
    `UPDATE projects SET status = $1, updated_at = NOW()
     WHERE id = $2 AND status = 'disputed'`,
    [newProjectStatus, projectId]
  );

  const releasedDelta = (parseFloat(clientShare) + parseFloat(developerShare)).toFixed(6);
  await client.query(
    `UPDATE escrow_deposits SET
       is_frozen = false,
       total_released = total_released + $1::decimal
     WHERE project_id = $2`,
    [releasedDelta, projectId]
  );

  logger.info('finalizeResolution: dispute resolved', { disputeId, clientWon, byOwner, projectId });
  return { action, data: { clientWon, clientShare, developerShare } };
}

// =============================================================================
// Helpers
// =============================================================================

function findEvent(
  receipt: ethers.TransactionReceipt,
  contract: ethers.Contract,
  eventName: string
): ethers.LogDescription | null {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === eventName) return parsed;
    } catch {
      // log does not belong to this contract — keep scanning
    }
  }
  return null;
}
