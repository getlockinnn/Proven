import prisma from './proven-backend/src/lib/prisma';
import { getClientDayBoundary } from './proven-backend/src/utils/timeUtils';

async function main() {
  const req = {
    header: (key: string) => {
      if (key === 'x-utc-offset-minutes') return '-330';
      if (key === 'x-timezone') return 'Asia/Kolkata';
      return undefined;
    },
    query: {},
    body: {}
  };

  const {
    todayStr,
    todayMidnightUTC,
    tomorrowMidnightUTC,
    getClientDateKey
  } = getClientDayBoundary(req as any, 'Asia/Kolkata');

  console.log({ todayStr, todayMidnightUTC, tomorrowMidnightUTC });

  const submissions = await prisma.submission.findMany({
    where: {
      submissionDate: {
        gte: todayMidnightUTC,
        lt: tomorrowMidnightUTC
      }
    }
  });
  console.log("Submissions retrieved for today:", submissions.length);
  submissions.forEach(s => console.log(s.id, s.submissionDate, s.status, s.challengeId));
}

main().catch(console.error).finally(() => prisma.$disconnect());
