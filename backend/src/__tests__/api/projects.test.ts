import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import { createMockPool } from '../helpers/mockPool';
import { createMockProjectManagerContract } from '../helpers/mockContract';
import {
  ADDRESSES,
  SAMPLE_PROJECT,
  SAMPLE_PROJECT_DRAFT,
  SAMPLE_MILESTONE,
  CLIENT_AUTH,
} from '../helpers/fixtures';

// ---- Mocks ----
jest.mock('../../utils/signature', () => ({
  verifySignature: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../services/matchingAlgorithm', () => ({
  assignDeveloperToProject: jest.fn().mockResolvedValue(null),
}));

import { verifySignature } from '../../utils/signature';
import { assignDeveloperToProject } from '../../services/matchingAlgorithm';
import projectsRouter, { initialize } from '../../api/routes/projects';

const mockPool = createMockPool();
const mockContract = createMockProjectManagerContract();
initialize(mockPool as any, mockContract as any);

const app = createTestApp();
app.use('/api/projects', projectsRouter);

beforeEach(() => {
  jest.clearAllMocks();
  (verifySignature as jest.Mock).mockReturnValue(true);
  (assignDeveloperToProject as jest.Mock).mockResolvedValue(null);
  mockContract._mockReceipt.logs = [{} as any]; // ensure at least one log
});

