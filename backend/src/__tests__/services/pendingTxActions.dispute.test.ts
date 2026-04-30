/**
 * Integration tests for dispute handlers in pendingTxActions.
 *
 * Each handler is invoked with a mocked PoolClient, JsonRpcProvider, and
 * DisputeDAO contract. The contract's interface.parseLog is stubbed to return
 * the relevant event so findEvent() picks it up. We then assert the handler
 * issued the expected DB queries.
 */

import { createMockPool } from '../helpers/mockPool';
import { createMockDisputeDAOContract } from '../helpers/mockContract';
import { ADDRESSES, SAMPLE_PROJECT } from '../helpers/fixtures';
import { processCompletedAction, type PendingTxRow } from '../../services/pendingTxActions';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// matchingAlgorithm is invoked as a postCommit hook by handleDepositEscrow,
// not by any dispute handler — but the import is hoisted, so stub it out.
jest.mock('../../services/matchingAlgorithm', () => ({
  assignDeveloperToProject: jest.fn().mockResolvedValue(null),
  processPendingQueue: jest.fn().mockResolvedValue(null),
}));

// Avoid touching the real pool import (the dispute handlers don't reach it,
// but pendingTxActions.ts imports it at module load).
jest.mock('../../config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn(), on: jest.fn() },
}));

const TX_HASH = '0x' + 'aa'.repeat(32);
const CHAIN_DISPUTE_ID = 7;
const DISPUTE_UUID = 'disp-uuid-001';

function makeReceipt() {
  return { logs: [{ topics: [], data: '0x' }] };
}

function makeProvider() {
  return {
    getTransactionReceipt: jest.fn().mockResolvedValue(makeReceipt()),
  } as any;
}

function makeRow(action: string, entityId: string, metadata: any = null): PendingTxRow {
  return {
    action,
    entity_id: entityId,
    entity_type: 'dispute',
    tx_hash: TX_HASH,
    metadata,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// handleCreateDispute
// =============================================================================
describe('handleCreateDispute', () => {
  it('inserts dispute row, freezes escrow, marks project disputed', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'DisputeCreated',
      args: {
        disputeId: BigInt(CHAIN_DISPUTE_ID),
        projectId: BigInt(1),
        initiator: ADDRESSES.client1,
      },
    });

    disputeDAO.getDisputeTimeline.mockResolvedValueOnce([
      'ipfs://client-evidence',
      '',
      BigInt(Math.floor(Date.now() / 1000) + 3 * 86400),
      BigInt(0),
      BigInt(0),
    ]);

    disputeDAO.getDisputeCore.mockResolvedValueOnce([
      BigInt(1),
      ADDRESSES.client1,
      ADDRESSES.developer1,
      ADDRESSES.client1,
      0,
      false,
      false,
      BigInt(50_000_000), // arbitration fee
    ]);

    pool._client.query
      // existing chain_dispute_id check
      .mockResolvedValueOnce({ rows: [] })
      // project lookup
      .mockResolvedValueOnce({
        rows: [{
          id: SAMPLE_PROJECT.id,
          client_address: ADDRESSES.client1,
          assigned_developer: ADDRESSES.developer1,
        }],
      })
      // INSERT dispute
      .mockResolvedValueOnce({ rows: [{ id: DISPUTE_UUID }] })
      // UPDATE projects → disputed
      .mockResolvedValueOnce({ rowCount: 1 })
      // UPDATE escrow → frozen
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await processCompletedAction(
      pool._client as any,
      makeRow('create_dispute', SAMPLE_PROJECT.id),
      provider,
      contracts
    );

    expect(result.action).toBe('create_dispute');
    expect(result.data?.disputeId).toBe(DISPUTE_UUID);
    expect(result.data?.chainDisputeId).toBe(CHAIN_DISPUTE_ID);

    const queries = pool._client.query.mock.calls.map((c) => c[0]);
    expect(queries.some((q) => /INSERT INTO disputes/.test(q))).toBe(true);
    expect(queries.some((q) => /UPDATE projects[\s\S]+disputed/.test(q))).toBe(true);
    expect(queries.some((q) => /UPDATE escrow_deposits[\s\S]+is_frozen = true/.test(q))).toBe(true);
  });

  it('is idempotent: bails out if chain_dispute_id already synced', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'DisputeCreated',
      args: {
        disputeId: BigInt(CHAIN_DISPUTE_ID),
        projectId: BigInt(1),
        initiator: ADDRESSES.client1,
      },
    });

    pool._client.query.mockResolvedValueOnce({ rows: [{ id: DISPUTE_UUID }] });

    const result = await processCompletedAction(
      pool._client as any,
      makeRow('create_dispute', SAMPLE_PROJECT.id),
      provider,
      contracts
    );

    expect(result.data?.disputeId).toBe(DISPUTE_UUID);
    expect(disputeDAO.getDisputeCore).not.toHaveBeenCalled();
    expect(pool._client.query).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// handleSubmitEvidence
