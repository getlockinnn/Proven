import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { config } from '../config';

export type ProvenAccessTokenClaims = JwtPayload & {
  typ: 'proven_access';
  email?: string;
  name?: string;
  image?: string;
  isAdmin?: boolean;
};

export function signProvenAccessToken(input: {
  userId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  isAdmin?: boolean | null;
}): string {
  const payload: Omit<ProvenAccessTokenClaims, keyof JwtPayload> = {
    typ: 'proven_access',
    ...(input.email ? { email: input.email } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(input.image ? { image: input.image } : {}),
    ...(typeof input.isAdmin === 'boolean' ? { isAdmin: input.isAdmin } : {}),
  };

  const opts: SignOptions = {
    subject: input.userId,
    issuer: 'proven-backend',
    audience: 'proven',
    // `jsonwebtoken` typings require a restricted `StringValue` (from `ms`), but our config is env-driven.
    expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, config.jwt.secret, opts);
}

export function verifyProvenAccessToken(token: string): ProvenAccessTokenClaims {
  const decoded = jwt.verify(token, config.jwt.secret, {
    issuer: 'proven-backend',
    audience: 'proven',
  });

  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }

  const claims = decoded as ProvenAccessTokenClaims;
  if (claims.typ !== 'proven_access') {
    throw new Error('Invalid token type');
  }

  return claims;
}
