import { Router } from 'express';
import { SiweMessage } from 'siwe';
import { issueNonce, consumeNonce } from '../../utils/nonceStore';
import { signToken } from '../../utils/jwt';
import { getAdminAddresses } from '../../utils/auth';
import { pool } from '../../config/database';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';

const router = Router();

const EXPECTED_DOMAIN = process.env.AUTH_DOMAIN || 'localhost:3000';

router.get('/nonce', (req, res) => {
  const address = (req.query.address as string | undefined)?.toLowerCase();
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'address query param required' });
  }
  const nonce = issueNonce(address);
  res.json({ nonce });
});

router.post('/login', async (req, res) => {
  const { message, signature } = req.body ?? {};
  if (typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'message and signature required' });
  }

  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(message);
  } catch {
    return res.status(400).json({ error: 'BAD_MESSAGE', message: 'Could not parse SIWE message' });
  }

  const verification = await siwe.verify({ signature, domain: EXPECTED_DOMAIN }, { suppressExceptions: true });
  if (!verification.success) {
    return res.status(401).json({
      error: 'INVALID_SIGNATURE',
      message: verification.error?.type ?? 'SIWE verification failed',
    });
  }

  const address = siwe.address.toLowerCase();
  if (!consumeNonce(address, siwe.nonce)) {
    return res.status(401).json({ error: 'BAD_NONCE', message: 'Nonce missing, expired, or already used' });
  }

  const roles = await resolveRoles(address);
  const token = signToken(address, roles);
  res.json({ token, address, roles });
});

// Re-issue JWT with freshly-resolved roles. Used after wallet registers
// as a client/dev — previous token still has empty roles, this picks them up
// without forcing another SIWE signature.
router.post('/refresh', requireAuth, async (req: AuthenticatedRequest, res) => {
  const address = req.user!.address;
  const roles = await resolveRoles(address);
  const token = signToken(address, roles);
  res.json({ token, address, roles });
});

router.post('/logout', (req, res) => {
  // JWTs are stateless — frontend just discards. No revocation list in MVP.
  res.json({ ok: true });
});

async function resolveRoles(address: string): Promise<string[]> {
  const roles: string[] = [];
  const [devRow, clientRow] = await Promise.all([
    pool.query('SELECT 1 FROM developers WHERE LOWER(wallet_address) = $1 LIMIT 1', [address]),
    pool.query('SELECT 1 FROM clients WHERE LOWER(wallet_address) = $1 LIMIT 1', [address]),
  ]);
  if (devRow.rowCount && devRow.rowCount > 0) roles.push('developer');
  if (clientRow.rowCount && clientRow.rowCount > 0) roles.push('client');
  if (getAdminAddresses().includes(address)) roles.push('admin');
  return roles;
}

export default router;
