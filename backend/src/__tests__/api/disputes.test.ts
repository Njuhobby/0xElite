import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import {
  ADDRESSES,
  SAMPLE_PROJECT,
  SAMPLE_DISPUTE,
  SAMPLE_DISPUTE_VOTE,
} from '../helpers/fixtures';

// ---- Mocks ----
const mockQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };
const mockConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('../../config/database', () => ({
  pool: { query: mockQuery, connect: mockConnect, on: jest.fn() },
}));

import disputesRouter from '../../api/routes/disputes';

const app = createTestApp();
app.use('/api/disputes', disputesRouter);

beforeEach(() => {
  // Reset fully so mockResolvedValueOnce queues don't leak across tests
  mockQuery.mockReset();
  mockClient.query.mockReset();
  mockConnect.mockResolvedValue(mockClient);
});

// =============================================================================
// Dispute writes (create, evidence, vote, resolve) happen on-chain via
// DisputeDAO and are reconciled by the pendingTx pipeline; there are no
// signature-verified write endpoints on this router. See pendingTxActions.ts.
// =============================================================================

// =============================================================================
// GET /api/disputes/:id
// =============================================================================
describe('GET /api/disputes/:id', () => {
  it('returns dispute details', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_DISPUTE] });

    const res = await request(app).get('/api/disputes/disp-uuid-001');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SAMPLE_DISPUTE.id);
    expect(res.body.status).toBe('open');
  });

  it('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/disputes/nonexistent');
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// GET /api/disputes/project/:projectId
// =============================================================================
describe('GET /api/disputes/project/:projectId', () => {
  it('returns disputes for project', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_DISPUTE] });

    const res = await request(app).get(`/api/disputes/project/${SAMPLE_PROJECT.id}`);
    expect(res.status).toBe(200);
    expect(res.body.disputes).toHaveLength(1);
  });

  it('returns empty array when no disputes', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/disputes/project/no-disputes');
    expect(res.status).toBe(200);
    expect(res.body.disputes).toHaveLength(0);
  });
});

// =============================================================================
// GET /api/disputes/:id/votes
// =============================================================================
describe('GET /api/disputes/:id/votes', () => {
  it('returns dispute votes', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: SAMPLE_DISPUTE.id }] }) // dispute exists
      .mockResolvedValueOnce({ rows: [SAMPLE_DISPUTE_VOTE] });

    const res = await request(app).get('/api/disputes/disp-uuid-001/votes');
    expect(res.status).toBe(200);
    expect(res.body.votes).toHaveLength(1);
  });

  it('returns 404 when dispute not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/disputes/nonexistent/votes');
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// GET /api/disputes/active/list
// =============================================================================
describe('GET /api/disputes/active/list', () => {
  it('returns active disputes with pagination', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_DISPUTE, project_title: 'Test' }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app).get('/api/disputes/active/list');
    expect(res.status).toBe(200);
    expect(res.body.disputes).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });
});

// =============================================================================
// GET /api/disputes/my/:address
// =============================================================================
describe('GET /api/disputes/my/:address', () => {
  it('returns disputes for an address', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_DISPUTE] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app).get(`/api/disputes/my/${ADDRESSES.client1}`);
    expect(res.status).toBe(200);
    expect(res.body.disputes).toHaveLength(1);
  });
});
