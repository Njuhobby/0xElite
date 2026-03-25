import { Router } from 'express';
import { pool } from '../../config/database';
import { verifySignature } from '../../utils/signature';
import { isValidAddress } from '../../utils/validation';
import type { Dispute, DisputeVote, CreateDisputeInput, SubmitEvidenceInput, CastVoteInput } from '../../types/dispute';

const router = Router();

/**
 * POST /api/disputes
 * Create a new dispute for a project
 */
router.post('/', async (req, res) => {
  try {
    const input: CreateDisputeInput = req.body;

    // Validate input
    const errors = validateCreateDispute(input);
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid dispute data',
        details: errors,
      });
    }

    // Verify signature
    const isValidSig = verifySignature(input.message, input.signature, input.address);
    if (!isValidSig) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const initiatorAddress = input.address.toLowerCase();
    const client = await pool.connect();

    try {
      // Fetch project
      const projectResult = await client.query(
        `SELECT id, client_address, assigned_developer, status
         FROM projects WHERE id = $1`,
        [input.projectId]
      );

      if (projectResult.rows.length === 0) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Project not found',
        });
      }

      const project = projectResult.rows[0];
      const clientAddress = project.client_address?.toLowerCase();
      const developerAddress = project.assigned_developer?.toLowerCase();

      // Must be client or developer
      if (initiatorAddress !== clientAddress && initiatorAddress !== developerAddress) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only the client or assigned developer can file a dispute',
        });
      }

      // Project must be active
      if (project.status !== 'active') {
        return res.status(422).json({
          error: 'INVALID_STATE',
          message: 'Disputes can only be filed on active projects',
        });
      }

      // Check for existing active dispute
      const existingDispute = await client.query(
        "SELECT id FROM disputes WHERE project_id = $1 AND status != 'resolved'",
        [input.projectId]
      );

      if (existingDispute.rows.length > 0) {
        return res.status(409).json({
          error: 'DISPUTE_ALREADY_EXISTS',
          message: 'An active dispute already exists for this project',
        });
      }

      const isClient = initiatorAddress === clientAddress;
      const evidenceDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

      // Insert dispute
      const result = await client.query<Dispute>(
        `INSERT INTO disputes (
          project_id, client_address, developer_address, initiator_address,
          initiator_role, status, client_evidence_uri, developer_evidence_uri,
          evidence_deadline, arbitration_fee
        ) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, 50.000000)
        RETURNING *`,
        [
          input.projectId,
          clientAddress,
          developerAddress,
          initiatorAddress,
          isClient ? 'client' : 'developer',
          isClient ? input.evidenceUri : null,
          isClient ? null : input.evidenceUri,
          evidenceDeadline,
        ]
      );

      const dispute = result.rows[0]!;

      return res.status(201).json(formatDispute(dispute));
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating dispute:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/disputes/:id
 * Get dispute details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query<Dispute>(
      'SELECT * FROM disputes WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Dispute not found',
      });
    }

    return res.json(formatDispute(result.rows[0]));
  } catch (error) {
    console.error('Error fetching dispute:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/disputes/project/:projectId
 * Get disputes for a project
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query<Dispute>(
      'SELECT * FROM disputes WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );

    return res.json({
      disputes: result.rows.map(formatDispute),
    });
  } catch (error) {
    console.error('Error fetching project disputes:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * PUT /api/disputes/:id/evidence
 * Submit or update evidence for a dispute
 */
router.put('/:id/evidence', async (req, res) => {
  try {
    const { id } = req.params;
    const input: SubmitEvidenceInput = req.body;

    if (!input.address || !isValidAddress(input.address)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid address format',
      });
    }

    if (!input.evidenceUri) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Evidence URI is required',
      });
    }

    const isValidSig = verifySignature(input.message, input.signature, input.address);
    if (!isValidSig) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const address = input.address.toLowerCase();

    const disputeResult = await pool.query<Dispute>(
      'SELECT * FROM disputes WHERE id = $1',
      [id]
    );

    if (disputeResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Dispute not found',
      });
    }

    const dispute = disputeResult.rows[0];

    if (dispute.status !== 'open') {
      return res.status(422).json({
        error: 'INVALID_STATE',
        message: 'Evidence can only be submitted during the open phase',
      });
    }

    if (new Date() > dispute.evidence_deadline) {
      return res.status(422).json({
        error: 'EVIDENCE_PERIOD_ENDED',
        message: 'The evidence submission period has ended',
      });
    }

    if (address !== dispute.client_address && address !== dispute.developer_address) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only dispute parties can submit evidence',
      });
    }

    const isClient = address === dispute.client_address;
    const field = isClient ? 'client_evidence_uri' : 'developer_evidence_uri';

    const result = await pool.query<Dispute>(
      `UPDATE disputes SET ${field} = $1 WHERE id = $2 RETURNING *`,
      [input.evidenceUri, id]
    );

    return res.json(formatDispute(result.rows[0]));
  } catch (error) {
    console.error('Error submitting evidence:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/disputes/:id/votes
 * Get all votes for a dispute
 */
router.get('/:id/votes', async (req, res) => {
  try {
    const { id } = req.params;

    // Check dispute exists
    const disputeResult = await pool.query(
      'SELECT id FROM disputes WHERE id = $1',
      [id]
    );

    if (disputeResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Dispute not found',
      });
    }

    const votesResult = await pool.query<DisputeVote>(
      'SELECT * FROM dispute_votes WHERE dispute_id = $1 ORDER BY voted_at ASC',
      [id]
    );

    return res.json({
      votes: votesResult.rows.map(v => ({
        id: v.id,
        disputeId: v.dispute_id,
        voterAddress: v.voter_address,
        supportClient: v.support_client,
        voteWeight: v.vote_weight,
        rewardAmount: v.reward_amount,
        txHash: v.tx_hash,
        votedAt: v.voted_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching dispute votes:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/disputes/active
 * List all active (non-resolved) disputes
 */
router.get('/active/list', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const result = await pool.query<Dispute>(
      `SELECT d.*, p.title as project_title
       FROM disputes d
       JOIN projects p ON p.id = d.project_id
       WHERE d.status != 'resolved'
       ORDER BY d.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM disputes WHERE status != 'resolved'"
    );
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      disputes: result.rows.map(formatDispute),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching active disputes:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/disputes/my/:address
 * List disputes involving a specific address
 */
router.get('/my/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const walletAddress = address.toLowerCase();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const result = await pool.query<Dispute>(
      `SELECT * FROM disputes
       WHERE client_address = $1 OR developer_address = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [walletAddress, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM disputes WHERE client_address = $1 OR developer_address = $1',
      [walletAddress]
    );
    const total = parseInt(countResult.rows[0].count);

    return res.json({
      disputes: result.rows.map(formatDispute),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching user disputes:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

// ==============================================
// Helpers
// ==============================================

function formatDispute(d: Dispute & { project_title?: string }) {
  return {
    id: d.id,
    disputeNumber: d.dispute_number,
    projectId: d.project_id,
    projectTitle: (d as any).project_title || undefined,
    clientAddress: d.client_address,
    developerAddress: d.developer_address,
    initiatorAddress: d.initiator_address,
    initiatorRole: d.initiator_role,
    status: d.status,
    clientEvidenceUri: d.client_evidence_uri,
    developerEvidenceUri: d.developer_evidence_uri,
    evidenceDeadline: d.evidence_deadline,
    votingDeadline: d.voting_deadline,
    votingSnapshot: d.voting_snapshot,
    clientVoteWeight: d.client_vote_weight,
    developerVoteWeight: d.developer_vote_weight,
    totalVoteWeight: d.total_vote_weight,
    quorumRequired: d.quorum_required,
    winner: d.winner,
    resolvedByOwner: d.resolved_by_owner,
    clientShare: d.client_share,
    developerShare: d.developer_share,
    arbitrationFee: d.arbitration_fee,
    chainDisputeId: d.chain_dispute_id,
    creationTxHash: d.creation_tx_hash,
    resolutionTxHash: d.resolution_tx_hash,
    createdAt: d.created_at,
    resolvedAt: d.resolved_at,
    updatedAt: d.updated_at,
  };
}

function validateCreateDispute(data: any): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (!data.address || !isValidAddress(data.address)) {
    errors.push({ field: 'address', message: 'Invalid Ethereum address format' });
  }

  if (!data.signature || typeof data.signature !== 'string') {
    errors.push({ field: 'signature', message: 'Signature is required' });
  }

  if (!data.message || typeof data.message !== 'string') {
    errors.push({ field: 'message', message: 'Message is required' });
  }

  if (!data.projectId || typeof data.projectId !== 'string') {
    errors.push({ field: 'projectId', message: 'Project ID is required' });
  }

  if (!data.evidenceUri || typeof data.evidenceUri !== 'string') {
    errors.push({ field: 'evidenceUri', message: 'Evidence URI is required' });
  }

  return errors;
}

export default router;
