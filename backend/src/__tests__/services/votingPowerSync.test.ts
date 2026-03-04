import { createMockPool } from '../helpers/mockPool';
import { createMockEliteTokenContract } from '../helpers/mockContract';
import { ADDRESSES } from '../helpers/fixtures';
import { VotingPowerSync } from '../../services/votingPowerSync';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock ethers.Contract constructor
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    Contract: jest.fn().mockImplementation(() => createMockEliteTokenContract()),
  };
});

const mockPool = createMockPool();
let mockEliteToken: ReturnType<typeof createMockEliteTokenContract>;
let service: VotingPowerSync;

beforeEach(() => {
  jest.clearAllMocks();
  mockEliteToken = createMockEliteTokenContract();

  // Create service — constructor will use mocked ethers.Contract
  service = new VotingPowerSync(mockPool as any, '0x' + '55'.repeat(20), {} as any);
  // Inject our mock token directly
  (service as any).eliteToken = mockEliteToken;
});

// =============================================================================
// syncDeveloper
// =============================================================================
describe('syncDeveloper', () => {
  it('mints tokens when voting power > on-chain balance', async () => {
    mockPool._client.query
      .mockResolvedValueOnce({
        rows: [{
          wallet_address: ADDRESSES.developer1,
          voting_power: '100.000000',
          elite_token_balance: '50.000000',
        }],
      })
      .mockResolvedValueOnce({}); // UPDATE

    mockEliteToken.balanceOf.mockResolvedValueOnce(BigInt(50_000_000)); // 50 tokens on-chain

    await service.syncDeveloper(ADDRESSES.developer1);
    expect(mockEliteToken.mint).toHaveBeenCalledWith(ADDRESSES.developer1, 50_000_000);
  });

  it('burns tokens when voting power < on-chain balance', async () => {
    mockPool._client.query
      .mockResolvedValueOnce({
        rows: [{
          wallet_address: ADDRESSES.developer1,
          voting_power: '50.000000',
          elite_token_balance: '100.000000',
        }],
      })
      .mockResolvedValueOnce({}); // UPDATE

    mockEliteToken.balanceOf.mockResolvedValueOnce(BigInt(100_000_000)); // 100 tokens on-chain

    await service.syncDeveloper(ADDRESSES.developer1);
    expect(mockEliteToken.burn).toHaveBeenCalledWith(ADDRESSES.developer1, 50_000_000);
  });

  it('does nothing when already in sync', async () => {
    mockPool._client.query.mockResolvedValueOnce({
      rows: [{
        wallet_address: ADDRESSES.developer1,
        voting_power: '100.000000',
        elite_token_balance: '100.000000',
      }],
    });

    mockEliteToken.balanceOf.mockResolvedValueOnce(BigInt(100_000_000));

    await service.syncDeveloper(ADDRESSES.developer1);
    expect(mockEliteToken.mint).not.toHaveBeenCalled();
    expect(mockEliteToken.burn).not.toHaveBeenCalled();
  });

  it('does nothing for nonexistent developer', async () => {
    mockPool._client.query.mockResolvedValueOnce({ rows: [] });

    await service.syncDeveloper('0x' + '00'.repeat(20));
    expect(mockEliteToken.mint).not.toHaveBeenCalled();
    expect(mockEliteToken.burn).not.toHaveBeenCalled();
  });

  it('throws on contract error', async () => {
    mockPool._client.query.mockResolvedValueOnce({
      rows: [{
        wallet_address: ADDRESSES.developer1,
        voting_power: '100.000000',
        elite_token_balance: '50.000000',
      }],
    });

    mockEliteToken.balanceOf.mockResolvedValueOnce(BigInt(50_000_000));
    mockEliteToken.mint.mockRejectedValueOnce(new Error('TX reverted'));

    await expect(service.syncDeveloper(ADDRESSES.developer1)).rejects.toThrow('TX reverted');
  });
});

// =============================================================================
// syncAll
// =============================================================================
describe('syncAll', () => {
  it('syncs all out-of-sync developers', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { wallet_address: ADDRESSES.developer1 },
        { wallet_address: ADDRESSES.developer2 },
      ],
    });

    // For each syncDeveloper call
    mockPool._client.query
      .mockResolvedValueOnce({
        rows: [{
          wallet_address: ADDRESSES.developer1,
          voting_power: '100.000000',
          elite_token_balance: '100.000000',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          wallet_address: ADDRESSES.developer2,
          voting_power: '50.000000',
          elite_token_balance: '50.000000',
        }],
      });

    mockEliteToken.balanceOf
      .mockResolvedValueOnce(BigInt(100_000_000))
      .mockResolvedValueOnce(BigInt(50_000_000));

    const synced = await service.syncAll();
    expect(synced).toBe(2);
  });

  it('continues on individual sync failure', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { wallet_address: ADDRESSES.developer1 },
        { wallet_address: ADDRESSES.developer2 },
      ],
    });

    // First dev fails
    mockPool._client.query.mockRejectedValueOnce(new Error('DB error'));

    // Second dev succeeds
    mockPool._client.query.mockResolvedValueOnce({
      rows: [{
        wallet_address: ADDRESSES.developer2,
        voting_power: '50.000000',
        elite_token_balance: '50.000000',
      }],
    });

    mockEliteToken.balanceOf.mockResolvedValueOnce(BigInt(50_000_000));

    const synced = await service.syncAll();
    expect(synced).toBe(1); // only 1 succeeded
  });

  it('returns 0 when no devs need syncing', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const synced = await service.syncAll();
    expect(synced).toBe(0);
  });
});
