/**
 * Chain reconciler — block-range scanner that reads on-chain events directly
 * (independent of the pending_transactions fast-path) and feeds them into the
 * same `processCompletedAction` handlers used by the poller.
 *
 * Why: the poller depends on someone (the frontend) having written a row to
 * pending_transactions. If that step is missed (frontend crash before POST,
 * direct contract call from a script, poller downtime > 1h that flushes the
 * queue, PG restored from backup, etc.), the DB silently drifts from the
 * chain. This reconciler closes that gap by treating the chain as the only
 * source of truth and replaying events from the last synced block forward.
 *
 * Idempotency: the existing handlers (handleCreateDispute, handleSubmitEvidence,
 * etc.) all check for already-existing records (e.g. by chain_dispute_id) and
 * no-op or update accordingly, so re-processing the same event is safe.
 *
 * Limitations (intentional, deferrable):
 *  - ProjectCreated is NOT reconciled. The handler needs the DB-side project
 *    UUID, which can't be derived from the event alone (only the chain id and
 *    client address are available). The fast-path is responsible for this; if
 *    a project is missed, manual intervention is required.
 *  - EscrowVault Deposit events aren't yet exposed in the ABI loaded in
 *    index.ts. Adding them is a separate change.
 */

import { ethers } from 'ethers';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { processCompletedAction, Contracts, PendingTxRow } from './pendingTxActions';

// =============================================================================
// Configuration
// =============================================================================

const CURSOR_KEY = 'last_synced_block';
const RECONCILE_INTERVAL_MS = Number(process.env.RECONCILER_INTERVAL ?? 30_000);
const MAX_BLOCK_RANGE = Number(process.env.RECONCILER_MAX_RANGE ?? 5_000);

/**
 * If no cursor row exists yet, start from this block. Set this to the
 * deployment block of the contracts in production. For local dev / Hardhat,
 * 0 is fine (chain is short).
 */
const STARTUP_FALLBACK_BLOCK = Number(process.env.RECONCILER_START_BLOCK ?? 0);

// =============================================================================
// Event → handler binding
// =============================================================================

interface EventBinding {
  contract: keyof Contracts;
  /** Action key understood by `processCompletedAction`'s switch. */
  action: string;
  entityType: string;
  /**
   * Look up the entity_id (and any metadata the handler needs) from the
   * event's args. Returning null means "skip this event" — typically because
   * the corresponding DB row doesn't exist yet (e.g. a project that was
   * created on-chain but not via our frontend).
   */
  deriveRow: (
    parsed: ethers.LogDescription
  ) => Promise<{ entity_id: string; metadata: Record<string, unknown> } | null>;
}

const lookupProjectByChainId = async (chainId: bigint | number) => {
  const r = await pool.query<{ id: string }>(
    'SELECT id FROM projects WHERE contract_project_id = $1',
    [String(chainId)]
  );
  return r.rows[0]?.id ?? null;
};

const lookupDisputeByChainId = async (chainId: bigint | number) => {
  const r = await pool.query<{ id: string }>(
    'SELECT id FROM disputes WHERE chain_dispute_id = $1',
    [Number(chainId)]
  );
  return r.rows[0]?.id ?? null;
};

const EVENT_BINDINGS: Record<string, EventBinding> = {
  // ---------- ProjectManager ----------
  MilestoneApproved: {
    contract: 'projectManager',
    action: 'approve_milestone',
    entityType: 'project',
    deriveRow: async (parsed) => {
      const projectId = await lookupProjectByChainId(parsed.args.projectId);
      if (!projectId) return null;
      return {
        entity_id: projectId,
        metadata: { milestoneIndex: Number(parsed.args.milestoneIndex) },
      };
    },
  },

  // ---------- DisputeDAO ----------
  DisputeCreated: {
    contract: 'disputeDAO',
    action: 'create_dispute',
    entityType: 'dispute',
    deriveRow: async (parsed) => {
      const projectId = await lookupProjectByChainId(parsed.args.projectId);
      if (!projectId) return null;
      // create_dispute uses project UUID as entity_id; handler then inserts the dispute row.
      return { entity_id: projectId, metadata: {} };
    },
  },
  EvidenceSubmitted: {
    contract: 'disputeDAO',
    action: 'submit_evidence',
    entityType: 'dispute',
    deriveRow: async (parsed) => {
      const disputeId = await lookupDisputeByChainId(parsed.args.disputeId);
      if (!disputeId) return null;
      return { entity_id: disputeId, metadata: {} };
    },
  },
  VotingStarted: {
    contract: 'disputeDAO',
    action: 'start_voting',
    entityType: 'dispute',
    deriveRow: async (parsed) => {
      const disputeId = await lookupDisputeByChainId(parsed.args.disputeId);
      if (!disputeId) return null;
      return { entity_id: disputeId, metadata: {} };
    },
  },
  VoteCast: {
    contract: 'disputeDAO',
    action: 'cast_vote',
    entityType: 'dispute',
    deriveRow: async (parsed) => {
      const disputeId = await lookupDisputeByChainId(parsed.args.disputeId);
      if (!disputeId) return null;
      return { entity_id: disputeId, metadata: {} };
    },
  },
  DisputeResolved: {
    contract: 'disputeDAO',
    action: 'execute_resolution',
    entityType: 'dispute',
    deriveRow: async (parsed) => {
      const disputeId = await lookupDisputeByChainId(parsed.args.disputeId);
      if (!disputeId) return null;
      return { entity_id: disputeId, metadata: {} };
    },
  },
  DisputeResolvedByOwner: {
    contract: 'disputeDAO',
    action: 'owner_resolve',
    entityType: 'dispute',
    deriveRow: async (parsed) => {
      const disputeId = await lookupDisputeByChainId(parsed.args.disputeId);
      if (!disputeId) return null;
      return { entity_id: disputeId, metadata: {} };
    },
  },
};

