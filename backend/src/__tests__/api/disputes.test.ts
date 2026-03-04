import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import {
  ADDRESSES,
  SAMPLE_PROJECT,
  SAMPLE_DISPUTE,
  SAMPLE_DISPUTE_VOTE,
  CLIENT_AUTH,
  VALID_AUTH,
} from '../helpers/fixtures';

// ---- Mocks ----
const mockQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };
const mockConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('../../config/database', () => ({
  pool: { query: mockQuery, connect: mockConnect, on: jest.fn() },
}));

jest.mock('../../utils/signature', () => ({
  verifySignature: jest.fn().mockReturnValue(true),
}));

import { verifySignature } from '../../utils/signature';
import disputesRouter from '../../api/routes/disputes';

const app = createTestApp();
app.use('/api/disputes', disputesRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  (verifySignature as jest.Mock).mockReturnValue(true);
});

// =============================================================================
// POST /api/disputes
// =============================================================================
describe('POST /api/disputes', () => {
  const validBody = {
    ...CLIENT_AUTH,
    projectId: SAMPLE_PROJECT.id,
    evidenceUri: 'ipfs://evidence-hash',
  };

  it('creates a dispute and returns 201', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: SAMPLE_PROJECT.id,
          client_address: ADDRESSES.client1,
          assigned_developer: ADDRESSES.developer1,
          status: 'active',
        }],
      }) // project
      .mockResolvedValueOnce({ rows: [] }) // no existing dispute
      .mockResolvedValueOnce({ rows: [SAMPLE_DISPUTE] }); // INSERT

    const res = await request(app).post('/api/disputes').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SAMPLE_DISPUTE.id);
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/disputes').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).post('/api/disputes').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/disputes').send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not client or developer', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: SAMPLE_PROJECT.id,
        client_address: ADDRESSES.client2,
        assigned_developer: ADDRESSES.developer2,
        status: 'active',
      }],
    });

    const res = await request(app).post('/api/disputes').send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 422 when project not active', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: SAMPLE_PROJECT.id,
        client_address: ADDRESSES.client1,
        assigned_developer: ADDRESSES.developer1,
        status: 'draft',
      }],
    });

    const res = await request(app).post('/api/disputes').send(validBody);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_STATE');
  });

  it('returns 409 when dispute already exists', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: SAMPLE_PROJECT.id,
          client_address: ADDRESSES.client1,
          assigned_developer: ADDRESSES.developer1,
          status: 'active',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-dispute' }] });

    const res = await request(app).post('/api/disputes').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DISPUTE_ALREADY_EXISTS');
  });

  it('allows developer to file dispute', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: SAMPLE_PROJECT.id,
          client_address: ADDRESSES.client1,
          assigned_developer: ADDRESSES.developer1,
          status: 'active',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_DISPUTE, initiator_role: 'developer' }] });

    const res = await request(app).post('/api/disputes').send({
      ...VALID_AUTH,
      projectId: SAMPLE_PROJECT.id,
      evidenceUri: 'ipfs://dev-evidence',
    });
    expect(res.status).toBe(201);
  });
});

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
// PUT /api/disputes/:id/evidence
// =============================================================================
describe('PUT /api/disputes/:id/evidence', () => {
  const evidenceBody = {
    ...CLIENT_AUTH,
    evidenceUri: 'ipfs://updated-evidence',
  };

  it('updates evidence successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_DISPUTE] }) // fetch dispute
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_DISPUTE, client_evidence_uri: 'ipfs://updated-evidence' }] }); // update

    const res = await request(app).put('/api/disputes/disp-uuid-001/evidence').send(evidenceBody);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid address', async () => {
    const res = await request(app)
      .put('/api/disputes/disp-uuid-001/evidence')
      .send({ ...evidenceBody, address: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing evidence URI', async () => {
    const res = await request(app)
      .put('/api/disputes/disp-uuid-001/evidence')
      .send({ ...CLIENT_AUTH });
    expect(res.status).toBe(400);
  });

  it('returns 404 when dispute not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/disputes/nonexistent/evidence').send(evidenceBody);
    expect(res.status).toBe(404);
  });

  it('returns 422 when dispute not open', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_DISPUTE, status: 'voting' }] });

    const res = await request(app).put('/api/disputes/disp-uuid-001/evidence').send(evidenceBody);
    expect(res.status).toBe(422);
  });

  it('returns 422 when evidence period ended', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_DISPUTE, evidence_deadline: new Date(Date.now() - 1000) }],
    });

    const res = await request(app).put('/api/disputes/disp-uuid-001/evidence').send(evidenceBody);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('EVIDENCE_PERIOD_ENDED');
  });

  it('returns 403 for non-party', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        ...SAMPLE_DISPUTE,
        client_address: ADDRESSES.client2,
        developer_address: ADDRESSES.developer2,
      }],
    });

    const res = await request(app).put('/api/disputes/disp-uuid-001/evidence').send(evidenceBody);
    expect(res.status).toBe(403);
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
