/**
 * Seed Super Admin Script
 *
 * Usage:
 *   npx ts-node src/scripts/seedSuperAdmin.ts admin@example.com
 *
 * This script grants SUPER_ADMIN role to an existing user by email.
 * The user must already exist in the database (i.e., they must have logged in at least once).
 */

import prisma from '../lib/prisma';
import { seedSuperAdmin } from '../services/adminRoleService';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: npx ts-node src/scripts/seedSuperAdmin.ts <email>');
    console.error('Example: npx ts-node src/scripts/seedSuperAdmin.ts admin@example.com');
    process.exit(1);
  }

  console.log(`Attempting to grant SUPER_ADMIN role to: ${email}`);

  try {
    await seedSuperAdmin(email);
    console.log('Done!');
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
