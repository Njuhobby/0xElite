import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import { createMockPool } from '../helpers/mockPool';
import { createMockProjectManagerContract, createMockEscrowVaultContract } from '../helpers/mockContract';
import {
  ADDRESSES,
  SAMPLE_PROJECT,
  SAMPLE_PROJECT_DRAFT,
  SAMPLE_MILESTONE,
  CLIENT_AUTH,
  VALID_AUTH,
} from '../helpers/fixtures';

// ---- Mocks ----
jest.mock('../../utils/signature', () => ({
  verifySignature: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { verifySignature } from '../../utils/signature';
import milestonesRouter, { initialize } from '../../api/routes/milestones';

const mockPool = createMockPool();
const mockPMContract = createMockProjectManagerContract();
const mockEscrowContract = createMockEscrowVaultContract();
initialize(mockPool as any, mockPMContract as any, mockEscrowContract as any);

const app = createTestApp();
app.use('/api/milestones', milestonesRouter);

beforeEach(() => {
  jest.clearAllMocks();
  (verifySignature as jest.Mock).mockReturnValue(true);
});

// =============================================================================
// POST /api/milestones/:projectId/milestones
// =============================================================================
describe('POST /api/milestones/:projectId/milestones', () => {
  const validBody = {
    ...CLIENT_AUTH,
    title: 'New Milestone',
    description: 'Do the thing',
    deliverables: ['Deliverable 1'],
    budget: 1000,
  };

  it('creates a milestone and returns 201', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_PROJECT_DRAFT] }) // project fetch
      .mockResolvedValueOnce({ rows: [{ total: '2000' }] }) // current budget sum
      .mockResolvedValueOnce({ rows: [{ max: 1 }] }) // next milestone number
      .mockResolvedValueOnce({ rows: [SAMPLE_MILESTONE] }); // INSERT

    const res = await request(app)
      .post(`/api/milestones/${SAMPLE_PROJECT_DRAFT.id}/milestones`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(SAMPLE_MILESTONE.title);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post(`/api/milestones/${SAMPLE_PROJECT_DRAFT.id}/milestones`)
      .send({ ...CLIENT_AUTH });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing auth', async () => {
    const res = await request(app)
      .post(`/api/milestones/${SAMPLE_PROJECT_DRAFT.id}/milestones`)
      .send({ title: 'X', description: 'Y', deliverables: ['Z'], budget: 100 });
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app)
      .post(`/api/milestones/${SAMPLE_PROJECT_DRAFT.id}/milestones`)
      .send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/milestones/nonexistent/milestones')
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-owner', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_PROJECT_DRAFT, client_address: ADDRESSES.client2 }],
    });

    const res = await request(app)
      .post(`/api/milestones/${SAMPLE_PROJECT_DRAFT.id}/milestones`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 403 for non-draft project', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_PROJECT] }); // status: active

    const res = await request(app)
      .post(`/api/milestones/${SAMPLE_PROJECT.id}/milestones`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 when budget exceeded', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_PROJECT_DRAFT, total_budget: '2000.00' }] })
      .mockResolvedValueOnce({ rows: [{ total: '1500' }] });

    const res = await request(app)
      .post(`/api/milestones/${SAMPLE_PROJECT_DRAFT.id}/milestones`)
      .send(validBody); // budget: 1000, would total 2500 > 2000
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BUDGET_EXCEEDED');
  });
});

// =============================================================================
// PUT /api/milestones/:id
// =============================================================================
describe('PUT /api/milestones/:id', () => {
  const startBody = {
    ...VALID_AUTH,
    status: 'in_progress',
  };

  it('transitions milestone to in_progress', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ ...SAMPLE_MILESTONE, status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app).put('/api/milestones/ms-uuid-001').send(startBody);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });

  it('returns 400 for missing auth', async () => {
    const res = await request(app).put('/api/milestones/ms-uuid-001').send({ status: 'in_progress' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).put('/api/milestones/ms-uuid-001').send(startBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when milestone not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/milestones/nonexistent').send(startBody);
    expect(res.status).toBe(404);
  });

  it('returns 403 for unauthorized user', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        ...SAMPLE_MILESTONE,
        client_address: ADDRESSES.client2,
        assigned_developer: ADDRESSES.developer2,
      }],
    });

    const res = await request(app).put('/api/milestones/ms-uuid-001').send(startBody);
    expect(res.status).toBe(403);
  });

  it('returns 403 for invalid status transition', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_MILESTONE, status: 'completed' }],
    });

    const res = await request(app).put('/api/milestones/ms-uuid-001').send(startBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INVALID_TRANSITION');
  });

  it('requires deliverable URLs for pending_review', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_MILESTONE, status: 'in_progress' }],
    });

    const res = await request(app)
      .put('/api/milestones/ms-uuid-001')
      .send({ ...VALID_AUTH, status: 'pending_review' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Deliverable URLs');
  });

  it('submits for review with deliverable URLs', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_MILESTONE, status: 'in_progress' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const res = await request(app)
      .put('/api/milestones/ms-uuid-001')
      .send({
        ...VALID_AUTH,
        status: 'pending_review',
        deliverableUrls: ['https://github.com/repo/pr/1'],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_review');
  });

  it('completes milestone with payment release', async () => {
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          ...SAMPLE_MILESTONE,
          status: 'pending_review',
          budget: '2000.00',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ projects_completed: 0 }] }) // client tier
      .mockResolvedValueOnce({ rows: [{ contract_project_id: '1' }] }) // contract id
      .mockResolvedValueOnce({ rows: [] }) // UPDATE milestone
      .mockResolvedValueOnce({ rows: [{ total: '2', completed: '2' }] }) // all completed check
      .mockResolvedValueOnce({ rows: [] }) // UPDATE project
      .mockResolvedValueOnce({ rows: [{ contract_project_id: '1' }] }) // project contract id
      .mockResolvedValueOnce({ rows: [] }) // UPDATE developer stats
      .mockResolvedValueOnce({ rows: [] }); // UPDATE client stats

    const res = await request(app)
      .put('/api/milestones/ms-uuid-001')
      .send({ ...CLIENT_AUTH, status: 'completed', reviewNotes: 'LGTM' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(mockEscrowContract.release).toHaveBeenCalled();
  });

  it('returns 403 for developer trying to complete', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_MILESTONE, status: 'pending_review' }],
    });

    const res = await request(app)
      .put('/api/milestones/ms-uuid-001')
      .send({ ...VALID_AUTH, status: 'completed' });
    expect(res.status).toBe(403);
  });
});
