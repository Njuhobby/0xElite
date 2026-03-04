import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import { ADDRESSES, SAMPLE_DEVELOPER, VALID_AUTH } from '../helpers/fixtures';

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
import developersRouter from '../../api/routes/developers';

const app = createTestApp();
app.use('/api/developers', developersRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  (verifySignature as jest.Mock).mockReturnValue(true);
});

// =============================================================================
// POST /api/developers
// =============================================================================
describe('POST /api/developers', () => {
  const validBody = {
    ...VALID_AUTH,
    email: 'new@example.com',
    skills: ['Solidity'],
  };

  it('creates a developer and returns 201', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing dev
      .mockResolvedValueOnce({ rows: [] }) // no existing email
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] }); // INSERT

    const res = await request(app).post('/api/developers').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.walletAddress).toBe(SAMPLE_DEVELOPER.wallet_address);
  });

  it('returns 400 for invalid input', async () => {
    const res = await request(app).post('/api/developers').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).post('/api/developers').send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
  });

  it('returns 409 for duplicate wallet address', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ wallet_address: ADDRESSES.developer1 }] });

    const res = await request(app).post('/api/developers').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('wallet address');
  });

  it('returns 409 for duplicate email', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing dev
      .mockResolvedValueOnce({ rows: [{ wallet_address: ADDRESSES.developer2 }] }); // email exists

    const res = await request(app).post('/api/developers').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('email');
  });

  it('returns 409 for duplicate GitHub username', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing dev
      .mockResolvedValueOnce({ rows: [] }) // no existing email
      .mockResolvedValueOnce({ rows: [{ wallet_address: ADDRESSES.developer2 }] }); // github exists

    const res = await request(app)
      .post('/api/developers')
      .send({ ...validBody, githubUsername: 'taken' });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('GitHub');
  });

  it('normalizes wallet address to lowercase', async () => {
    const mixedAddr = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_DEVELOPER, wallet_address: mixedAddr.toLowerCase() }] });

    const res = await request(app)
      .post('/api/developers')
      .send({ ...validBody, address: mixedAddr });
    expect(res.status).toBe(201);
    // The second argument to the first client.query should be lowercased
    expect(mockClient.query.mock.calls[0][1][0]).toBe(mixedAddr.toLowerCase());
  });

  it('returns 500 on database error', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).post('/api/developers').send(validBody);
    expect(res.status).toBe(500);
  });
});

// =============================================================================
// GET /api/developers/:address
// =============================================================================
describe('GET /api/developers/:address', () => {
  it('returns developer profile', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] });

    const res = await request(app).get(`/api/developers/${ADDRESSES.developer1}`);
    expect(res.status).toBe(200);
    expect(res.body.walletAddress).toBe(SAMPLE_DEVELOPER.wallet_address);
  });

  it('returns 404 when developer not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/developers/${ADDRESSES.random}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('includes email for owner (via x-wallet-address header)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] });

    const res = await request(app)
      .get(`/api/developers/${ADDRESSES.developer1}`)
      .set('x-wallet-address', ADDRESSES.developer1);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(SAMPLE_DEVELOPER.email);
  });

  it('omits email for non-owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] });

    const res = await request(app)
      .get(`/api/developers/${ADDRESSES.developer1}`)
      .set('x-wallet-address', ADDRESSES.random);
    expect(res.status).toBe(200);
    expect(res.body.email).toBeUndefined();
  });

  it('normalizes address param to lowercase', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] });
    const upper = ADDRESSES.developer1.toUpperCase();

    await request(app).get(`/api/developers/${upper}`);
    expect(mockQuery.mock.calls[0][1][0]).toBe(ADDRESSES.developer1.toLowerCase());
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get(`/api/developers/${ADDRESSES.developer1}`);
    expect(res.status).toBe(500);
  });
});

// =============================================================================
// PUT /api/developers/:address
// =============================================================================
describe('PUT /api/developers/:address', () => {
  const validUpdate = {
    ...VALID_AUTH,
    email: 'updated@example.com',
  };

  it('updates developer profile', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] }) // existing check
      .mockResolvedValueOnce({ rows: [] }) // email not taken
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_DEVELOPER, email: 'updated@example.com' }] }); // UPDATE

    const res = await request(app)
      .put(`/api/developers/${ADDRESSES.developer1}`)
      .send(validUpdate);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('updated@example.com');
  });

  it('returns 400 for invalid input', async () => {
    const res = await request(app)
      .put(`/api/developers/${ADDRESSES.developer1}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app)
      .put(`/api/developers/${ADDRESSES.developer1}`)
      .send(validUpdate);
    expect(res.status).toBe(401);
  });

  it('returns 403 when address mismatch (editing someone else)', async () => {
    const res = await request(app)
      .put(`/api/developers/${ADDRESSES.developer2}`)
      .send(validUpdate);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 404 when developer not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .put(`/api/developers/${ADDRESSES.developer1}`)
      .send(validUpdate);
    expect(res.status).toBe(404);
  });

  it('returns 409 for duplicate email', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] })
      .mockResolvedValueOnce({ rows: [{ wallet_address: ADDRESSES.developer2 }] });

    const res = await request(app)
      .put(`/api/developers/${ADDRESSES.developer1}`)
      .send(validUpdate);
    expect(res.status).toBe(409);
  });

  it('returns current profile when no fields to update', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] });

    const res = await request(app)
      .put(`/api/developers/${ADDRESSES.developer1}`)
      .send(VALID_AUTH); // no update fields
    expect(res.status).toBe(200);
    expect(res.body.walletAddress).toBe(SAMPLE_DEVELOPER.wallet_address);
  });
});

// =============================================================================
// GET /api/developers (list)
// =============================================================================
describe('GET /api/developers', () => {
  it('returns paginated developer list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER, SAMPLE_DEVELOPER] });

    const res = await request(app).get('/api/developers');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('respects page and limit query params', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/developers?page=2&limit=10');
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(10);
  });

  it('caps limit at 100', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/developers?limit=200');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it('filters by availability', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] });

    const res = await request(app).get('/api/developers?availability=available');
    expect(res.status).toBe(200);
  });

  it('returns 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const res = await request(app).get('/api/developers');
    expect(res.status).toBe(500);
  });
});
