import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import {
  ADDRESSES,
  ADMIN_AUTH,
  VALID_AUTH,
  SAMPLE_DEVELOPER_STAKED,
  SAMPLE_DEVELOPER,
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
import adminRouter from '../../api/routes/admin';

const app = createTestApp();
app.use('/api/admin', adminRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  (verifySignature as jest.Mock).mockReturnValue(true);
  process.env.ADMIN_ADDRESSES = ADDRESSES.admin;
});

// =============================================================================
// GET /api/admin/developers
// =============================================================================
describe('GET /api/admin/developers', () => {
  it('returns paginated list of staked developers', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // COUNT
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER_STAKED] }); // SELECT

    const res = await request(app).get('/api/admin/developers');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('staked');
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it('returns empty list when no staked developers', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/admin/developers');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('respects pagination parameters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/admin/developers?page=2&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 10, total: 50, totalPages: 5 });
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app).get('/api/admin/developers');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});

// =============================================================================
// PUT /api/admin/developers/:address/approve
// =============================================================================
describe('PUT /api/admin/developers/:address/approve', () => {
  const approveBody = { ...ADMIN_AUTH, notes: 'Good profile' };

  it('approves a staked developer successfully', async () => {
    const approvedDev = {
      ...SAMPLE_DEVELOPER_STAKED,
      status: 'active',
      reviewed_by: ADDRESSES.admin.toLowerCase(),
      reviewed_at: new Date(),
      admin_notes: 'Good profile',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER_STAKED] }) // SELECT
      .mockResolvedValueOnce({ rows: [approvedDev] }); // UPDATE

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/approve`)
      .send(approveBody);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Developer approved successfully');
    expect(res.body.developer.status).toBe('active');
  });

  it('approves without optional notes', async () => {
    const approvedDev = {
      ...SAMPLE_DEVELOPER_STAKED,
      status: 'active',
      reviewed_by: ADDRESSES.admin.toLowerCase(),
      reviewed_at: new Date(),
      admin_notes: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER_STAKED] })
      .mockResolvedValueOnce({ rows: [approvedDev] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/approve`)
      .send({ address: ADMIN_AUTH.address, message: ADMIN_AUTH.message, signature: ADMIN_AUTH.signature });

    expect(res.status).toBe(200);
    expect(res.body.developer.status).toBe('active');
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/approve`)
      .send(approveBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
  });

  it('returns 403 for non-admin wallet', async () => {
    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/approve`)
      .send({ ...VALID_AUTH, notes: 'Good profile' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 404 when developer not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.random}/approve`)
      .send(approveBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 422 when developer is not in staked status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_DEVELOPER, status: 'active' }] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/approve`)
      .send(approveBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_STATE');
  });

  it('returns 422 when developer is in pending status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_DEVELOPER, status: 'pending' }] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/approve`)
      .send(approveBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_STATE');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/approve`)
      .send(approveBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});

// =============================================================================
// PUT /api/admin/developers/:address/reject
// =============================================================================
describe('PUT /api/admin/developers/:address/reject', () => {
  const rejectBody = { ...ADMIN_AUTH, reason: 'Insufficient GitHub activity' };

  it('rejects a staked developer successfully', async () => {
    const rejectedDev = {
      ...SAMPLE_DEVELOPER_STAKED,
      status: 'rejected',
      reviewed_by: ADDRESSES.admin.toLowerCase(),
      reviewed_at: new Date(),
      admin_notes: 'Insufficient GitHub activity',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER_STAKED] })
      .mockResolvedValueOnce({ rows: [rejectedDev] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send(rejectBody);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Developer rejected');
    expect(res.body.developer.status).toBe('rejected');
    expect(res.body.developer.adminNotes).toBe('Insufficient GitHub activity');
  });

  it('returns 400 when reason is missing', async () => {
    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send({ ...ADMIN_AUTH });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('reason');
  });

  it('returns 400 when reason is empty string', async () => {
    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send({ ...ADMIN_AUTH, reason: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send(rejectBody);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
  });

  it('returns 403 for non-admin wallet', async () => {
    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send({ ...VALID_AUTH, reason: 'Bad profile' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 404 when developer not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.random}/reject`)
      .send(rejectBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 422 when developer is not in staked status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_DEVELOPER, status: 'active' }] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send(rejectBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_STATE');
  });

  it('returns 422 when developer is in rejected status', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...SAMPLE_DEVELOPER, status: 'rejected' }] });

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send(rejectBody);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('INVALID_STATE');
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    const res = await request(app)
      .put(`/api/admin/developers/${ADDRESSES.developer1}/reject`)
      .send(rejectBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});
