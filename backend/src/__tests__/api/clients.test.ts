import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import { createMockPool } from '../helpers/mockPool';
import { ADDRESSES, SAMPLE_CLIENT, CLIENT_AUTH } from '../helpers/fixtures';

// ---- Mocks ----
jest.mock('../../utils/signature', () => ({
  verifySignature: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { verifySignature } from '../../utils/signature';
import clientsRouter, { initialize } from '../../api/routes/clients';

const mockPool = createMockPool();
initialize(mockPool as any);

const app = createTestApp();
app.use('/api/clients', clientsRouter);

beforeEach(() => {
  jest.clearAllMocks();
  (verifySignature as jest.Mock).mockReturnValue(true);
});

// =============================================================================
// POST /api/clients
// =============================================================================
describe('POST /api/clients', () => {
  const validBody = {
    ...CLIENT_AUTH,
    email: 'client@example.com',
    companyName: 'Acme Corp',
  };

  it('creates a client and returns 201', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] }) // email check
      .mockResolvedValueOnce({ rows: [SAMPLE_CLIENT] }); // upsert

    const res = await request(app).post('/api/clients').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.walletAddress).toBe(SAMPLE_CLIENT.wallet_address);
  });

  it('returns 400 when address/message/signature missing', async () => {
    const res = await request(app).post('/api/clients').send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).post('/api/clients').send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
  });

  it('returns 400 for duplicate email', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ wallet_address: ADDRESSES.client2 }],
    });

    const res = await request(app).post('/api/clients').send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EMAIL_IN_USE');
  });

  it('creates client without email (no email check)', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_CLIENT] });

    const res = await request(app)
      .post('/api/clients')
      .send({ ...CLIENT_AUTH });
    expect(res.status).toBe(201);
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).post('/api/clients').send(validBody);
    expect(res.status).toBe(500);
  });
});

// =============================================================================
// GET /api/clients/:address
// =============================================================================
describe('GET /api/clients/:address', () => {
  it('returns client profile', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_CLIENT] });

    const res = await request(app).get(`/api/clients/${ADDRESSES.client1}`);
    expect(res.status).toBe(200);
    expect(res.body.walletAddress).toBe(SAMPLE_CLIENT.wallet_address);
  });

  it('returns 404 when client not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/clients/${ADDRESSES.random}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('includes email for owner', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_CLIENT] });

    const res = await request(app)
      .get(`/api/clients/${ADDRESSES.client1}`)
      .set('x-wallet-address', ADDRESSES.client1);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(SAMPLE_CLIENT.email);
    expect(res.body.isRegistered).toBe(SAMPLE_CLIENT.is_registered);
  });

  it('omits email for non-owner', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_CLIENT] });

    const res = await request(app)
      .get(`/api/clients/${ADDRESSES.client1}`)
      .set('x-wallet-address', ADDRESSES.random);
    expect(res.status).toBe(200);
    expect(res.body.email).toBeUndefined();
    expect(res.body.isRegistered).toBeUndefined();
  });

  it('normalizes address to lowercase', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [SAMPLE_CLIENT] });
    const upper = ADDRESSES.client1.toUpperCase();

    await request(app).get(`/api/clients/${upper}`);
    expect(mockPool.query.mock.calls[0][1][0]).toBe(ADDRESSES.client1.toLowerCase());
  });

  it('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get(`/api/clients/${ADDRESSES.client1}`);
    expect(res.status).toBe(500);
  });
});
