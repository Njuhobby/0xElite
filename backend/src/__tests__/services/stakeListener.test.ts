import { ADDRESSES } from '../helpers/fixtures';

// Mock ALL external dependencies before importing the module
const mockQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };
const mockConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('../../config/database', () => ({
  pool: { query: mockQuery, connect: mockConnect, on: jest.fn() },
}));

jest.mock('../../config/eventSync', () => ({
  eventSyncConfig: {
    rpcUrl: 'http://localhost:8545',
    stakeVaultAddress: '0x' + '33'.repeat(20),
    startBlock: 0,
    batchSize: 1000,
    confirmations: 2,
    retryAttempts: 3,
    retryDelay: 100,
    alertOnErrorCount: 5,
    healthCheckInterval: 30000,
    pollingInterval: 12000,
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getBlockNumber: jest.fn().mockResolvedValue(100),
    })),
    Contract: jest.fn().mockImplementation(() => ({
      queryFilter: jest.fn().mockResolvedValue([]),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      filters: { Staked: jest.fn() },
    })),
    formatUnits: jest.fn((amount: bigint, _decimals: number) => {
      return (Number(amount) / 1e6).toString();
    }),
  },
}));

import { StakeEventListener } from '../../services/eventListeners/stakeListener';

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
});

// =============================================================================
// StakeEventListener
// =============================================================================
describe('StakeEventListener', () => {
  it('constructs without errors', () => {
    const listener = new StakeEventListener();
    expect(listener).toBeDefined();
  });

  it('initializes by loading checkpoint from DB', async () => {
    const listener = new StakeEventListener();
    mockQuery.mockResolvedValueOnce({
      rows: [{ value: '42' }],
    });

    await listener.initialize();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('system_state'),
      expect.any(Array)
    );
  });

  it('uses default startBlock when no checkpoint', async () => {
    const listener = new StakeEventListener();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listener.initialize();
    // Should not throw
  });

  it('stops cleanly', async () => {
    const listener = new StakeEventListener();
    await listener.stop();
    // contract.removeAllListeners was called
  });

  it('healthCheck returns status', async () => {
    const listener = new StakeEventListener();
    const health = await listener.healthCheck();
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('lastBlock');
    expect(health).toHaveProperty('lag');
  });

  it('processStakedEvent updates developer in DB', async () => {
    const listener = new StakeEventListener();

    const mockEvent = {
      args: {
        developer: ADDRESSES.developer1,
        amount: BigInt(1000_000000),
      },
      blockNumber: 50,
      transactionHash: '0x' + 'aa'.repeat(32),
    };

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ wallet_address: ADDRESSES.developer1, email: 'dev@test.com' }],
      }) // UPDATE developer
      .mockResolvedValueOnce({}); // COMMIT

    await (listener as any).processStakedEvent(mockEvent);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

    // Verify status is set to 'staked' (not 'active') pending admin approval
    const updateCall = mockClient.query.mock.calls[1];
    expect(updateCall[0]).toContain("status = 'staked'");
  });

  it('processStakedEvent rolls back when developer not found', async () => {
    const listener = new StakeEventListener();

    const mockEvent = {
      args: {
        developer: ADDRESSES.random,
        amount: BigInt(1000_000000),
      },
    };

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no developer found
      .mockResolvedValueOnce({}); // ROLLBACK

    await (listener as any).processStakedEvent(mockEvent);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('saveCheckpoint upserts to system_state', async () => {
    const listener = new StakeEventListener();
    mockQuery.mockResolvedValueOnce({});

    await (listener as any).saveCheckpoint(75);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system_state'),
      expect.arrayContaining(['last_processed_block_stake_vault', '75'])
    );
  });
});
