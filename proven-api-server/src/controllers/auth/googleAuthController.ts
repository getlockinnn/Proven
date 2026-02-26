import type { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import prisma from '../../lib/prisma';
import { config } from '../../config';
import { signProvenAccessToken } from '../../services/provenAuthToken';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

type GoogleOAuthStateClaims = {
  typ: 'google_oauth_state';
  redirectUri: string;
  appState: string;
};

let googleJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getGoogleJwks() {
  if (!googleJwks) {
    googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return googleJwks;
}

function getOrigin(req: Request): string {
  // `trust proxy` is enabled; protocol should respect X-Forwarded-Proto.
  const protocol = req.protocol || 'http';
  const host = req.get('host');
  return `${protocol}://${host}`;
}

function parseOrigin(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Accept full URLs (with optional paths) and also host:port.
  const candidates = raw.includes('://') ? [raw] : [`https://${raw}`, `http://${raw}`];
  for (const c of candidates) {
    try {
      return new URL(c).origin;
    } catch {
      // keep trying
    }
  }
  return null;
}

function getPublicOrigin(req: Request): string {
  // Google blocks OAuth redirect URIs that point to private/LAN IPs.
  // Allow overriding the callback origin (e.g. localhost for simulator, or an HTTPS tunnel for devices).
  const configured =
    process.env.PUBLIC_BASE_URL ||
    process.env.OAUTH_PUBLIC_BASE_URL ||
    process.env.AUTH_PUBLIC_BASE_URL;

  const origin = configured ? parseOrigin(configured) : null;
  return origin || getOrigin(req);
}

function getGoogleClient() {
  const clientId = config.oauth.google.clientId;
  const clientSecret = config.oauth.google.secret;
  return { clientId, clientSecret };
}

function isAllowedRedirectUri(redirectUri: string, reqOrigin: string): boolean {
  try {
    const u = new URL(redirectUri);

    const allowExpoRedirects =
      config.isDevelopment || process.env.ALLOW_EXPO_REDIRECTS === 'true';

    // Expo Go deep links (dev or explicitly enabled): exp://<host>:<port>/--/auth/callback
    // We only allow paths that end with `/auth/callback` to avoid open redirects.
    if (allowExpoRedirects && (u.protocol === 'exp:' || u.protocol === 'exps:')) {
      return u.pathname.endsWith('/auth/callback') || u.pathname.endsWith('/auth/callback/');
    }

    // Mobile app deep link
    if (u.protocol === 'provenapp:') {
      return (
        u.host === 'auth' &&
        (u.pathname === '/callback' || u.pathname === '/callback/')
      );
    }

    // Web callbacks (if ever used): restrict to known origins.
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const allowed = new Set<string>(
        config.isDevelopment
          ? [
              'http://localhost:8080',
              'http://localhost:5173',
              'http://localhost:3000',
              'http://127.0.0.1:8080',
              reqOrigin,
            ]
          : (process.env.CORS_ORIGINS?.split(',') || []).map((s) => s.trim()).filter(Boolean)
      );
      return allowed.has(u.origin) && u.pathname.startsWith('/auth/callback');
    }

    return false;
  } catch {
    return false;
  }
}

function signGoogleOAuthState(input: GoogleOAuthStateClaims): string {
  return jwt.sign(input, config.jwt.secret, {
    issuer: 'proven-backend',
    audience: 'google_oauth_state',
    expiresIn: '15m',
  });
}

function verifyGoogleOAuthState(token: string): GoogleOAuthStateClaims {
  const decoded = jwt.verify(token, config.jwt.secret, {
    issuer: 'proven-backend',
    audience: 'google_oauth_state',
  });

  if (typeof decoded === 'string') {
    throw new Error('Invalid OAuth state');
  }

  const claims = decoded as Partial<GoogleOAuthStateClaims>;
  if (claims.typ !== 'google_oauth_state' || !claims.redirectUri || !claims.appState) {
    throw new Error('Invalid OAuth state');
  }
  return claims as GoogleOAuthStateClaims;
}

async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
}> {
  const body = new URLSearchParams();
  body.set('code', input.code);
  body.set('client_id', input.clientId);
  body.set('client_secret', input.clientSecret);
  body.set('redirect_uri', input.redirectUri);
  body.set('grant_type', 'authorization_code');

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = (await resp.json().catch(() => null)) as any;
  if (!resp.ok) {
    const msg = json?.error_description || json?.error || 'Failed to exchange Google code';
    throw new Error(msg);
  }

  return json;
}

