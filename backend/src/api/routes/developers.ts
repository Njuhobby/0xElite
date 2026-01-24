import { Router } from 'express';
import { pool } from '../../config/database';
import { verifySignature } from '../../utils/signature';
import { validateCreateDeveloper, validateUpdateDeveloper } from '../../utils/validation';
import type { Developer, CreateDeveloperInput, UpdateDeveloperInput } from '../../types/developer';

const router = Router();

/**
 * POST /api/developers
 * Create a new developer profile
 */
router.post('/', async (req, res) => {
  try {
    const input: CreateDeveloperInput = req.body;

    // Validate input
    const validationErrors = validateCreateDeveloper(input);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationErrors,
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(
      input.message,
      input.signature,
      input.address
    );

    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const client = await pool.connect();

    try {
      // Normalize wallet address to lowercase
      const walletAddress = input.address.toLowerCase();

      // Check if developer already exists
      const existingDev = await client.query(
        'SELECT wallet_address FROM developers WHERE wallet_address = $1',
        [walletAddress]
      );

      if (existingDev.rows.length > 0) {
        return res.status(409).json({
          error: 'DUPLICATE_ENTRY',
          message: 'A developer with this wallet address already exists',
        });
      }

      // Check if email already exists
      const existingEmail = await client.query(
        'SELECT wallet_address FROM developers WHERE email = $1',
        [input.email]
      );

      if (existingEmail.rows.length > 0) {
        return res.status(409).json({
          error: 'DUPLICATE_ENTRY',
          message: 'This email is already in use',
        });
      }

      // Check if GitHub username already exists (if provided)
      if (input.githubUsername) {
        const existingGithub = await client.query(
          'SELECT wallet_address FROM developers WHERE github_username = $1',
          [input.githubUsername]
        );

        if (existingGithub.rows.length > 0) {
          return res.status(409).json({
            error: 'DUPLICATE_ENTRY',
            message: 'This GitHub account is already linked to another developer',
          });
        }
      }

      // Insert new developer
      const result = await client.query<Developer>(
        `INSERT INTO developers (
          wallet_address, email, github_username, skills, bio, hourly_rate
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          walletAddress,
          input.email,
          input.githubUsername || null,
          JSON.stringify(input.skills),
          input.bio || null,
          input.hourlyRate || null,
        ]
      );

      const developer = result.rows[0];

      // Return created developer
      return res.status(201).json({
        walletAddress: developer.wallet_address,
        email: developer.email,
        githubUsername: developer.github_username,
        skills: developer.skills,
        bio: developer.bio,
        hourlyRate: developer.hourly_rate,
        availability: developer.availability,
        stakeAmount: developer.stake_amount,
        status: developer.status,
        createdAt: developer.created_at,
        updatedAt: developer.updated_at,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating developer:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/developers/:address
 * Get developer profile by wallet address
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const walletAddress = address.toLowerCase();

    const result = await pool.query<Developer>(
      'SELECT * FROM developers WHERE wallet_address = $1',
      [walletAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Developer not found',
      });
    }

    const developer = result.rows[0];

    // Check if requesting user is the owner (via optional auth header)
    const requestingAddress = req.headers['x-wallet-address'] as string | undefined;
    const isOwner = requestingAddress?.toLowerCase() === walletAddress;

    // Return appropriate fields based on ownership
    const response: any = {
      walletAddress: developer.wallet_address,
      githubUsername: developer.github_username,
      skills: developer.skills,
      bio: developer.bio,
      hourlyRate: developer.hourly_rate,
      availability: developer.availability,
      stakeAmount: developer.stake_amount,
      status: developer.status,
      createdAt: developer.created_at,
    };

    // Include email and updatedAt for owner
    if (isOwner) {
      response.email = developer.email;
      response.updatedAt = developer.updated_at;
    }

    return res.json(response);
  } catch (error) {
    console.error('Error fetching developer:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * PUT /api/developers/:address
 * Update developer profile (owner only)
 */
router.put('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const input: UpdateDeveloperInput = req.body;

    // Validate input
    const validationErrors = validateUpdateDeveloper(input);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: validationErrors,
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(
      input.message,
      input.signature,
      input.address
    );

    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const walletAddress = address.toLowerCase();
    const inputAddress = input.address.toLowerCase();

    // Verify that the address in the URL matches the signed address
    if (walletAddress !== inputAddress) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'You can only edit your own profile',
      });
    }

    const client = await pool.connect();

    try {
      // Check if developer exists
      const existing = await client.query<Developer>(
        'SELECT * FROM developers WHERE wallet_address = $1',
        [walletAddress]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Developer not found',
        });
      }

      // Check if email is being changed and if new email already exists
      if (input.email && input.email !== existing.rows[0].email) {
        const existingEmail = await client.query(
          'SELECT wallet_address FROM developers WHERE email = $1 AND wallet_address != $2',
          [input.email, walletAddress]
        );

        if (existingEmail.rows.length > 0) {
          return res.status(409).json({
            error: 'DUPLICATE_ENTRY',
            message: 'This email is already in use',
          });
        }
      }

      // Build update query dynamically
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (input.email) {
        updates.push(`email = $${paramIndex++}`);
        values.push(input.email);
      }

      if (input.skills) {
        updates.push(`skills = $${paramIndex++}`);
        values.push(JSON.stringify(input.skills));
      }

      if (input.bio !== undefined) {
        updates.push(`bio = $${paramIndex++}`);
        values.push(input.bio);
      }

      if (input.hourlyRate !== undefined) {
        updates.push(`hourly_rate = $${paramIndex++}`);
        values.push(input.hourlyRate);
      }

      if (input.availability) {
        updates.push(`availability = $${paramIndex++}`);
        values.push(input.availability);
      }

      if (updates.length === 0) {
        // No fields to update, return current profile
        const developer = existing.rows[0];
        return res.json({
          walletAddress: developer.wallet_address,
          email: developer.email,
          githubUsername: developer.github_username,
          skills: developer.skills,
          bio: developer.bio,
          hourlyRate: developer.hourly_rate,
          availability: developer.availability,
          stakeAmount: developer.stake_amount,
          status: developer.status,
          createdAt: developer.created_at,
          updatedAt: developer.updated_at,
        });
      }

      // Add wallet address as last parameter
      values.push(walletAddress);

      // Execute update
      const result = await client.query<Developer>(
        `UPDATE developers SET ${updates.join(', ')} WHERE wallet_address = $${paramIndex} RETURNING *`,
        values
      );

      const developer = result.rows[0];

      return res.json({
        walletAddress: developer.wallet_address,
        email: developer.email,
        githubUsername: developer.github_username,
        skills: developer.skills,
        bio: developer.bio,
        hourlyRate: developer.hourly_rate,
        availability: developer.availability,
        stakeAmount: developer.stake_amount,
        status: developer.status,
        createdAt: developer.created_at,
        updatedAt: developer.updated_at,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating developer:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/developers
 * List developers with filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      skills,
      availability,
      status = 'active',
      sort = 'createdAt',
      order = 'desc',
    } = req.query;

    // Parse and validate pagination
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (availability) {
      conditions.push(`availability = $${paramIndex++}`);
      values.push(availability);
    }

    if (skills) {
      const skillArray = (skills as string).split(',');
      conditions.push(`skills ?| $${paramIndex++}`);
      values.push(skillArray);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort field
    const validSortFields = ['createdAt', 'reputationScore'];
    const sortField = validSortFields.includes(sort as string)
      ? sort === 'reputationScore'
        ? 'created_at' // reputation score not yet implemented, fallback to created_at
        : 'created_at'
      : 'created_at';

    const orderDirection = order === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM developers ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count);

    // Get developers
    const result = await pool.query<Developer>(
      `SELECT * FROM developers ${whereClause}
       ORDER BY ${sortField} ${orderDirection}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limitNum, offset]
    );

    const developers = result.rows.map((dev) => ({
      walletAddress: dev.wallet_address,
      githubUsername: dev.github_username,
      skills: dev.skills,
      bio: dev.bio,
      hourlyRate: dev.hourly_rate,
      availability: dev.availability,
      stakeAmount: dev.stake_amount,
      status: dev.status,
      createdAt: dev.created_at,
    }));

    return res.json({
      data: developers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error listing developers:', error);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

export default router;
