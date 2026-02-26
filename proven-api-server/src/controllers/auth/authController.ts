import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedRequest } from "../../middleware/authMiddleware";

const prisma = new PrismaClient();
const SUPABASE_URL =
  process.env.SUPABASE_URL;

// JWKS will be created dynamically when needed
let JWKS: any = null;

async function getJWKS() {
  if (!JWKS) {
    const { createRemoteJWKSet } = await import("jose");
    JWKS = createRemoteJWKSet(
      new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return JWKS;
}

/**
 * Save user data from Supabase authentication to our database
 * This endpoint is called when a user signs in via Supabase.
 * Now requires authentication - user data is extracted from the verified JWT token.
 */
export const saveUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // User is verified by the authenticate middleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Please sign in to access this feature.",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    // Use authenticated user data from JWT (trusted), with optional metadata from body
    const bodyUser = req.body?.user;
    const userMetadata = bodyUser?.user_metadata;

    const fullName = req.user.name || userMetadata?.full_name || userMetadata?.name || "";
    const firstName = fullName.split(' ')[0]; // Extract first name for default preferredName

    const userData = {
      id: req.user.id,
      email: req.user.email,
      name: fullName,
      preferredName: firstName,
      image: req.user.image || userMetadata?.avatar_url || userMetadata?.picture || "",
    };

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userData.id },
    });

    let savedUser;
    if (existingUser) {
      // Update existing user - only update preferredName if not already set
      savedUser = await prisma.user.update({
        where: { id: userData.id },
        data: {
          email: userData.email,
          name: userData.name,
          image: userData.image,
          // Only set preferredName if it's not already set (user hasn't customized it)
          preferredName: existingUser.preferredName || userData.preferredName,
        },
      });
    } else {
      // Create new user with default preferredName
      savedUser = await prisma.user.create({
        data: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          preferredName: userData.preferredName,
          image: userData.image,
        },
      });
    }

    // Simplified response - no token generation needed
    res.status(200).json({
      success: true,
      message: "User saved successfully",
      user: savedUser,
    });
    return;
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).json({
      success: false,
      message: "We couldn't complete your sign-in right now. Please try again.",
      code: "SAVE_USER_FAILED",
    });
    return;
  }
};

/**
 * Verify a Supabase JWT token and return the user data
 */
export const verifyToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: "Please provide an authentication token.",
        code: "TOKEN_REQUIRED",
      });
      return;
    }

    try {
      // Verify the Supabase JWT token
      const { jwtVerify } = await import("jose");
      const jwks = await getJWKS();
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `${SUPABASE_URL}/auth/v1`,
        audience: "authenticated",
      });

      res.status(200).json({
        success: true,
        message: "Token is valid",
        user: {
          id: payload.sub,
          email: payload.email,
          // Add other user data from payload if needed
        },
      });
      return;
    } catch (jwtError) {
      res.status(401).json({
        success: false,
        message: "Your session has expired. Please sign in again.",
        code: "SESSION_EXPIRED",
      });
      return;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "We couldn't verify your session. Please try signing in again.",
      code: "VERIFICATION_ERROR",
    });
    return;
  }
};

/**
 * Get the current authenticated user's profile
 */
export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // User is already attached to the request by the authenticate middleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Please sign in to view your profile.",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: req.user,
    });
    return;
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "We couldn't load your profile right now. Please try again.",
      code: "PROFILE_ERROR",
    });
    return;
  }
};
