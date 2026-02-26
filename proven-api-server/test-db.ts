import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const submissions = await prisma.submission.findMany({
        orderBy: { submissionDate: 'desc' },
        take: 5,
        include: {
            userChallenge: {
                include: { challenge: true }
            },
            user: true
        }
    });

    for (const sub of submissions) {
        console.log(`User: ${sub.user.name} | Challenge: ${sub.userChallenge.challenge.title}`);
        console.log(`Submitted at (UTC): ${sub.submissionDate.toISOString()}`);
        console.log(`Status: ${sub.status}`);
        console.log('---');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
