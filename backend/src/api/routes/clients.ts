import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { verifySignature } from '../../utils/signature';
import { logger } from '../../utils/logger';

const router = express.Router();

let db: Pool;

export function initialize(database: Pool) {
  db = database;
}

// =====================================================
// POST /api/clients - Create/Update Client Profile
// =====================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    const { address, message, signature, email, companyName, description, website } = req.body;

    // Validation
    if (!address || !message || !signature) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Address, message, and signature required',
      });
    }

    // Verify signature
    const isValidSignature = verifySignature(message, signature, address);
    if (!isValidSignature) {
      return res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      });
    }

    const clientAddress = address.toLowerCase();

    // Check if email is already used by another client
    if (email) {
      const emailCheckResult = await db.query(
        'SELECT wallet_address FROM clients WHERE email = $1 AND wallet_address != $2',
        [email, clientAddress]
      );

      if (emailCheckResult.rows.length > 0) {
        return res.status(400).json({
          error: 'EMAIL_IN_USE',
          message: 'Email address already registered to another client',
        });
      }
    }

    // Upsert client record
    const result = await db.query(
      `INSERT INTO clients (
        wallet_address, email, company_name, description, website,
        is_registered, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (wallet_address)
      DO UPDATE SET
        email = COALESCE(EXCLUDED.email, clients.email),
        company_name = COALESCE(EXCLUDED.company_name, clients.company_name),
        description = COALESCE(EXCLUDED.description, clients.description),
        website = COALESCE(EXCLUDED.website, clients.website),
        is_registered = EXCLUDED.is_registered,
        updated_at = NOW()
      RETURNING *`,
      [
        clientAddress,
        email || null,
        companyName || null,
        description || null,
        website || null,
        !!(email && companyName), // is_registered if email and company name provided
      ]
    );

    const client = result.rows[0];

    res.status(201).json({
      walletAddress: client.wallet_address,
      email: client.email,
      companyName: client.company_name,
      description: client.description,
      website: client.website,
      isRegistered: client.is_registered,
      projectsCreated: client.projects_created,
      projectsCompleted: client.projects_completed,
      createdAt: client.created_at,
    });
  } catch (error: any) {
    logger.error('Error creating/updating client', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to create/update client profile',
    });
  }
});

// =====================================================
// GET /api/clients/:address - View Client Profile
// =====================================================

router.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const viewerAddress = req.headers['x-wallet-address'] as string | undefined;

    const clientAddress = address.toLowerCase();

    const result = await db.query(
      'SELECT * FROM clients WHERE wallet_address = $1',
      [clientAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Client not found',
      });
    }

    const client = result.rows[0];
    const isOwner = viewerAddress?.toLowerCase() === clientAddress;

    // Public view (hide email)
    const response: any = {
      walletAddress: client.wallet_address,
      companyName: client.company_name,
      description: client.description,
      website: client.website,
      projectsCreated: client.projects_created,
      projectsCompleted: client.projects_completed,
      totalSpent: client.total_spent,
      reputationScore: client.reputation_score,
      createdAt: client.created_at,
    };

    // Include email for owner
    if (isOwner) {
      response.email = client.email;
      response.isRegistered = client.is_registered;
    }

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching client', { error });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch client profile',
    });
  }
});

export default router;
