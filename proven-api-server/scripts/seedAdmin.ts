import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/lib/prisma';

async function main() {
    const email = 'notcodesid@gmail.com';

    const user = await prisma.user.findUnique({
        where: { email },
        include: { adminRole: true }
    });

    if (!user) {
        console.log('User not found. User needs to login first.');
        return;
    }

    console.log('User found:', user.id, user.email);

    await prisma.adminRole.upsert({
        where: { userId: user.id },
        create: {
            userId: user.id,
            role: 'SUPER_ADMIN',
            grantedBy: null,
            isActive: true
        },
        update: {
            role: 'SUPER_ADMIN',
            grantedAt: new Date(),
            revokedAt: null,
            isActive: true
        },
    });

    await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: true }
    });

    console.log('✅ Granted SUPER_ADMIN role to', email);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