// =============================================================================
// POST /api/projects
// =============================================================================
describe('POST /api/projects', () => {
  const validBody = {
    ...CLIENT_AUTH,
    title: 'DeFi Dashboard',
    description: 'Build a DeFi analytics dashboard',
    requiredSkills: ['React', 'Solidity'],
    totalBudget: 5000,
    milestones: [
      { title: 'Phase 1', description: 'Setup', deliverables: ['Scaffold'], budget: 2000 },
      { title: 'Phase 2', description: 'Build', deliverables: ['Dashboard'], budget: 3000 },
    ],
  };

  it('creates a project and returns 201', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // ensure client exists
      .mockResolvedValueOnce({ rows: [] }) // update client counter
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] }) // INSERT project
      .mockResolvedValueOnce({ rows: [SAMPLE_MILESTONE] }) // INSERT milestone 1
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_MILESTONE, milestone_number: 2 }] }); // INSERT milestone 2

    const res = await request(app).post('/api/projects').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(SAMPLE_PROJECT.title);
    expect(res.body.milestones).toHaveLength(2);
  });

  it('returns 400 for missing title', async () => {
    const res = await request(app).post('/api/projects').send({ ...validBody, title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for missing description', async () => {
    const res = await request(app).post('/api/projects').send({ ...validBody, description: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty skills', async () => {
    const res = await request(app).post('/api/projects').send({ ...validBody, requiredSkills: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for budget under 100', async () => {
    const res = await request(app).post('/api/projects').send({ ...validBody, totalBudget: 50 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for no milestones', async () => {
    const res = await request(app).post('/api/projects').send({ ...validBody, milestones: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when milestone budgets don\'t sum to total', async () => {
    const body = {
      ...validBody,
      milestones: [
        { title: 'Phase 1', description: 'Setup', deliverables: ['Scaffold'], budget: 1000 },
      ],
    };
    const res = await request(app).post('/api/projects').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).post('/api/projects').send(validBody);
    expect(res.status).toBe(401);
  });

  it('triggers auto-assignment after creation', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] })
      .mockResolvedValueOnce({ rows: [SAMPLE_MILESTONE] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_MILESTONE, milestone_number: 2 }] });

    await request(app).post('/api/projects').send(validBody);
    expect(assignDeveloperToProject).toHaveBeenCalled();
  });
});

// =============================================================================
// GET /api/projects/:id
// =============================================================================
describe('GET /api/projects/:id', () => {
  it('returns public project view', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] }) // project
      .mockResolvedValueOnce({ rows: [SAMPLE_MILESTONE] }) // milestones
      .mockResolvedValueOnce({ rows: [{ wallet_address: ADDRESSES.developer1, github_username: 'dev', skills: ['Solidity'] }] }); // dev info

    const res = await request(app).get(`/api/projects/${SAMPLE_PROJECT.id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(SAMPLE_PROJECT.title);
    // Public view should not include full milestones
    expect(res.body.milestones).toBeUndefined();
    expect(res.body.milestonesTotal).toBeDefined();
  });

  it('returns full view for project owner', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] })
      .mockResolvedValueOnce({ rows: [SAMPLE_MILESTONE] })
      .mockResolvedValueOnce({ rows: [] }); // dev info

    const res = await request(app)
      .get(`/api/projects/${SAMPLE_PROJECT.id}`)
      .set('x-wallet-address', ADDRESSES.client1);
    expect(res.status).toBe(200);
    expect(res.body.milestones).toBeDefined();
    expect(res.body.clientAddress).toBeDefined();
  });

  it('returns full view for assigned developer', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] })
      .mockResolvedValueOnce({ rows: [SAMPLE_MILESTONE] })
      .mockResolvedValueOnce({ rows: [{ wallet_address: ADDRESSES.developer1, github_username: 'dev', skills: ['Solidity'], email: 'dev@test.com' }] });

    const res = await request(app)
      .get(`/api/projects/${SAMPLE_PROJECT.id}`)
      .set('x-wallet-address', ADDRESSES.developer1);
    expect(res.status).toBe(200);
    expect(res.body.milestones).toBeDefined();
  });

  it('returns 404 when project not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/projects/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// =============================================================================
// PUT /api/projects/:id
// =============================================================================
describe('PUT /api/projects/:id', () => {
  const updateBody = {
    ...CLIENT_AUTH,
    title: 'Updated Title',
  };

  it('updates draft project', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT_DRAFT] }) // fetch
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app).put(`/api/projects/${SAMPLE_PROJECT_DRAFT.id}`).send(updateBody);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  it('returns 400 for missing auth fields', async () => {
    const res = await request(app).put(`/api/projects/${SAMPLE_PROJECT_DRAFT.id}`).send({ title: 'X' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).put(`/api/projects/${SAMPLE_PROJECT_DRAFT.id}`).send(updateBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/projects/nonexistent').send(updateBody);
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-owner', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_PROJECT_DRAFT, client_address: ADDRESSES.client2 }],
    });

    const res = await request(app).put(`/api/projects/${SAMPLE_PROJECT_DRAFT.id}`).send(updateBody);
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-draft project', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] }); // status: 'active'

    const res = await request(app).put(`/api/projects/${SAMPLE_PROJECT.id}`).send(updateBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 when no fields to update', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_PROJECT_DRAFT] });

    const res = await request(app)
      .put(`/api/projects/${SAMPLE_PROJECT_DRAFT.id}`)
      .send(CLIENT_AUTH);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No fields');
  });
});

// =============================================================================
// GET /api/projects (list)
// =============================================================================
describe('GET /api/projects', () => {
  it('returns paginated list', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: '1', project_number: 1, title: 'A', required_skills: [], total_budget: '1000', status: 'active', assigned_developer: null, created_at: new Date() },
          { id: '2', project_number: 2, title: 'B', required_skills: [], total_budget: '2000', status: 'draft', assigned_developer: null, created_at: new Date() },
        ],
      });

    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('filters by status', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] });

    const res = await request(app).get('/api/projects?status=active');
    expect(res.status).toBe(200);
  });

  it('filters by clientAddress', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] });

    const res = await request(app).get(`/api/projects?clientAddress=${ADDRESSES.client1}`);
    expect(res.status).toBe(200);
  });

  it('filters by developerAddress', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] });

    const res = await request(app).get(`/api/projects?developerAddress=${ADDRESSES.developer1}`);
    expect(res.status).toBe(200);
  });

  it('caps limit at 100', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/projects?limit=500');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(500);
  });
});
