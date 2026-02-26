import prisma from '../lib/prisma';
import { AdminRoleType } from '@prisma/client';
import { logAdminAction } from './auditService';

export interface AdminInfo {
  userId: string;
  email: string;
  role: AdminRoleType;
  isActive: boolean;
  twoFactorEnabled: boolean;
  grantedAt: Date;
}

/**
 * Check if a user is an admin (database-backed)
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const adminRole = await prisma.adminRole.findUnique({
    where: { userId },
    select: { isActive: true },
  });

  return adminRole?.isActive === true;
}

/**
 * Get admin role details for a user
 */
export async function getAdminRole(userId: string): Promise<AdminInfo | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      adminRole: true,
    },
  });

  if (!user || !user.adminRole || !user.adminRole.isActive) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email || '',
    role: user.adminRole.role,
    isActive: user.adminRole.isActive,
    twoFactorEnabled: user.twoFactorEnabled,
    grantedAt: user.adminRole.grantedAt,
  };
}

/**
 * Grant admin role to a user
 */
export async function grantAdminRole(
  targetUserId: string,
  role: AdminRoleType,
  grantedByUserId: string
): Promise<void> {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true },
  });

  if (!targetUser) {
    throw new Error('User not found');
  }

  // Check if already has a role
  const existingRole = await prisma.adminRole.findUnique({
    where: { userId: targetUserId },
  });

  if (existingRole && existingRole.isActive) {
    throw new Error('User already has an active admin role');
  }

  // Create or update role
  await prisma.adminRole.upsert({
    where: { userId: targetUserId },
    create: {
      userId: targetUserId,
      role,
      grantedBy: grantedByUserId,
      isActive: true,
    },
    update: {
      role,
      grantedBy: grantedByUserId,
      grantedAt: new Date(),
      revokedAt: null,
      isActive: true,
    },
  });

  // Also update the legacy isAdmin flag for backwards compatibility
  await prisma.user.update({
    where: { id: targetUserId },
    data: { isAdmin: true },
  });

  // Log the action
  await logAdminAction({
    action: 'admin_role_granted',
    actor: grantedByUserId,
    actorId: grantedByUserId,
    target: targetUserId,
    details: `Granted ${role} role to user ${targetUser.email}`,
    type: 'WARNING',
    metadata: { role, targetEmail: targetUser.email },
  });
}

/**
 * Revoke admin role from a user
 */
export async function revokeAdminRole(
  targetUserId: string,
  revokedByUserId: string
): Promise<void> {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { adminRole: true },
  });

  if (!targetUser) {
    throw new Error('User not found');
  }

  if (!targetUser.adminRole || !targetUser.adminRole.isActive) {
    throw new Error('User does not have an active admin role');
  }

  // Revoke role
  await prisma.adminRole.update({
    where: { userId: targetUserId },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });

  // Also update legacy flag
  await prisma.user.update({
    where: { id: targetUserId },
    data: { isAdmin: false },
  });

  // Log the action
  await logAdminAction({
    action: 'admin_role_revoked',
    actor: revokedByUserId,
    actorId: revokedByUserId,
    target: targetUserId,
    details: `Revoked ${targetUser.adminRole.role} role from user ${targetUser.email}`,
    type: 'DESTRUCTIVE',
    metadata: { previousRole: targetUser.adminRole.role, targetEmail: targetUser.email },
  });
}

/**
 * Update admin role type
 */
export async function updateAdminRole(
  targetUserId: string,
  newRole: AdminRoleType,
  updatedByUserId: string
): Promise<void> {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { adminRole: true },
  });

  if (!targetUser || !targetUser.adminRole || !targetUser.adminRole.isActive) {
    throw new Error('User does not have an active admin role');
  }

  const previousRole = targetUser.adminRole.role;

  await prisma.adminRole.update({
    where: { userId: targetUserId },
    data: { role: newRole },
  });

  // Log the action
  await logAdminAction({
    action: 'admin_role_updated',
    actor: updatedByUserId,
    actorId: updatedByUserId,
    target: targetUserId,
    details: `Updated role from ${previousRole} to ${newRole} for user ${targetUser.email}`,
    type: 'WARNING',
    metadata: { previousRole, newRole, targetEmail: targetUser.email },
  });
}

/**
 * Get all admins
 */
export async function getAllAdmins(): Promise<AdminInfo[]> {
  const admins = await prisma.user.findMany({
    where: {
      adminRole: {
        isActive: true,
      },
    },
    include: {
      adminRole: true,
    },
  });

  return admins.map((user) => ({
    userId: user.id,
    email: user.email || '',
    role: user.adminRole!.role,
    isActive: user.adminRole!.isActive,
    twoFactorEnabled: user.twoFactorEnabled,
    grantedAt: user.adminRole!.grantedAt,
  }));
}

/**
 * Check if user has specific role or higher
 */
export async function hasRoleOrHigher(
  userId: string,
  requiredRole: AdminRoleType
): Promise<boolean> {
  const adminRole = await prisma.adminRole.findUnique({
    where: { userId },
    select: { role: true, isActive: true },
  });

  if (!adminRole || !adminRole.isActive) {
    return false;
  }

  const roleHierarchy: Record<AdminRoleType, number> = {
    MODERATOR: 1,
    ADMIN: 2,
    SUPER_ADMIN: 3,
  };

  return roleHierarchy[adminRole.role] >= roleHierarchy[requiredRole];
}

/**
 * Seed initial super admin (for setup)
 */
export async function seedSuperAdmin(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { adminRole: true },
  });

  if (!user) {
    throw new Error(`User with email ${email} not found`);
  }

  if (user.adminRole?.isActive) {
    console.log(`User ${email} already has admin role: ${user.adminRole.role}`);
    return;
  }

  await prisma.adminRole.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      role: 'SUPER_ADMIN',
      grantedBy: null, // System-granted
      isActive: true,
    },
    update: {
      role: 'SUPER_ADMIN',
      grantedAt: new Date(),
      revokedAt: null,
      isActive: true,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true },
  });

  console.log(`Granted SUPER_ADMIN role to ${email}`);
}
