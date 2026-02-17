import { Router } from 'express';
import { pool } from '../../config/database';
import { verifySignature } from '../../utils/signature';
import { isValidAddress } from '../../utils/validation';
import type { Review, CreateReviewInput, UpdateReviewInput } from '../../types/review';

const router = Router();

const MAX_COMMENT_LENGTH = 1000;
const EDIT_WINDOW_DAYS = 7;

/**
 * POST /api/reviews
 * Submit a new review for a developer or client after project completion
 */
router.post('/', async (req, res) => {
  try {
    const input: CreateReviewInput = req.body;

    // Validate input
    const errors = validateCreateReview(input);
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid review data',
        details: errors,
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(input.message, input.signature, input.address);
    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const reviewerAddress = input.address.toLowerCase();
    const client = await pool.connect();

    try {
      // Fetch project with client and developer info
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

      // Project must be completed
      if (project.status !== 'completed') {
        return res.status(422).json({
          error: 'PROJECT_NOT_COMPLETED',
          message: 'Can only review completed projects',
        });
      }

      // Determine reviewer type and reviewee
      const clientAddress = project.client_address?.toLowerCase();
      const developerAddress = project.assigned_developer?.toLowerCase();
      let reviewerType: 'client' | 'developer';
      let revieweeAddress: string;

      if (reviewerAddress === clientAddress) {
        reviewerType = 'client';
        revieweeAddress = developerAddress;
      } else if (reviewerAddress === developerAddress) {
        reviewerType = 'developer';
        revieweeAddress = clientAddress;
      } else {
        return res.status(403).json({
          error: 'UNAUTHORIZED',
          message: 'You are not authorized to review this project',
        });
      }

      if (!revieweeAddress) {
        return res.status(422).json({
          error: 'INVALID_PROJECT',
          message: 'Project does not have both a client and developer assigned',
        });
      }

      // Check for duplicate review
      const existingReview = await client.query(
        'SELECT id FROM reviews WHERE project_id = $1 AND reviewer_address = $2',
        [input.projectId, reviewerAddress]
      );

      if (existingReview.rows.length > 0) {
        return res.status(409).json({
          error: 'REVIEW_ALREADY_EXISTS',
          message: 'You have already reviewed this project',
        });
      }

      // Insert review (triggers will auto-recalculate ratings)
      const result = await client.query<Review>(
        `INSERT INTO reviews (project_id, reviewer_address, reviewee_address, reviewer_type, rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [input.projectId, reviewerAddress, revieweeAddress, reviewerType, input.rating, input.comment || null]
      );

      const review = result.rows[0];

      return res.status(201).json({
        id: review.id,
        projectId: review.project_id,
        reviewerAddress: review.reviewer_address,
        revieweeAddress: review.reviewee_address,
        reviewerType: review.reviewer_type,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at,
        updatedAt: review.updated_at,
        canEdit: true,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating review:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/reviews/developer/:address
 * Get all reviews for a specific developer
 */
router.get('/developer/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const walletAddress = address.toLowerCase();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const sort = req.query.sort === 'oldest' ? 'ASC' : 'DESC';

    // Check developer exists
    const devResult = await pool.query(
      'SELECT wallet_address, average_rating, total_reviews, rating_distribution FROM developers WHERE wallet_address = $1',
      [walletAddress]
    );

    if (devResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Developer not found',
      });
    }

    const dev = devResult.rows[0];

    // Fetch reviews where this developer is the reviewee (reviewed by clients)
    const reviewsResult = await pool.query<Review & { title: string }>(
      `SELECT r.*, p.title
       FROM reviews r
       JOIN projects p ON p.id = r.project_id
       WHERE r.reviewee_address = $1 AND r.reviewer_type = 'client'
       ORDER BY r.created_at ${sort}
       LIMIT $2 OFFSET $3`,
      [walletAddress, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reviews WHERE reviewee_address = $1 AND reviewer_type = 'client'`,
      [walletAddress]
    );
    const total = parseInt(countResult.rows[0].count);

    const reviews = reviewsResult.rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      projectTitle: r.title,
      reviewerAddress: r.reviewer_address,
      reviewerType: r.reviewer_type,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
    }));

    return res.json({
      developerAddress: walletAddress,
      averageRating: dev.average_rating ? parseFloat(dev.average_rating) : null,
      totalReviews: dev.total_reviews,
      ratingDistribution: dev.rating_distribution,
      reviews,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching developer reviews:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/reviews/client/:address
 * Get all reviews for a specific client
 */
router.get('/client/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const walletAddress = address.toLowerCase();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const sort = req.query.sort === 'oldest' ? 'ASC' : 'DESC';

    // Check client exists
    const clientResult = await pool.query(
      'SELECT wallet_address, average_rating, total_reviews, rating_distribution FROM clients WHERE wallet_address = $1',
      [walletAddress]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Client not found',
      });
    }

    const clientData = clientResult.rows[0];

    // Fetch reviews where this client is the reviewee (reviewed by developers)
    const reviewsResult = await pool.query<Review & { title: string }>(
      `SELECT r.*, p.title
       FROM reviews r
       JOIN projects p ON p.id = r.project_id
       WHERE r.reviewee_address = $1 AND r.reviewer_type = 'developer'
       ORDER BY r.created_at ${sort}
       LIMIT $2 OFFSET $3`,
      [walletAddress, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM reviews WHERE reviewee_address = $1 AND reviewer_type = 'developer'`,
      [walletAddress]
    );
    const total = parseInt(countResult.rows[0].count);

    const reviews = reviewsResult.rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      projectTitle: r.title,
      reviewerAddress: r.reviewer_address,
      reviewerType: r.reviewer_type,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at,
    }));

    return res.json({
      clientAddress: walletAddress,
      averageRating: clientData.average_rating ? parseFloat(clientData.average_rating) : null,
      totalReviews: clientData.total_reviews,
      ratingDistribution: clientData.rating_distribution,
      reviews,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error('Error fetching client reviews:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/reviews/project/:projectId
 * Get both reviews for a specific project
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Fetch project
    const projectResult = await pool.query(
      'SELECT id, title, client_address, assigned_developer FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found',
      });
    }

    const project = projectResult.rows[0];

    // Fetch reviews for this project
    const reviewsResult = await pool.query<Review>(
      'SELECT * FROM reviews WHERE project_id = $1',
      [projectId]
    );

    const clientReview = reviewsResult.rows.find(r => r.reviewer_type === 'client') || null;
    const developerReview = reviewsResult.rows.find(r => r.reviewer_type === 'developer') || null;

    const formatReview = (r: Review | null) => {
      if (!r) return null;
      return {
        id: r.id,
        reviewerAddress: r.reviewer_address,
        revieweeAddress: r.reviewee_address,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
      };
    };

    return res.json({
      projectId: project.id,
      projectTitle: project.title,
      clientAddress: project.client_address,
      developerAddress: project.assigned_developer,
      reviews: {
        clientReview: formatReview(clientReview),
        developerReview: formatReview(developerReview),
      },
    });
  } catch (error) {
    console.error('Error fetching project reviews:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * PUT /api/reviews/:id
 * Edit an existing review (within 7 days of submission)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const input: UpdateReviewInput = req.body;

    // Validate input
    if (!input.address || !isValidAddress(input.address)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid address format',
      });
    }

    if (!input.signature || !input.message) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Signature and message are required',
      });
    }

    if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Rating must be an integer between 1 and 5',
        details: [{ field: 'rating', message: 'Rating must be between 1 and 5' }],
      });
    }

    if (input.comment !== undefined && input.comment !== null && input.comment.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Comment too long',
        details: [{ field: 'comment', message: `Comment must be ${MAX_COMMENT_LENGTH} characters or less` }],
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(input.message, input.signature, input.address);
    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const reviewerAddress = input.address.toLowerCase();
    const dbClient = await pool.connect();

    try {
      // Fetch existing review
      const reviewResult = await dbClient.query<Review>(
        'SELECT * FROM reviews WHERE id = $1',
        [id]
      );

      if (reviewResult.rows.length === 0) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Review not found',
        });
      }

      const review = reviewResult.rows[0];

      // Must be original reviewer
      if (review.reviewer_address !== reviewerAddress) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Only the original reviewer can edit this review',
        });
      }

      // Check edit window
      const daysSinceCreation = (Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation > EDIT_WINDOW_DAYS) {
        return res.status(422).json({
          error: 'EDIT_WINDOW_EXPIRED',
          message: 'Reviews can only be edited within 7 days of submission',
        });
      }

      // Build update
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.rating !== undefined) {
        updates.push(`rating = $${paramIndex++}`);
        values.push(input.rating);
      }

      if (input.comment !== undefined) {
        updates.push(`comment = $${paramIndex++}`);
        values.push(input.comment);
      }

      if (updates.length === 0) {
        // Nothing to update
        return res.json({
          id: review.id,
          projectId: review.project_id,
          reviewerAddress: review.reviewer_address,
          revieweeAddress: review.reviewee_address,
          reviewerType: review.reviewer_type,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.created_at,
          updatedAt: review.updated_at,
          canEdit: true,
        });
      }

      values.push(id);

      const result = await dbClient.query<Review>(
        `UPDATE reviews SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const updated = result.rows[0];
      const canEdit = (Date.now() - new Date(updated.created_at).getTime()) / (1000 * 60 * 60 * 24) <= EDIT_WINDOW_DAYS;

      return res.json({
        id: updated.id,
        projectId: updated.project_id,
        reviewerAddress: updated.reviewer_address,
        revieweeAddress: updated.reviewee_address,
        reviewerType: updated.reviewer_type,
        rating: updated.rating,
        comment: updated.comment,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        canEdit,
      });
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('Error updating review:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * Validate review creation input
 */
function validateCreateReview(data: any): Array<{ field: string; message: string }> {
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

  if (typeof data.rating !== 'number' || !Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
    errors.push({ field: 'rating', message: 'Rating must be an integer between 1 and 5' });
  }

  if (data.comment !== undefined && data.comment !== null) {
    if (typeof data.comment !== 'string') {
      errors.push({ field: 'comment', message: 'Comment must be a string' });
    } else if (data.comment.length > MAX_COMMENT_LENGTH) {
      errors.push({ field: 'comment', message: `Comment must be ${MAX_COMMENT_LENGTH} characters or less` });
    }
  }

  return errors;
}

export default router;