async function verifyGoogleIdToken(input: {
  idToken: string;
  clientId: string;
}): Promise<JWTPayload> {
  const { payload } = await jwtVerify(input.idToken, getGoogleJwks(), {
    audience: input.clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });
  return payload;
}

function redirectWithParams(base: string, params: Record<string, string | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.length > 0) {
      u.searchParams.set(k, v);
    }
  }
  return u.toString();
}

export async function startGoogleAuth(req: Request, res: Response) {
  try {
    const redirectUri = typeof req.query.redirect_uri === 'string' ? req.query.redirect_uri : undefined;
    const appState = typeof req.query.state === 'string' ? req.query.state : undefined;

	    if (!redirectUri || !appState) {
	      res.status(400).json({
	        success: false,
	        message: 'redirect_uri and state are required',
	        code: 'VALIDATION_ERROR',
      });
	      return;
	    }

	    const requestOrigin = getOrigin(req);
	    if (!isAllowedRedirectUri(redirectUri, requestOrigin)) {
	      res.status(400).json({
	        success: false,
	        message: 'Invalid redirect_uri',
	        code: 'VALIDATION_ERROR',
      });
	      return;
	    }

    const { clientId } = getGoogleClient();
    if (!clientId) {
      res.status(500).json({
        success: false,
        message: 'Google OAuth is not configured (missing google_client_id).',
        code: 'OAUTH_NOT_CONFIGURED',
      });
      return;
    }

	    const callbackUrl = `${getPublicOrigin(req)}/api/auth/google/callback`;
	    const signedState = signGoogleOAuthState({
	      typ: 'google_oauth_state',
	      redirectUri,
	      appState,
	    });

    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('redirect_uri', callbackUrl);
    params.set('response_type', 'code');
    params.set('scope', 'openid email profile');
    params.set('state', signedState);
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');

    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    return;
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to start Google auth',
      code: 'OAUTH_START_FAILED',
    });
  }
}