// =============================================================================
describe('handleSubmitEvidence', () => {
  it('updates client_evidence_uri when client submits', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'EvidenceSubmitted',
      args: { party: ADDRESSES.client1, evidenceURI: 'ipfs://new-evidence' },
    });

    pool._client.query
      .mockResolvedValueOnce({ rows: [{ id: DISPUTE_UUID, client_address: ADDRESSES.client1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    await processCompletedAction(
      pool._client as any,
      makeRow('submit_evidence', DISPUTE_UUID),
      provider,
      contracts
    );

    const updateCall = pool._client.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/client_evidence_uri/);
    expect(updateCall[1]).toEqual(['ipfs://new-evidence', DISPUTE_UUID]);
  });

  it('updates developer_evidence_uri when developer submits', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'EvidenceSubmitted',
      args: { party: ADDRESSES.developer1, evidenceURI: 'ipfs://dev-ev' },
    });

    pool._client.query
      .mockResolvedValueOnce({ rows: [{ id: DISPUTE_UUID, client_address: ADDRESSES.client1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    await processCompletedAction(
      pool._client as any,
      makeRow('submit_evidence', DISPUTE_UUID),
      provider,
      contracts
    );

    expect(pool._client.query.mock.calls[1][0]).toMatch(/developer_evidence_uri/);
  });
});

// =============================================================================
// handleStartVoting
// =============================================================================
describe('handleStartVoting', () => {
  it('transitions dispute to voting status with computed quorum', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    const deadline = Math.floor(Date.now() / 1000) + 5 * 86400;
    const snapshot = Math.floor(Date.now() / 1000);

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'VotingStarted',
      args: {
        disputeId: BigInt(CHAIN_DISPUTE_ID),
        votingDeadline: BigInt(deadline),
        votingSnapshot: BigInt(snapshot),
      },
    });

    // getDisputeVoting returns [client, dev, total, snapshotTotalSupply]
    disputeDAO.getDisputeVoting.mockResolvedValueOnce([
      BigInt(0),
      BigInt(0),
      BigInt(0),
      BigInt(1_000_000_000_000), // 1,000,000 token snapshot supply (6 decimals)
    ]);
    // quorumNumerator returns 25 (default)

    pool._client.query.mockResolvedValueOnce({ rowCount: 1 });

    const result = await processCompletedAction(
      pool._client as any,
      makeRow('start_voting', DISPUTE_UUID),
      provider,
      contracts
    );

    expect(result.action).toBe('start_voting');
    // 1,000,000 * 25% = 250,000 quorum required
    expect(result.data?.quorumRequired).toBe('250000.000000');

    const updateCall = pool._client.query.mock.calls[0];
    expect(updateCall[0]).toMatch(/status = 'voting'/);
    expect(updateCall[1][2]).toBe('250000.000000');
  });
});

