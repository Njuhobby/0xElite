import { Request, Response, NextFunction } from 'express';
import { AuthClaims, shouldRotate, signToken, verifyToken } from '../../utils/jwt';

export interface AuthenticatedRequest extends Request {
  user?: { address: string; roles: string[]; claims: AuthClaims };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'NO_TOKEN',
      message: 'Missing or malformed Authorization header',
    });
  }
  const token = auth.slice(7);
  let claims: AuthClaims;
  try {
    claims = verifyToken(token);
  } catch {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Token invalid or expired',
    });
  }
  req.user = { address: claims.sub, roles: claims.roles, claims };

  if (shouldRotate(claims)) {
    const fresh = signToken(claims.sub, claims.roles);
    res.setHeader('X-New-Token', fresh);
  }
  next();
}

export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Login required' });
    }
    if (!req.user.roles.includes(role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Requires ${role} role`,
      });
    }
    next();
  };
}
