import jwt from 'jsonwebtoken';

function loadSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set (≥32 chars) in production');
  }
  console.warn('⚠ JWT_SECRET unset or too short — using dev fallback. Do NOT ship like this.');
  return 'dev-secret-not-for-production-use-only-locally-1234567890';
}

const SECRET = loadSecret();
export const TTL_SECONDS = 7 * 24 * 60 * 60;
const SLIDING_THRESHOLD_RATIO = 0.5;

export interface AuthClaims {
  sub: string;
  roles: string[];
  iat: number;
  exp: number;
}

export function signToken(address: string, roles: string[]): string {
  return jwt.sign({ sub: address.toLowerCase(), roles }, SECRET, { expiresIn: TTL_SECONDS });
}

export function verifyToken(token: string): AuthClaims {
  return jwt.verify(token, SECRET) as AuthClaims;
}

export function shouldRotate(claims: AuthClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  const remaining = claims.exp - now;
  const total = claims.exp - claims.iat;
  return remaining > 0 && remaining < total * SLIDING_THRESHOLD_RATIO;
}
