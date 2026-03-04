import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import {
  ADDRESSES,
  SAMPLE_PROJECT_COMPLETED,
  SAMPLE_REVIEW,
  SAMPLE_DEVELOPER,
  SAMPLE_CLIENT,
  VALID_AUTH,
  CLIENT_AUTH,
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
import reviewsRouter from '../../api/routes/reviews';

const app = createTestApp();
app.use('/api/reviews', reviewsRouter);

beforeEach(() => {
  jest.clearAllMocks();
  mockConnect.mockResolvedValue(mockClient);
  (verifySignature as jest.Mock).mockReturnValue(true);
});

// =============================================================================
// POST /api/reviews
// =============================================================================
describe('POST /api/reviews', () => {
  const validBody = {
    ...CLIENT_AUTH,
    projectId: SAMPLE_PROJECT_COMPLETED.id,
    rating: 5,
    comment: 'Great work!',
  };

  it('creates a review and returns 201', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: SAMPLE_PROJECT_COMPLETED.id,
          client_address: ADDRESSES.client1,
          assigned_developer: ADDRESSES.developer1,
          status: 'completed',
        }],
      }) // project lookup
      .mockResolvedValueOnce({ rows: [] }) // no existing review
      .mockResolvedValueOnce({ rows: [SAMPLE_REVIEW] }); // INSERT

    const res = await request(app).post('/api/reviews').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SAMPLE_REVIEW.id);
    expect(res.body.canEdit).toBe(true);
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/reviews').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid rating (0)', async () => {
    const res = await request(app).post('/api/reviews').send({ ...validBody, rating: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid rating (6)', async () => {
    const res = await request(app).post('/api/reviews').send({ ...validBody, rating: 6 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-integer rating', async () => {
    const res = await request(app).post('/api/reviews').send({ ...validBody, rating: 3.5 });
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).post('/api/reviews').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/reviews').send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 422 when project not completed', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_PROJECT_COMPLETED, status: 'active' }],
    });

    const res = await request(app).post('/api/reviews').send(validBody);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PROJECT_NOT_COMPLETED');
  });

  it('returns 403 when reviewer is not client or developer', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: SAMPLE_PROJECT_COMPLETED.id,
        client_address: ADDRESSES.client2,
        assigned_developer: ADDRESSES.developer2,
        status: 'completed',
      }],
    });

    const res = await request(app).post('/api/reviews').send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('returns 409 when review already exists', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: SAMPLE_PROJECT_COMPLETED.id,
          client_address: ADDRESSES.client1,
          assigned_developer: ADDRESSES.developer1,
          status: 'completed',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'existing-review' }] }); // duplicate check

    const res = await request(app).post('/api/reviews').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('REVIEW_ALREADY_EXISTS');
  });

  it('allows developer to review client', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{
          id: SAMPLE_PROJECT_COMPLETED.id,
          client_address: ADDRESSES.client1,
          assigned_developer: ADDRESSES.developer1,
          status: 'completed',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ ...SAMPLE_REVIEW, reviewer_type: 'developer', reviewer_address: ADDRESSES.developer1 }],
      });

    const res = await request(app).post('/api/reviews').send({
      ...VALID_AUTH,
      projectId: SAMPLE_PROJECT_COMPLETED.id,
      rating: 4,
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 for comment too long', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .send({ ...validBody, comment: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// GET /api/reviews/developer/:address
// =============================================================================
describe('GET /api/reviews/developer/:address', () => {
  it('returns developer reviews with rating summary', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] }) // dev lookup
      .mockResolvedValueOnce({
        rows: [{ ...SAMPLE_REVIEW, title: 'DeFi Dashboard' }],
      }) // reviews
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // count

    const res = await request(app).get(`/api/reviews/developer/${ADDRESSES.developer1}`);
    expect(res.status).toBe(200);
    expect(res.body.developerAddress).toBe(ADDRESSES.developer1.toLowerCase());
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.pagination).toBeDefined();
  });

  it('returns 404 when developer not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/reviews/developer/${ADDRESSES.random}`);
    expect(res.status).toBe(404);
  });

  it('respects limit and offset params', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_DEVELOPER] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app).get(`/api/reviews/developer/${ADDRESSES.developer1}?limit=5&offset=10`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.offset).toBe(10);
  });
});

// =============================================================================
// GET /api/reviews/client/:address
// =============================================================================
describe('GET /api/reviews/client/:address', () => {
  it('returns client reviews', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [SAMPLE_CLIENT] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app).get(`/api/reviews/client/${ADDRESSES.client1}`);
    expect(res.status).toBe(200);
    expect(res.body.clientAddress).toBe(ADDRESSES.client1.toLowerCase());
  });

  it('returns 404 when client not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/reviews/client/${ADDRESSES.random}`);
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// GET /api/reviews/project/:projectId
// =============================================================================
describe('GET /api/reviews/project/:projectId', () => {
  it('returns project reviews', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'proj-1', title: 'Test', client_address: ADDRESSES.client1, assigned_developer: ADDRESSES.developer1 }],
      })
      .mockResolvedValueOnce({ rows: [SAMPLE_REVIEW] });

    const res = await request(app).get('/api/reviews/project/proj-1');
    expect(res.status).toBe(200);
    expect(res.body.reviews.clientReview).toBeDefined();
    expect(res.body.reviews.developerReview).toBeNull();
  });

  it('returns 404 when project not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/reviews/project/nonexistent');
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// PUT /api/reviews/:id
// =============================================================================
describe('PUT /api/reviews/:id', () => {
  const updateBody = {
    ...CLIENT_AUTH,
    rating: 4,
    comment: 'Updated review',
  };

  it('updates review within edit window', async () => {
    const recentReview = { ...SAMPLE_REVIEW, created_at: new Date() };
    mockClient.query
      .mockResolvedValueOnce({ rows: [recentReview] }) // fetch
      .mockResolvedValueOnce({ rows: [{ ...recentReview, rating: 4, comment: 'Updated review' }] }); // update

    const res = await request(app).put('/api/reviews/rev-uuid-001').send(updateBody);
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid address', async () => {
    const res = await request(app)
      .put('/api/reviews/rev-uuid-001')
      .send({ ...updateBody, address: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing signature/message', async () => {
    const res = await request(app)
      .put('/api/reviews/rev-uuid-001')
      .send({ address: ADDRESSES.client1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid rating', async () => {
    const res = await request(app)
      .put('/api/reviews/rev-uuid-001')
      .send({ ...updateBody, rating: 6 });
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).put('/api/reviews/rev-uuid-001').send(updateBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when review not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).put('/api/reviews/nonexistent').send(updateBody);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not original reviewer', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ ...SAMPLE_REVIEW, reviewer_address: ADDRESSES.developer1, created_at: new Date() }],
    });

    const res = await request(app).put('/api/reviews/rev-uuid-001').send(updateBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 422 when edit window expired', async () => {
    const oldReview = { ...SAMPLE_REVIEW, created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) };
    mockClient.query.mockResolvedValueOnce({ rows: [oldReview] });

    const res = await request(app).put('/api/reviews/rev-uuid-001').send(updateBody);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('EDIT_WINDOW_EXPIRED');
  });
});
