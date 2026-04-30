import { verifySignature } from './signature';

/**
 * Read admin addresses from env at call time (not module load) so tests
 * and runtime config changes are picked up.
 */
export function getAdminAddresses(): string[] {
  const raw = process.env.ADMIN_ADDRESSES || '';
  return raw
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.length > 0);
}

export function isAdmin(address: string): boolean {
  return getAdminAddresses().includes(address.toLowerCase());
}

export interface AdminAuthError {
  status: number;
  code: string;
  message: string;
}

export interface AdminAuthResult {
  valid: boolean;
  error?: AdminAuthError;
}

/**
 * Verify the caller proves wallet ownership AND is in the admin allowlist.
 * Returns 401 for bad signature, 403 for non-admin.
 */
export function verifyAdmin(
  address: string,
  message: string,
  signature: string
): AdminAuthResult {
  if (!verifySignature(message, signature, address)) {
    return {
      valid: false,
      error: {
        status: 401,
        code: 'INVALID_SIGNATURE',
        message: 'Wallet signature verification failed',
      },
    };
  }

  if (!isAdmin(address)) {
    return {
      valid: false,
      error: {
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only admin wallets can perform this action',
      },
    };
  }

  return { valid: true };
}