// =============================================================================
// Cursor I/O
// =============================================================================

async function getCursor(): Promise<number> {
  const r = await pool.query<{ value: string }>(
    `SELECT value FROM system_state WHERE key = $1`,
    [CURSOR_KEY]
  );
  if (r.rows.length === 0) {
    logger.info('chainReconciler: no cursor, using fallback', { block: STARTUP_FALLBACK_BLOCK });
    return STARTUP_FALLBACK_BLOCK;
  }
  return parseInt(r.rows[0].value, 10);
}

async function setCursor(block: number): Promise<void> {
  await pool.query(
    `INSERT INTO system_state (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [CURSOR_KEY, String(block)]
  );
}

// =============================================================================
// Event processing
// =============================================================================

let provider: ethers.JsonRpcProvider;
let contracts: Contracts;
let running = false;

async function processOneEvent(
  log: ethers.EventLog,
  eventName: string
): Promise<void> {
  const binding = EVENT_BINDINGS[eventName];
  if (!binding) return;
  if (!log.args) {
    logger.warn('chainReconciler: log missing args, skipping', { eventName, txHash: log.transactionHash });
    return;
  }

  const partial = await binding.deriveRow(log as unknown as ethers.LogDescription);
  if (!partial) {
    logger.debug('chainReconciler: event not mappable to a DB entity, skipping', {
      eventName,
      txHash: log.transactionHash,
    });
    return;
  }

  const row: PendingTxRow = {
    action: binding.action,
    entity_id: partial.entity_id,
    entity_type: binding.entityType,
    tx_hash: log.transactionHash,
    metadata: partial.metadata,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await processCompletedAction(client, row, provider, contracts);
    // If the fast-path also has this tx queued, clean it up so the poller
    // doesn't redo work the reconciler just did.
    await client.query('DELETE FROM pending_transactions WHERE tx_hash = $1', [log.transactionHash]);
    await client.query('COMMIT');

    logger.info('chainReconciler: event processed', {
      eventName,
      action: binding.action,
      txHash: log.transactionHash,
      entityId: row.entity_id,
    });

    if (result.postCommit) {
      result.postCommit().catch((err) => {
        logger.error('chainReconciler: postCommit failed', {
          eventName,
          txHash: log.transactionHash,
          error: err,
        });
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('chainReconciler: event processing rolled back', {
      eventName,
      txHash: log.transactionHash,
      error: err,
    });
    // Re-throw so the caller stops advancing the cursor for this range.
    throw err;
  } finally {
    client.release();
  }
}

async function reconcileRange(fromBlock: number, toBlock: number): Promise<void> {
  // Group event names by contract so we can issue one queryFilter per (contract, event).
  const contractInstances: Record<keyof Contracts, ethers.Contract> = {
    projectManager: contracts.projectManager,
    disputeDAO: contracts.disputeDAO,
  };

  // Collect all events first, then sort by (blockNumber, logIndex) so we
  // process them in chronological order across contracts. Important for
  // cases like create_dispute → submit_evidence in the same block.
  const allLogs: Array<{ log: ethers.EventLog; eventName: string }> = [];

  for (const [eventName, binding] of Object.entries(EVENT_BINDINGS)) {
    const contract = contractInstances[binding.contract];
    const filter = (contract.filters[eventName] as () => ethers.DeferredTopicFilter)();
    const events = (await contract.queryFilter(filter, fromBlock, toBlock)) as ethers.EventLog[];
    for (const ev of events) {
      allLogs.push({ log: ev, eventName });
    }
  }

  allLogs.sort((a, b) => {
    if (a.log.blockNumber !== b.log.blockNumber) return a.log.blockNumber - b.log.blockNumber;
    return a.log.index - b.log.index;
  });

  for (const { log, eventName } of allLogs) {
    await processOneEvent(log, eventName);
  }
}

// =============================================================================
// Public entry points
// =============================================================================

async function reconcile(): Promise<void> {
  if (running) {
    logger.debug('chainReconciler: previous tick still running, skipping');
    return;
  }
  running = true;

  try {
    const cursor = await getCursor();
    const head = await provider.getBlockNumber();
    let from = cursor + 1;

    if (from > head) {
      return;
    }

    while (from <= head) {
      const to = Math.min(from + MAX_BLOCK_RANGE - 1, head);
      try {
        await reconcileRange(from, to);
        await setCursor(to);
        logger.info('chainReconciler: synced block range', {
          from,
          to,
          headAtStart: head,
        });
        from = to + 1;
      } catch (err) {
        logger.error('chainReconciler: range failed, will retry next tick', {
          from,
          to,
          error: err,
        });
        return; // bail out without advancing cursor
      }
    }
  } catch (err) {
    logger.error('chainReconciler: tick failed', { error: err });
  } finally {
    running = false;
  }
}

export async function startChainReconciler(
  rpcProvider: ethers.JsonRpcProvider,
  contractBag: Contracts
): Promise<void> {
  provider = rpcProvider;
  contracts = contractBag;

  logger.info('chainReconciler: starting', {
    intervalMs: RECONCILE_INTERVAL_MS,
    maxBlockRange: MAX_BLOCK_RANGE,
    fallbackStartBlock: STARTUP_FALLBACK_BLOCK,
  });

  // Initial catch-up before scheduling.
  await reconcile();
  setInterval(reconcile, RECONCILE_INTERVAL_MS);
}
