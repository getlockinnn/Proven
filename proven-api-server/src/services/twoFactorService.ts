import { authenticator } from 'otplib';
import * as crypto from 'crypto';
import QRCode from 'qrcode';
import prisma from '../lib/prisma';

// Configure authenticator
authenticator.options = {
  window: 1, // Allow 1 step before/after for clock drift
  step: 30, // 30 second intervals
};

const ENCRYPTION_KEY = process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-key-change-me';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a string using AES-256-GCM
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM
 */
function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a new TOTP secret and QR code for a user
 */
export async function generateSecret(email: string): Promise<{
  secret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
}> {
  const secret = authenticator.generateSecret();
  const appName = 'Proven Admin';

  const otpauthUrl = authenticator.keyuri(email, appName, secret);

  // Generate QR code as base64 data URL using qrcode library
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
    width: 200,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  return {
    secret,
    otpauthUrl,
    qrCodeUrl,
  };
}

/**
 * Verify a TOTP token
 */
export function verifyToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Generate backup codes for account recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Setup 2FA for a user - generates secret and backup codes
 */
export async function setup2FA(userId: string): Promise<{
  secret: string;
  otpauthUrl: string;
  qrCodeUrl: string;
  backupCodes: string[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorEnabled: true },
  });

  if (!user || !user.email) {
    throw new Error('User not found or email not set');
  }

  if (user.twoFactorEnabled) {
    throw new Error('2FA is already enabled for this account');
  }

  const { secret, otpauthUrl, qrCodeUrl } = await generateSecret(user.email);
  const backupCodes = generateBackupCodes();

  // Encrypt secret and backup codes before storing
  const encryptedSecret = encrypt(secret);
  const encryptedBackupCodes = backupCodes.map((code) => encrypt(code));

  // Store encrypted secret (but don't enable yet - wait for verification)
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: encryptedSecret,
      twoFactorBackupCodes: encryptedBackupCodes,
      // twoFactorEnabled remains false until verified
    },
  });

  return {
    secret,
    otpauthUrl,
    qrCodeUrl,
    backupCodes,
  };
}

/**
 * Verify and enable 2FA for a user
 */
export async function verify2FASetup(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });

  if (!user || !user.twoFactorSecret) {
    throw new Error('2FA setup not initiated');
  }

  if (user.twoFactorEnabled) {
    throw new Error('2FA is already enabled');
  }

  // Decrypt and verify
  const secret = decrypt(user.twoFactorSecret);
  const isValid = verifyToken(secret, token);

  if (isValid) {
    // Enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  return isValid;
}

/**
 * Verify 2FA token during login
 */
export async function verify2FALogin(userId: string, token: string): Promise<{
  valid: boolean;
  usedBackupCode: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorSecret: true,
      twoFactorEnabled: true,
      twoFactorBackupCodes: true,
    },
  });

  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new Error('2FA not enabled for this user');
  }

  // First try TOTP token
  const secret = decrypt(user.twoFactorSecret);
  if (verifyToken(secret, token)) {
    return { valid: true, usedBackupCode: false };
  }

  // Try backup codes
  const normalizedToken = token.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
    try {
      const decryptedCode = decrypt(user.twoFactorBackupCodes[i]);
      const normalizedCode = decryptedCode.replace(/-/g, '');

      if (normalizedCode === normalizedToken) {
        // Remove used backup code
        const updatedCodes = [...user.twoFactorBackupCodes];
        updatedCodes.splice(i, 1);

        await prisma.user.update({
          where: { id: userId },
          data: { twoFactorBackupCodes: updatedCodes },
        });

        return { valid: true, usedBackupCode: true };
      }
    } catch {
      // Skip invalid codes
    }
  }

  return { valid: false, usedBackupCode: false };
}

/**
 * Disable 2FA for a user
 */
export async function disable2FA(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      twoFactorBackupCodes: [],
    },
  });
}

/**
 * Regenerate backup codes for a user
 */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });

  if (!user || !user.twoFactorEnabled) {
    throw new Error('2FA must be enabled to regenerate backup codes');
  }

  const backupCodes = generateBackupCodes();
  const encryptedBackupCodes = backupCodes.map((code) => encrypt(code));

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorBackupCodes: encryptedBackupCodes },
  });

  return backupCodes;
}

/**
 * Check if user has 2FA enabled
 */
export async function is2FAEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });

  return user?.twoFactorEnabled || false;
}
