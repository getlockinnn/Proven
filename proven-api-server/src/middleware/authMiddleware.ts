import { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { verifyProvenAccessToken } from "../services/provenAuthToken";

// Valid client types that can identify themselves
export type ClientType = 'proven-app' | 'proven-guardian' | 'unknown';

// Extended Request interface with user property
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
    image?: string;
    role?: string;
    isAdmin?: boolean;
  };
  clientType?: ClientType;
}

/**
 * Extract and validate the client type from X-Client-Type header
 */
function getClientType(req: Request): ClientType {
  const clientHeader = req.headers['x-client-type'];
  if (clientHeader === 'proven-app' || clientHeader === 'proven-guardian') {
    return clientHeader;
  }
  return 'unknown';
}

/**
 * Authentication middleware - verifies Supabase JWT token
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract client type
    req.clientType = getClientType(req);

    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Please sign in to access this feature.",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Please sign in to access this feature.",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    // 1) First-party (Proven) access token
    try {
      const claims = verifyProvenAccessToken(token);
      const userId = typeof claims.sub === "string" ? claims.sub : null;
      if (!userId) throw new Error("Invalid token subject");

      req.user = {
        id: userId,
        email: claims.email || "",
        name: claims.name,
        image: claims.image,
        isAdmin: !!claims.isAdmin,
      };

      next();
      return;
    } catch {
      // Fall through to legacy Supabase token verification.
    }

    // 2) Legacy Supabase access token (guardian)
    const supabaseSecret = process.env.SUPABASE_JWT_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseSecret || !supabaseUrl) {
      res.status(401).json({
        success: false,
        message: "Your session has expired. Please sign in again to continue.",
        code: "SESSION_EXPIRED",
      });
      return;
    }

    const issuer = `${supabaseUrl}/auth/v1`;

    type SupabaseClaims = JwtPayload & {
      sub?: string;
      email?: string;
      role?: string;
      user_metadata?: {
        full_name?: string;
        name?: string;
        avatar_url?: string;
        picture?: string;
      };
    };

    let supabaseClaims: SupabaseClaims | null = null;
    try {
      const verified = jwt.verify(token, supabaseSecret, {
        issuer,
        audience: "authenticated",
      });
      if (typeof verified !== "string") supabaseClaims = verified as SupabaseClaims;
    } catch {
      // Some older tokens may not have an audience; try without it.
      try {
        const verified = jwt.verify(token, supabaseSecret, { issuer });
        if (typeof verified !== "string") supabaseClaims = verified as SupabaseClaims;
      } catch {
        supabaseClaims = null;
      }
    }

    if (!supabaseClaims?.sub) {
      res.status(401).json({
        success: false,
        message: "Your session has expired. Please sign in again to continue.",
        code: "SESSION_EXPIRED",
      });
      return;
    }

    const role = supabaseClaims.role;
    const isAdmin = !!role && ["admin", "ADMIN"].includes(String(role).toLowerCase());

    req.user = {
      id: supabaseClaims.sub,
      email: supabaseClaims.email || "",
      name: supabaseClaims.user_metadata?.full_name || supabaseClaims.user_metadata?.name,
      image: supabaseClaims.user_metadata?.avatar_url || supabaseClaims.user_metadata?.picture,
      role,
      isAdmin,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      success: false,
      message: "Your session has expired. Please sign in again to continue.",
      code: "SESSION_EXPIRED",
    });
  }
};

/**
 * Optional authentication middleware - attaches user if token provided, otherwise continues
 */
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract client type
    req.clientType = getClientType(req);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return next();
    }

    // First-party token
    try {
      const claims = verifyProvenAccessToken(token);
      const userId = typeof claims.sub === "string" ? claims.sub : null;
      if (userId) {
        req.user = {
          id: userId,
          email: claims.email || "",
          name: claims.name,
          image: claims.image,
          isAdmin: !!claims.isAdmin,
        };
        return next();
      }
    } catch {
      // Fall through
    }

    // Legacy Supabase token
    const supabaseSecret = process.env.SUPABASE_JWT_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    if (supabaseSecret && supabaseUrl) {
      const issuer = `${supabaseUrl}/auth/v1`;
      try {
        const verified = jwt.verify(token, supabaseSecret, {
          issuer,
          audience: "authenticated",
        });
        if (typeof verified !== "string") {
          const claims = verified as JwtPayload & any;
          if (typeof claims.sub === "string") {
            const role = claims.role;
            const isAdmin =
              !!role && ["admin", "ADMIN"].includes(String(role).toLowerCase());

            req.user = {
              id: claims.sub,
              email: claims.email || "",
              name: claims.user_metadata?.full_name || claims.user_metadata?.name,
              image: claims.user_metadata?.avatar_url || claims.user_metadata?.picture,
              role,
              isAdmin,
            };
          }
        }
      } catch {
        // ignore
      }
    }

    next();
  } catch {
    // Silently continue without authentication
    next();
  }
};

/**
 * Generate a JWT token for a user (legacy - keeping for backward compatibility)
 */
export const generateToken = (userId: string): string => {
  return "";
};
