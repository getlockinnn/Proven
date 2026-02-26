/**
 * Centralized user-facing error messages
 *
 * Guidelines for writing error messages:
 * - Be empathetic and polite (avoid blaming the user)
 * - Explain what went wrong in simple terms
 * - Provide actionable next steps when possible
 * - Avoid technical jargon (no "token", "ID", "exception", etc.)
 * - Keep messages concise but helpful
 */

export const ErrorMessages = {
  // ============================================
  // AUTHENTICATION
  // ============================================
  AUTH: {
    REQUIRED: 'Please sign in to access this feature.',
    SESSION_EXPIRED: 'Your session has expired. Please sign in again to continue.',
    INVALID_CREDENTIALS: "We couldn't verify your identity. Please sign in again.",
    SIGN_IN_FAILED: 'Unable to sign in. Please try again.',
    SIGN_OUT_FAILED: "We couldn't sign you out. Please try again.",
    TOKEN_REQUIRED: 'Please provide a valid authentication token.',
    USER_DATA_REQUIRED: 'User information is required to complete this action.',
    PROFILE_FETCH_FAILED: "We couldn't load your profile. Please try again.",
    PROFILE_SAVE_FAILED: "We couldn't save your profile. Please try again.",
  },

  // ============================================
  // AUTHORIZATION & ACCESS
  // ============================================
  ACCESS: {
    ADMIN_REQUIRED:
      'This feature requires administrator access. If you believe you should have access, please contact support.',
    INSUFFICIENT_ROLE:
      "You don't have sufficient permissions for this action. Please contact a senior administrator if you need access.",
    FORBIDDEN: "You don't have permission to perform this action.",
    TWO_FACTOR_SETUP_REQUIRED:
      'For security, please enable two-factor authentication to access admin features.',
    TWO_FACTOR_VERIFY_REQUIRED:
      'Please verify your identity with your authenticator app to continue.',
    VERIFICATION_ERROR: 'We encountered an issue verifying your access. Please try again.',
  },

  // ============================================
  // CHALLENGES
  // ============================================
  CHALLENGE: {
    NOT_FOUND:
      "We couldn't find this challenge. It may have been removed or the link is incorrect.",
    ALREADY_JOINED: "You've already joined this challenge. Check your active challenges to continue.",
    ALREADY_STARTED:
      'This challenge has already started. Keep an eye out for upcoming challenges you can join!',
    NOT_STARTED: "Your challenge hasn't started yet. You'll be able to submit proof once it begins.",
    ENDED: 'The submission period for this challenge has ended.',
    JOIN_FAILED:
      "We couldn't add you to this challenge right now. Please try again, and if the problem continues, contact support.",
    ESCROW_NOT_CONFIGURED:
      "This challenge isn't fully set up yet. Please try again later or contact support if the issue persists.",
    CREATE_FAILED: "We couldn't create this challenge. Please try again.",
    UPDATE_FAILED: "We couldn't update this challenge. Please try again.",
    DELETE_FAILED: "We couldn't delete this challenge. Please try again.",
    PAUSE_FAILED: "We couldn't pause this challenge. Please try again.",
    INVALID_STATE: 'This challenge is not in a valid state for this action.',
    INVALID_TIMELINE:
      'The challenge dates are invalid. Start date must be in the future and end date must be after start date.',
  },

  // ============================================
  // WALLET & TRANSACTIONS
  // ============================================
  WALLET: {
    REQUIRED: 'Please connect your wallet to continue.',
    INVALID_ADDRESS: 'The wallet address provided is not valid. Please check and try again.',
    TRANSACTION_REQUIRED: 'Please complete the transaction in your wallet before continuing.',
    VERIFICATION_FAILED:
      "We couldn't verify your payment. Please make sure you sent the exact amount and try again.",
    VERIFICATION_ERROR: "We couldn't verify your payment. Please check your wallet and try again.",
    INSUFFICIENT_BALANCE:
      "You don't have enough funds to complete this action. Please add funds to your wallet.",
    TRANSACTION_FAILED: 'The transaction failed. Please try again.',
  },

  // ============================================
  // PROOF SUBMISSION
  // ============================================
  PROOF: {
    MISSING_FIELDS: 'Please provide both the challenge and proof image to continue.',
    NOT_ENROLLED: 'You need to join this challenge before submitting proof.',
    ALREADY_SUBMITTED: "You've already submitted proof for today. Great job staying on track!",
    SUBMISSION_FAILED:
      "We couldn't save your proof right now. Please check your connection and try again.",
    NOT_FOUND: "We couldn't find this submission. It may have been removed.",
    ALREADY_REVIEWED: 'This submission has already been reviewed.',
    APPROVE_FAILED: "We couldn't approve this proof. Please try again.",
    REJECT_FAILED: "We couldn't reject this proof. Please try again.",
    FLAG_FAILED: "We couldn't flag this proof. Please try again.",
  },

  // ============================================
  // REWARDS
  // ============================================
  REWARDS: {
    NOT_AVAILABLE:
      "Rewards aren't available yet. Complete the challenge requirements to unlock your payout.",
    NOT_FOUND:
      "We couldn't find your reward information. If you believe this is an error, please contact support.",
    CLAIM_FAILED: "We couldn't process your reward. Please try again later.",
    FETCH_FAILED: "We couldn't load your reward information right now. Please try again later.",
  },

  // ============================================
  // USER MANAGEMENT
  // ============================================
  USER: {
    NOT_FOUND: "We couldn't find this user.",
    ALREADY_BLOCKED: 'This user is already blocked.',
    BLOCK_FAILED: "We couldn't block this user. Please try again.",
    UNBLOCK_FAILED: "We couldn't unblock this user. Please try again.",
    FLAG_FAILED: "We couldn't flag this user. Please try again.",
    UPDATE_FAILED: "We couldn't update this user. Please try again.",
    INVALID_EMAIL: 'Please provide a valid email address.',
  },

  // ============================================
  // VALIDATION
  // ============================================
  VALIDATION: {
    FAILED: 'Please check your input and try again.',
    INVALID_INPUT: "The information you provided isn't quite right. Please check and try again.",
    MISSING_REQUIRED: 'Please fill in all required fields.',
    INVALID_FORMAT: 'The format is incorrect. Please check and try again.',
  },

  // ============================================
  // RATE LIMITING
  // ============================================
  RATE_LIMIT: {
    TOO_MANY_REQUESTS: "You're doing that too quickly. Please wait a moment and try again.",
    FAUCET_COOLDOWN: "You've recently requested funds. Please wait before requesting again.",
  },

  // ============================================
  // SERVER & SYSTEM
  // ============================================
  SERVER: {
    INTERNAL_ERROR:
      'Something went wrong on our end. Please try again, and if the problem continues, contact support.',
    NOT_FOUND:
      "The page you're looking for doesn't exist. Please check the URL or go back to the home page.",
    SERVICE_UNAVAILABLE: "We're experiencing technical difficulties. Please try again in a few minutes.",
    DATABASE_ERROR: "We're having trouble accessing our database. Please try again.",
  },

  // ============================================
  // FAUCET (Development)
  // ============================================
  FAUCET: {
    DISABLED_PRODUCTION: 'This feature is not available in production.',
    DEPLETED: 'The faucet is temporarily empty. Please try again later.',
    INVALID_AMOUNT: 'Please request between 1 and 1000 USDC.',
    STATUS_ERROR: "We couldn't check the faucet status. Please try again.",
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================
  NOTIFICATIONS: {
    REGISTER_FAILED: "We couldn't register your device for notifications. Please try again.",
    SEND_FAILED: "We couldn't send the notification. Please try again.",
    PREFERENCES_FAILED: "We couldn't update your notification preferences. Please try again.",
  },

  // ============================================
  // LEADERBOARD
  // ============================================
  LEADERBOARD: {
    FETCH_FAILED: "We couldn't load the leaderboard right now. Please try again.",
  },
} as const;

/**
 * Error codes for programmatic handling
 * These codes can be used by frontend to show specific UI or take actions
 */
export const ErrorCodes = {
  // Auth
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Access
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
  FORBIDDEN: 'FORBIDDEN',
  TWO_FACTOR_SETUP_REQUIRED: '2FA_SETUP_REQUIRED',
  TWO_FACTOR_VERIFY_REQUIRED: '2FA_VERIFICATION_REQUIRED',

  // Challenges
  CHALLENGE_NOT_FOUND: 'CHALLENGE_NOT_FOUND',
  CHALLENGE_STARTED: 'CHALLENGE_STARTED',
  CHALLENGE_ENDED: 'CHALLENGE_ENDED',
  CHALLENGE_NOT_STARTED: 'CHALLENGE_NOT_STARTED',
  ALREADY_JOINED: 'ALREADY_JOINED',

  // Wallet & Transactions
  WALLET_REQUIRED: 'WALLET_REQUIRED',
  TRANSACTION_REQUIRED: 'TRANSACTION_REQUIRED',
  TRANSFER_VERIFICATION_FAILED: 'TRANSFER_VERIFICATION_FAILED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',

  // Proof
  NOT_ENROLLED: 'NOT_ENROLLED',
  ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
  SUBMISSION_FAILED: 'SUBMISSION_FAILED',
  PROOF_NOT_FOUND: 'PROOF_NOT_FOUND',
  ALREADY_REVIEWED: 'ALREADY_REVIEWED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  VERIFICATION_ERROR: 'VERIFICATION_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
