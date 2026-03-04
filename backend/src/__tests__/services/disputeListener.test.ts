import { createMockPool } from '../helpers/mockPool';
import { ADDRESSES } from '../helpers/fixtures';

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../config/eventSync', () => ({
  eventSyncConfig: {
    rpcUrl: 'http://localhost:8545',
    disputeDAOAddress: '0x' + '44'.repeat(20),
    startBlock: 0,
    batchSize: 1000,
    pollingInterval: 12000,
    retryDelay: 100,
    alertOnErrorCount: 5,
  },
}));

const mockQueryFilter = jest.fn().mockResolvedValue([]);
const mockGetDisputeCore = jest.fn();
const mockGetDisputeTimeline = jest.fn();
const mockGetDisputeVoting = jest.fn();

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(100),
    })),
    Contract: jest.fn().mockImplementation(() => ({
      queryFilter: mockQueryFilter,
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      getDisputeCore: mockGetDisputeCore,
      getDisputeTimeline: mockGetDisputeTimeline,
      getDisputeVoting: mockGetDisputeVoting,
    })),
  },
}));

// Set env var before importing
process.env.DISPUTE_DAO_ADDRESS = '0x' + '44'.repeat(20);

import { DisputeEventListener } from '../../services/eventListeners/disputeListener';

const mockPool = createMockPool();

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// DisputeEventListener
// =============================================================================
describe('DisputeEventListener', () => {
  it('constructs with valid config', () => {
    const listener = new DisputeEventListener(mockPool as any);
    expect(listener).toBeDefined();
  });

  it('initializes by loading checkpoint', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ value: JSON.stringify({ lastProcessedBlock: 50 }) }],
    });

    await listener.initialize();
    // Should load checkpoint
  });

  it('uses start block when no checkpoint', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await listener.initialize();
  });

  it('stops cleanly', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    await listener.stop();
    expect((listener as any).isRunning).toBe(false);
  });

  it('healthCheck returns status', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    const health = await listener.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.consecutiveErrors).toBe(0);
  });
});

// =============================================================================
// processEvent routing
// =============================================================================
describe('processEvent', () => {
  it('routes DisputeCreated events', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    const handler = jest.spyOn(listener as any, 'handleDisputeCreated').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'DisputeCreated', args: [] });
    expect(handler).toHaveBeenCalled();
  });

  it('routes VoteCast events', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    const handler = jest.spyOn(listener as any, 'handleVoteCast').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'VoteCast', args: [] });
    expect(handler).toHaveBeenCalled();
  });

  it('routes DisputeResolved events', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    const handler = jest.spyOn(listener as any, 'handleDisputeResolved').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'DisputeResolved', args: [] });
    expect(handler).toHaveBeenCalled();
  });

  it('routes DisputeResolvedByOwner events', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    const handler = jest.spyOn(listener as any, 'handleDisputeResolvedByOwner').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'DisputeResolvedByOwner', args: [] });
    expect(handler).toHaveBeenCalled();
  });

  it('ignores events without name', async () => {
    const listener = new DisputeEventListener(mockPool as any);
    await expect((listener as any).processEvent({ eventName: null })).resolves.toBeUndefined();
  });
});

// =============================================================================
// handleDisputeResolved
// =============================================================================
describe('handleDisputeResolved', () => {
  it('updates dispute to resolved status', async () => {
    const listener = new DisputeEventListener(mockPool as any);

    const event = {
      eventName: 'DisputeResolved',
      args: [
        BigInt(1),      // disputeId
        true,           // clientWon
        BigInt(3000_000000), // clientShare
        BigInt(2000_000000), // developerShare
      ],
      transactionHash: '0x' + 'ab'.repeat(32),
    };

    mockPool.query.mockResolvedValueOnce({}); // UPDATE disputes

    await (listener as any).handleDisputeResolved(event);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'resolved'"),
      expect.arrayContaining(['client'])
    );
  });
});

// =============================================================================
// handleDisputeResolvedByOwner
// =============================================================================
describe('handleDisputeResolvedByOwner', () => {
  it('marks dispute as resolved by owner', async () => {
    const listener = new DisputeEventListener(mockPool as any);

    const event = {
      eventName: 'DisputeResolvedByOwner',
      args: [
        BigInt(1),  // disputeId
        false,      // clientWon = false → developer wins
      ],
      transactionHash: '0x' + 'cd'.repeat(32),
    };

    mockPool.query.mockResolvedValueOnce({});

    await (listener as any).handleDisputeResolvedByOwner(event);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('resolved_by_owner = true'),
      expect.arrayContaining(['developer'])
    );
  });
});
