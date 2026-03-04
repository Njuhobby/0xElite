import { createMockPool } from '../helpers/mockPool';
import { createMockProjectManagerContract } from '../helpers/mockContract';
import { ADDRESSES, SAMPLE_DEVELOPER, SAMPLE_DEVELOPER_2 } from '../helpers/fixtures';
import {
  assignDeveloperToProject,
  processPendingQueue,
  getMatchScoreForDeveloper,
} from '../../services/matchingAlgorithm';

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockPool = createMockPool();
const mockContract = createMockProjectManagerContract();

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// assignDeveloperToProject
// =============================================================================
describe('assignDeveloperToProject', () => {
  const projectRow = {
    id: 'proj-1',
    required_skills: ['Solidity', 'React'],
    total_budget: '5000',
    contract_project_id: '1',
  };

  const devRow1 = {
    wallet_address: ADDRESSES.developer1,
    skills: ['Solidity', 'React', 'Node.js'],
    average_rating: 4.5,
    last_assignment_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
  };

  const devRow2 = {
    wallet_address: ADDRESSES.developer2,
    skills: ['Solidity', 'Rust'],
    average_rating: 3.0,
    last_assignment_at: null,
  };

  it('assigns best matching developer', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [projectRow] }) // project lookup
      .mockResolvedValueOnce({ rows: [devRow1, devRow2] }); // available developers

    // For the assignment transaction
    mockPool._client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // UPDATE projects
      .mockResolvedValueOnce({}) // UPDATE developers
      .mockResolvedValueOnce({}); // COMMIT

    const result = await assignDeveloperToProject(mockPool as any, mockContract as any, 'proj-1');
    expect(result).toBe(ADDRESSES.developer1); // higher skill overlap
    expect(mockContract.assignDeveloper).toHaveBeenCalled();
  });

  it('returns null when no available developers', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [] }); // no available devs

    const result = await assignDeveloperToProject(mockPool as any, mockContract as any, 'proj-1');
    expect(result).toBeNull();
  });

  it('returns null when no developers meet skill threshold', async () => {
    const lowSkillDev = {
      wallet_address: ADDRESSES.developer2,
      skills: ['Python'], // no overlap with Solidity, React
      average_rating: 5.0,
      last_assignment_at: null,
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [lowSkillDev] });

    const result = await assignDeveloperToProject(mockPool as any, mockContract as any, 'proj-1');
    expect(result).toBeNull();
  });

  it('throws when project not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      assignDeveloperToProject(mockPool as any, mockContract as any, 'nonexistent')
    ).rejects.toThrow('not found');
  });

  it('prefers developer with 100% skill match over partial match', async () => {
    const perfectMatch = {
      wallet_address: ADDRESSES.developer2,
      skills: ['Solidity', 'React'],
      average_rating: 3.0,
      last_assignment_at: new Date(), // just assigned
    };

    // devRow1 has 100% overlap (Solidity, React) but also has extra skills
    // perfectMatch also has 100% overlap
    mockPool.query
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [devRow1, perfectMatch] });

    mockPool._client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await assignDeveloperToProject(mockPool as any, mockContract as any, 'proj-1');
    // devRow1 should win due to higher rating and idle bonus
    expect(result).toBe(ADDRESSES.developer1);
  });

  it('gives idle bonus to never-assigned developers', async () => {
    const neverAssigned = {
      wallet_address: ADDRESSES.developer2,
      skills: ['Solidity', 'React'],
      average_rating: 4.5, // same rating
      last_assignment_at: null, // never assigned → max idle bonus
    };

    const recentlyAssigned = {
      wallet_address: ADDRESSES.developer1,
      skills: ['Solidity', 'React'],
      average_rating: 4.5,
      last_assignment_at: new Date(), // just assigned → 0 idle bonus
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [recentlyAssigned, neverAssigned] });

    mockPool._client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const result = await assignDeveloperToProject(mockPool as any, mockContract as any, 'proj-1');
    expect(result).toBe(ADDRESSES.developer2); // should win due to idle bonus
  });

  it('rolls back on blockchain error', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [projectRow] })
      .mockResolvedValueOnce({ rows: [devRow1] });

    mockPool._client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // UPDATE projects
      .mockResolvedValueOnce({}); // UPDATE developers

    mockContract.assignDeveloper.mockRejectedValueOnce(new Error('TX reverted'));

    mockPool._client.query.mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      assignDeveloperToProject(mockPool as any, mockContract as any, 'proj-1')
    ).rejects.toThrow('TX reverted');
  });
});

// =============================================================================
// processPendingQueue
// =============================================================================
describe('processPendingQueue', () => {
  it('processes pending projects', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'proj-1', required_skills: ['Solidity'] }],
    });

    // For assignDeveloperToProject call
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'proj-1', required_skills: ['Solidity'], total_budget: '1000', contract_project_id: '1' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // no available developers

    await processPendingQueue(mockPool as any, mockContract as any);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('does nothing when no pending projects', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await processPendingQueue(mockPool as any, mockContract as any);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// getMatchScoreForDeveloper
// =============================================================================
describe('getMatchScoreForDeveloper', () => {
  it('returns score for valid developer and project', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'proj-1', required_skills: ['Solidity', 'React'], total_budget: '5000' }],
      })
      .mockResolvedValueOnce({
        rows: [{
          wallet_address: ADDRESSES.developer1,
          skills: ['Solidity', 'React', 'Node.js'],
          average_rating: 4.0,
          last_assignment_at: null,
        }],
      });

    const result = await getMatchScoreForDeveloper(mockPool as any, 'proj-1', ADDRESSES.developer1);
    expect(result).not.toBeNull();
    expect(result!.skillOverlap).toBe(100);
    expect(result!.availabilityBonus).toBe(20); // never assigned
    expect(result!.score).toBeGreaterThan(0);
  });

  it('returns null for nonexistent project', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await getMatchScoreForDeveloper(mockPool as any, 'nonexistent', ADDRESSES.developer1);
    expect(result).toBeNull();
  });

  it('returns null for nonexistent developer', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'proj-1', required_skills: ['Solidity'], total_budget: '1000' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await getMatchScoreForDeveloper(mockPool as any, 'proj-1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('calculates partial skill overlap correctly', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'proj-1', required_skills: ['Solidity', 'React', 'Rust', 'Go'], total_budget: '5000' }],
      })
      .mockResolvedValueOnce({
        rows: [{
          wallet_address: ADDRESSES.developer1,
          skills: ['Solidity', 'React'],
          average_rating: null,
          last_assignment_at: null,
        }],
      });

    const result = await getMatchScoreForDeveloper(mockPool as any, 'proj-1', ADDRESSES.developer1);
    expect(result).not.toBeNull();
    expect(result!.skillOverlap).toBe(50); // 2 of 4
    expect(result!.reputationBonus).toBe(5); // neutral for new developer
  });
});
