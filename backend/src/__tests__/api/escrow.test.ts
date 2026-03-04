import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import { createMockPool } from '../helpers/mockPool';
import { createMockEscrowVaultContract } from '../helpers/mockContract';
import {
  ADDRESSES,
  SAMPLE_PROJECT,
  SAMPLE_ESCROW_DEPOSIT,
  CLIENT_AUTH,
} from '../helpers/fixtures';

// ---- Mocks ----
jest.mock('../../utils/signature', () => ({
  verifySignature: jest.fn().mockReturnValue(true),
}));

import { verifySignature } from '../../utils/signature';
import escrowRouter, { initialize } from '../../api/routes/escrow';

const mockPool = createMockPool();
const mockContract = createMockEscrowVaultContract();
initialize(mockPool as any, mockContract as any);

const app = createTestApp();
app.use('/api/escrow', escrowRouter);

// Replace global setTimeout so the 2-second delay in freeze/unfreeze resolves instantly
const originalSetTimeout = global.setTimeout;
beforeAll(() => {
  (global as any).setTimeout = (fn: Function, _ms?: number) => {
    return originalSetTimeout(fn, 0);
  };
});

afterAll(() => {
  global.setTimeout = originalSetTimeout;
});

beforeEach(() => {
  jest.clearAllMocks();
  (verifySignature as jest.Mock).mockReturnValue(true);
});

// =============================================================================
// POST /api/escrow/deposit
// =============================================================================
describe('POST /api/escrow/deposit', () => {
  const validBody = {
    ...CLIENT_AUTH,
    projectId: SAMPLE_PROJECT.id,
    amount: 5000,
    txHash: '0x' + '11'.repeat(32),
  };

  it('records deposit and returns 200', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: SAMPLE_PROJECT.id,
        client_address: ADDRESSES.client1,
        total_budget: '5000.00',
        escrow_deposited: false,
        contract_project_id: '1',
      }],
    });

    mockPool._client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // INSERT escrow_deposits
      .mockResolvedValueOnce({}) // UPDATE projects
      .mockResolvedValueOnce({}); // COMMIT

    // After transaction: get updated escrow + project
    mockPool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_ESCROW_DEPOSIT] })
      .mockResolvedValueOnce({
        rows: [{ id: SAMPLE_PROJECT.id, status: 'active', escrow_deposited: true }],
      });

    const res = await request(app).post('/api/escrow/deposit').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.escrow).toBeDefined();
    expect(res.body.project).toBeDefined();
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/escrow/deposit').send({ ...CLIENT_AUTH });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for invalid signature', async () => {
    (verifySignature as jest.Mock).mockReturnValue(false);
    const res = await request(app).post('/api/escrow/deposit').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 when project not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/escrow/deposit').send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-client', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: SAMPLE_PROJECT.id,
        client_address: ADDRESSES.client2,
        total_budget: '5000.00',
        escrow_deposited: false,
      }],
    });

    const res = await request(app).post('/api/escrow/deposit').send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 409 when escrow already deposited', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: SAMPLE_PROJECT.id,
        client_address: ADDRESSES.client1,
        total_budget: '5000.00',
        escrow_deposited: true,
      }],
    });

    const res = await request(app).post('/api/escrow/deposit').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ESCROW_EXISTS');
  });

  it('returns 400 when amount mismatches budget', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: SAMPLE_PROJECT.id,
        client_address: ADDRESSES.client1,
        total_budget: '5000.00',
        escrow_deposited: false,
      }],
    });

    const res = await request(app)
      .post('/api/escrow/deposit')
      .send({ ...validBody, amount: 3000 });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// GET /api/escrow/:projectId
// =============================================================================
describe('GET /api/escrow/:projectId', () => {
  it('returns escrow status', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [SAMPLE_ESCROW_DEPOSIT] })
      .mockResolvedValueOnce({
        rows: [{
          total_milestones: '3',
          milestones_completed: '1',
          developer_payments: '1500.00',
          platform_fees: '150.00',
          pending_milestones: '3000.00',
        }],
      });

    const res = await request(app).get(`/api/escrow/${SAMPLE_PROJECT.id}`);
    expect(res.status).toBe(200);
    expect(res.body.escrow.totalDeposited).toBe(5000);
    expect(res.body.breakdown.milestonesCompleted).toBe(1);
  });

  it('returns 404 when no escrow found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/escrow/nonexistent');
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// GET /api/escrow/:projectId/history
// =============================================================================
describe('GET /api/escrow/:projectId/history', () => {
  it('returns payment history', async () => {
    const historyRow = {
      id: 'ph-1',
      project_id: SAMPLE_PROJECT.id,
      milestone_id: null,
      transaction_type: 'deposit',
      amount: '5000.000000',
      from_address: ADDRESSES.client1,
      to_address: ADDRESSES.admin,
      tx_hash: '0x' + '11'.repeat(32),
      block_number: 100,
      block_timestamp: new Date(),
      platform_fee: null,
      developer_payment: null,
      notes: null,
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [historyRow] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app).get(`/api/escrow/${SAMPLE_PROJECT.id}/history`);
    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('returns 404 when no history found', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app).get('/api/escrow/nonexistent/history');
    expect(res.status).toBe(404);
  });

  it('filters by transaction type', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app).get(`/api/escrow/${SAMPLE_PROJECT.id}/history?type=deposit`);
    // Verify the type filter is applied in the query
    const queryCall = mockPool.query.mock.calls[0];
    expect(queryCall[0]).toContain('transaction_type');
    expect(queryCall[1]).toContain('deposit');
  });
});

// =============================================================================
// POST /api/escrow/freeze
// =============================================================================
describe('POST /api/escrow/freeze', () => {
  const freezeBody = {
    ...CLIENT_AUTH,
    projectId: SAMPLE_PROJECT.id,
    reason: 'Dispute filed',
  };

  it('freezes escrow successfully', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ contract_project_id: '1' }] }) // project lookup
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_ESCROW_DEPOSIT, is_frozen: true }] }); // after freeze

    const res = await request(app).post('/api/escrow/freeze').send(freezeBody);
    expect(res.status).toBe(200);
    expect(mockContract.freeze).toHaveBeenCalled();
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/escrow/freeze').send({ ...CLIENT_AUTH });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/escrow/freeze').send(freezeBody);
    expect(res.status).toBe(404);
  });

  it('returns 401 when contract rejects freeze', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ contract_project_id: '1' }] });
    mockContract.freeze.mockRejectedValueOnce(new Error('Unauthorized'));

    const res = await request(app).post('/api/escrow/freeze').send(freezeBody);
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// POST /api/escrow/unfreeze
// =============================================================================
describe('POST /api/escrow/unfreeze', () => {
  const unfreezeBody = {
    ...CLIENT_AUTH,
    projectId: SAMPLE_PROJECT.id,
  };

  it('unfreezes escrow successfully', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ contract_project_id: '1' }] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_ESCROW_DEPOSIT, is_frozen: false }] });

    const res = await request(app).post('/api/escrow/unfreeze').send(unfreezeBody);
    expect(res.status).toBe(200);
    expect(mockContract.unfreeze).toHaveBeenCalled();
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/escrow/unfreeze').send({});
    expect(res.status).toBe(400);
  });

  it('returns 409 when escrow not frozen', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ contract_project_id: '1' }] });
    mockContract.unfreeze.mockRejectedValueOnce(new Error('EscrowNotFrozen'));

    const res = await request(app).post('/api/escrow/unfreeze').send(unfreezeBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NOT_FROZEN');
  });
});
