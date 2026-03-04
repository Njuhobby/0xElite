import { createMockPool } from '../helpers/mockPool';
import { EscrowEventListener } from '../../services/escrowEventListener';

// Mock ethers completely
jest.mock('ethers', () => ({
  ethers: {
    WebSocketProvider: jest.fn(),
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(100),
      destroy: jest.fn(),
    })),
    Contract: jest.fn().mockImplementation(() => ({
      queryFilter: jest.fn().mockResolvedValue([]),
      on: jest.fn(),
    })),
  },
}));

// Mock the ABI import
jest.mock('../../contracts/EscrowVault.json', () => ([]), { virtual: true });

const mockPool = createMockPool();

const config = {
  rpcUrl: 'http://localhost:8545',
  escrowVaultAddress: '0x' + '22'.repeat(20),
  startBlock: 0,
  pollInterval: 5000,
  batchSize: 1000,
  checkpointInterval: 500,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// Constructor
// =============================================================================
describe('EscrowEventListener constructor', () => {
  it('creates instance with HTTP provider', () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    expect(listener).toBeDefined();
  });

  it('creates instance with WebSocket provider', () => {
    const wsConfig = { ...config, rpcUrl: 'ws://localhost:8545' };
    const listener = new EscrowEventListener(mockPool as any, wsConfig);
    expect(listener).toBeDefined();
  });
});

// =============================================================================
// loadCheckpoint (private, tested through start)
// =============================================================================
describe('checkpoint management', () => {
  it('loads checkpoint from database', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);

    mockPool.query.mockResolvedValueOnce({
      rows: [{ value: JSON.stringify({ lastProcessedBlock: 50, lastProcessedTxIndex: 0, updatedAt: new Date().toISOString() }) }],
    });

    // Access private method via prototype
    const checkpoint = await (listener as any).loadCheckpoint();
    expect(checkpoint.lastProcessedBlock).toBe(50);
  });

  it('uses startBlock when no checkpoint exists', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);

    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const checkpoint = await (listener as any).loadCheckpoint();
    expect(checkpoint.lastProcessedBlock).toBe(0);
  });

  it('saves checkpoint to database', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);

    mockPool.query.mockResolvedValueOnce({}); // upsert

    await (listener as any).saveCheckpoint(75, 3);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system_state'),
      expect.any(Array)
    );
  });
});

// =============================================================================
// formatUSDC
// =============================================================================
describe('formatUSDC', () => {
  it('formats correctly', () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    expect((listener as any).formatUSDC(BigInt(5000000000))).toBe('5000.000000');
    expect((listener as any).formatUSDC(BigInt(1500000))).toBe('1.500000');
    expect((listener as any).formatUSDC(BigInt(0))).toBe('0.000000');
  });
});

// =============================================================================
// stop
// =============================================================================
describe('stop', () => {
  it('stops the listener', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    await listener.stop();
    expect((listener as any).isRunning).toBe(false);
  });
});

// =============================================================================
// processEvent routing
// =============================================================================
describe('processEvent', () => {
  it('routes Deposited events', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    const handleDeposited = jest.spyOn(listener as any, 'handleDeposited').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'Deposited' });
    expect(handleDeposited).toHaveBeenCalled();
  });

  it('routes Released events', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    const handleReleased = jest.spyOn(listener as any, 'handleReleased').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'Released' });
    expect(handleReleased).toHaveBeenCalled();
  });

  it('routes Frozen events', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    const handleFrozen = jest.spyOn(listener as any, 'handleFrozen').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'Frozen' });
    expect(handleFrozen).toHaveBeenCalled();
  });

  it('routes Unfrozen events', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    const handleUnfrozen = jest.spyOn(listener as any, 'handleUnfrozen').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'Unfrozen' });
    expect(handleUnfrozen).toHaveBeenCalled();
  });

  it('routes DisputeResolved events', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    const handler = jest.spyOn(listener as any, 'handleDisputeResolved').mockResolvedValue(undefined);

    await (listener as any).processEvent({ eventName: 'DisputeResolved' });
    expect(handler).toHaveBeenCalled();
  });

  it('handles unknown events gracefully', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);
    // Should not throw
    await expect((listener as any).processEvent({ eventName: 'UnknownEvent' })).resolves.toBeUndefined();
  });
});

// =============================================================================
// handleDeposited
// =============================================================================
describe('handleDeposited', () => {
  it('processes deposit event and updates database', async () => {
    const listener = new EscrowEventListener(mockPool as any, config);

    const event = {
      projectId: BigInt(1),
      client: '0x' + 'cc'.repeat(20),
      amount: BigInt(5000_000000),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
      transactionHash: '0x' + 'aa'.repeat(32),
      blockNumber: 100,
    };

    mockPool._client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'proj-1' }] }) // project lookup
      .mockResolvedValueOnce({}) // INSERT escrow_deposits
      .mockResolvedValueOnce({}) // UPDATE projects
      .mockResolvedValueOnce({}) // INSERT payment_history
      .mockResolvedValueOnce({}); // COMMIT

    await (listener as any).handleDeposited(event);
    expect(mockPool._client.query).toHaveBeenCalledWith('BEGIN');
    expect(mockPool._client.query).toHaveBeenCalledWith('COMMIT');
  });
});