// =============================================================================
// handleCastVote
// =============================================================================
describe('handleCastVote', () => {
  it('inserts vote and bumps tally when new', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'VoteCast',
      args: {
        voter: ADDRESSES.developer2,
        supportClient: true,
        weight: BigInt(100_000_000), // 100 tokens
      },
    });

    pool._client.query
      .mockResolvedValueOnce({ rowCount: 1 }) // INSERT vote
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE tallies

    await processCompletedAction(
      pool._client as any,
      makeRow('cast_vote', DISPUTE_UUID),
      provider,
      contracts
    );

    const queries = pool._client.query.mock.calls.map((c) => c[0]);
    expect(queries[0]).toMatch(/INSERT INTO dispute_votes/);
    expect(queries[1]).toMatch(/client_vote_weight = client_vote_weight \+/);
  });

  it('skips tally bump when vote already recorded (idempotent)', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'VoteCast',
      args: { voter: ADDRESSES.developer2, supportClient: false, weight: BigInt(100_000_000) },
    });

    pool._client.query.mockResolvedValueOnce({ rowCount: 0 }); // ON CONFLICT DO NOTHING

    await processCompletedAction(
      pool._client as any,
      makeRow('cast_vote', DISPUTE_UUID),
      provider,
      contracts
    );

    expect(pool._client.query).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// handleExecuteResolution
// =============================================================================
describe('handleExecuteResolution', () => {
  it('finalizes dispute by vote outcome', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'DisputeResolved',
      args: {
        clientWon: true,
        clientShare: BigInt(3000_000_000),
        developerShare: BigInt(0),
      },
    });

    pool._client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ project_id: SAMPLE_PROJECT.id }] })
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE project status
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE escrow

    const result = await processCompletedAction(
      pool._client as any,
      makeRow('execute_resolution', DISPUTE_UUID),
      provider,
      contracts
    );

    expect(result.action).toBe('execute_resolution');
    expect(result.data?.clientWon).toBe(true);

    const queries = pool._client.query.mock.calls;
    expect(queries[0][0]).toMatch(/status = 'resolved'/);
    expect(queries[0][1][0]).toBe('client'); // winner
    expect(queries[0][1][1]).toBe(false); // resolved_by_owner
    expect(queries[1][0]).toMatch(/UPDATE projects[\s\S]+SET status = \$1/);
    expect(queries[1][1][0]).toBe('cancelled'); // client won → project cancelled
  });
});

// =============================================================================
// handleOwnerResolve
// =============================================================================
describe('handleOwnerResolve', () => {
  it('awards 100% remaining escrow to winner (developer)', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'DisputeResolvedByOwner',
      args: { clientWon: false },
    });

    pool._client.query
      // SELECT remaining escrow balance
      .mockResolvedValueOnce({ rows: [{ remaining: '2500.000000' }] })
      // UPDATE disputes → resolved
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ project_id: SAMPLE_PROJECT.id }] })
      // UPDATE projects → completed (developer won)
      .mockResolvedValueOnce({ rowCount: 1 })
      // UPDATE escrow_deposits
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await processCompletedAction(
      pool._client as any,
      makeRow('owner_resolve', DISPUTE_UUID),
      provider,
      contracts
    );

    expect(result.action).toBe('owner_resolve');
    expect(result.data?.clientWon).toBe(false);
    expect(result.data?.developerShare).toBe('2500.000000');
    expect(result.data?.clientShare).toBe('0');

    const updateDispute = pool._client.query.mock.calls[1];
    expect(updateDispute[1][0]).toBe('developer'); // winner
    expect(updateDispute[1][1]).toBe(true); // resolved_by_owner
    expect(updateDispute[1][2]).toBe('0'); // client_share
    expect(updateDispute[1][3]).toBe('2500.000000'); // developer_share

    const updateProject = pool._client.query.mock.calls[2];
    expect(updateProject[1][0]).toBe('completed'); // developer won → project completed
  });

  it('awards 100% remaining escrow to winner (client)', async () => {
    const pool = createMockPool();
    const disputeDAO = createMockDisputeDAOContract();
    const provider = makeProvider();
    const contracts = { projectManager: {} as any, disputeDAO: disputeDAO as any };

    disputeDAO.interface.parseLog.mockReturnValueOnce({
      name: 'DisputeResolvedByOwner',
      args: { clientWon: true },
    });

    pool._client.query
      .mockResolvedValueOnce({ rows: [{ remaining: '1234.500000' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ project_id: SAMPLE_PROJECT.id }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await processCompletedAction(
      pool._client as any,
      makeRow('owner_resolve', DISPUTE_UUID),
      provider,
      contracts
    );

    expect(result.data?.clientShare).toBe('1234.500000');
    expect(result.data?.developerShare).toBe('0');
    expect(pool._client.query.mock.calls[2][1][0]).toBe('cancelled');
  });
});
