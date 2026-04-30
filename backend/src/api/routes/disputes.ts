import { Router } from 'express';
import { pool } from '../../config/database';
import type { Dispute, DisputeVote } from '../../types/dispute';

const router = Router();

// =============================================================================
// Read-only routes — all dispute writes happen on-chain via DisputeDAO and are
// reconciled by the pendingTx pipeline (see services/pendingTxActions.ts).
// =============================================================================

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
 * GET /api/disputes/:id/votes
 * Get all votes for a dispute
 */
router.get('/:id/votes', async (req, res) => {
  try {
    const { id } = req.params;

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
 * GET /api/disputes/active/list
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
 * GET /api/disputes/votable/:address
 * List disputes currently in voting phase that the address is not a party to.
 * The frontend filters out 0-weight cases via on-chain getPastVotes.
 */
router.get('/votable/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const walletAddress = address.toLowerCase();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

    const result = await pool.query<Dispute>(
      `SELECT d.*, p.title as project_title
         FROM disputes d
         JOIN projects p ON p.id = d.project_id
        WHERE d.status = 'voting'
          AND d.client_address    != $1
          AND d.developer_address != $1
        ORDER BY d.voting_deadline ASC NULLS LAST, d.created_at DESC
        LIMIT $2 OFFSET $3`,
      [walletAddress, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM disputes
        WHERE status = 'voting'
          AND client_address    != $1
          AND developer_address != $1`,
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
    console.error('Error fetching votable disputes:', error);
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

export default router;
