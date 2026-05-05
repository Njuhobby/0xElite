/**
 * Read admin addresses from env at call time (not module load) so tests
 * and runtime config changes are picked up. Used by /api/auth/login when
 * resolving roles for the JWT payload.
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