export async function googleAuthCallback(req: Request, res: Response) {
  const origin = getOrigin(req);
  const fallbackAppRedirect = 'provenapp://auth/callback';

  let appRedirectUri = fallbackAppRedirect;
  let appState = '';

  try {
    const stateToken = typeof req.query.state === 'string' ? req.query.state : undefined;
    if (!stateToken) {
      res.status(400).send('Missing state');
      return;
    }

    const verifiedState = verifyGoogleOAuthState(stateToken);
    appRedirectUri = verifiedState.redirectUri;
    appState = verifiedState.appState;

    if (!isAllowedRedirectUri(appRedirectUri, origin)) {
      res.status(400).send('Invalid redirect');
      return;
    }

    const error = typeof req.query.error === 'string' ? req.query.error : undefined;
    const errorDescription =
      typeof req.query.error_description === 'string' ? req.query.error_description : undefined;

    if (error) {
      res.redirect(
        redirectWithParams(appRedirectUri, {
          error,
          error_description: errorDescription || 'Google sign-in failed',
          state: appState,
        })
      );
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    if (!code) {
      res.redirect(
        redirectWithParams(appRedirectUri, {
          error: 'missing_code',
          error_description: 'Missing authorization code',
          state: appState,
        })
      );
      return;
    }

    const { clientId, clientSecret } = getGoogleClient();
    if (!clientId || !clientSecret) {
      res.redirect(
        redirectWithParams(appRedirectUri, {
          error: 'oauth_not_configured',
          error_description: 'Google OAuth is not configured on the server.',
          state: appState,
        })
      );
      return;
    }

    const callbackUrl = `${getPublicOrigin(req)}/api/auth/google/callback`;
    const tokenRes = await exchangeGoogleCode({
      code,
      redirectUri: callbackUrl,
      clientId,
      clientSecret,
    });

    if (!tokenRes.id_token) {
      throw new Error('Google did not return an id_token');
    }

    const idTokenPayload = await verifyGoogleIdToken({ idToken: tokenRes.id_token, clientId });

    const googleSub = typeof idTokenPayload.sub === 'string' ? idTokenPayload.sub : null;
    const email = typeof idTokenPayload.email === 'string' ? idTokenPayload.email : null;
    const emailVerified = idTokenPayload.email_verified === true;
    const name = typeof idTokenPayload.name === 'string' ? idTokenPayload.name : null;
    const picture = typeof idTokenPayload.picture === 'string' ? idTokenPayload.picture : null;

    if (!googleSub) {
      throw new Error('Invalid Google id_token (missing sub)');
    }

    if (!email) {
      throw new Error('Google account did not provide an email address');
    }

    if (!emailVerified) {
      throw new Error('Google email is not verified');
    }

    // Find existing account or user, then upsert.
    const existingAccount = await prisma.account.findFirst({
      where: { provider: 'google', providerAccountId: googleSub },
      select: { userId: true },
    });

    const existingUserByEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    const userId = existingAccount?.userId || existingUserByEmail?.id;

    const user = userId
      ? await prisma.user.update({
          where: { id: userId },
          data: {
            email,
            name: name || undefined,
            image: picture || undefined,
          },
        })
      : await prisma.user.create({
          data: {
            email,
            name: name || undefined,
            preferredName: name ? name.split(' ')[0] : undefined,
            image: picture || undefined,
          },
        });

    // Upsert account row (NextAuth-compatible schema, but we use it for linkage).
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: googleSub,
        },
      },
      update: {
        access_token: tokenRes.access_token,
        refresh_token: tokenRes.refresh_token,
        id_token: tokenRes.id_token,
        expires_at: Math.floor(Date.now() / 1000) + (tokenRes.expires_in || 0),
        token_type: tokenRes.token_type,
        scope: tokenRes.scope,
        userId: user.id,
        type: 'oauth',
      },
      create: {
        userId: user.id,
        type: 'oauth',
        provider: 'google',
        providerAccountId: googleSub,
        access_token: tokenRes.access_token,
        refresh_token: tokenRes.refresh_token,
        id_token: tokenRes.id_token,
        expires_at: Math.floor(Date.now() / 1000) + (tokenRes.expires_in || 0),
        token_type: tokenRes.token_type,
        scope: tokenRes.scope,
      },
    });

    // Issue a short-lived one-time exchange code.
    const exchangeCode = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + 2 * 60 * 1000);

    await prisma.verificationToken.create({
      data: {
        identifier: user.id,
        token: exchangeCode,
        expires,
      },
    });

    res.redirect(
      redirectWithParams(appRedirectUri, {
        code: exchangeCode,
        state: appState,
      })
    );
    return;
  } catch (error: any) {
    const msg = error?.message || 'Google sign-in failed';
    // Best effort: return to app with a useful error.
    res.redirect(
      redirectWithParams(appRedirectUri || fallbackAppRedirect, {
        error: 'oauth_failed',
        error_description: msg,
        state: appState || undefined,
      })
    );
  }
}

export async function exchangeGoogleAuthCode(req: Request, res: Response) {
  try {
    const code = (req.body as any)?.code;
    if (!code || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        message: 'code is required',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const vt = await prisma.verificationToken.findUnique({
      where: { token: code },
    });

    if (!vt) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired code',
        code: 'INVALID_CODE',
      });
      return;
    }

    if (vt.expires.getTime() <= Date.now()) {
      await prisma.verificationToken.delete({ where: { token: code } }).catch(() => {});
      res.status(400).json({
        success: false,
        message: 'Invalid or expired code',
        code: 'INVALID_CODE',
      });
      return;
    }

    // One-time use.
    await prisma.verificationToken.delete({ where: { token: code } });

    const user = await prisma.user.findUnique({
      where: { id: vt.identifier },
      select: { id: true, email: true, name: true, image: true, isAdmin: true },
    });

    if (!user) {
      res.status(400).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    const accessToken = signProvenAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isAdmin: user.isAdmin,
    });

    res.json({ accessToken });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to exchange code',
      code: 'EXCHANGE_FAILED',
    });
  }
}
