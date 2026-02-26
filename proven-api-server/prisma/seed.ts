/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { Keypair } from '@solana/web3.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Encryption for escrow keys (same as escrowService)
const ENCRYPTION_KEY = process.env.ESCROW_ENCRYPTION_KEY || 'dev-key-for-seeding-only-32bytes!';

function encryptSecretKey(secretKey: Uint8Array): string {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(secretKey)),
    cipher.final(),
  ]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

async function createEscrowForChallenge(challengeId: string): Promise<string> {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toString();
  const encryptedSecret = encryptSecretKey(keypair.secretKey);

  await prisma.escrowWallet.upsert({
    where: { challengeId },
    create: {
      challengeId,
      publicKey,
      secretKey: encryptedSecret,
    },
    update: {
      publicKey,
      secretKey: encryptedSecret,
    },
  });

  await prisma.challenge.update({
    where: { id: challengeId },
    data: { escrowAddress: publicKey },
  });

  return publicKey;
}

async function main() {
  // Idempotent seeds for local development
  const userId = '00000000-0000-0000-0000-000000000001';

  await prisma.user.upsert({
    where: { id: userId },
    update: { name: 'Demo Admin', email: 'hello@proven.com' },
    create: { 
      id: userId, 
      name: 'Demo Admin', 
      email: 'hello@proven.com'
    },
  });

  // ===== CHALLENGE 1: STARTS IN 30 MINS (for demo - join now, submit proof after it starts) =====
  const soonStart = new Date();
  soonStart.setMinutes(soonStart.getMinutes() + 30); // Starts in 30 mins
  const soonEnd = new Date(soonStart);
  soonEnd.setDate(soonEnd.getDate() + 7);

  await prisma.challenge.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: { startDate: soonStart, endDate: soonEnd },
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      creatorId: userId,
      title: 'Daily Gym Warrior',
      description: 'Hit the gym every day for 7 days! Upload a photo of yourself at the gym or your workout to prove you showed up. Build the habit of consistent exercise.',
      stakeAmount: 10,
      image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
      startDate: soonStart,
      endDate: soonEnd,
      verificationType: 'PHOTO',
      difficulty: 'MODERATE',
      metrics: 'Gym visits per day',
      rules: [
        'Upload a photo at the gym or of your workout equipment',
        'Submit proof within 24 hours of your gym session',
        'Complete at least 5 out of 7 days to win',
        'Selfies, gym equipment, or workout screenshots accepted'
      ],
      totalPrizePool: 100,
      participants: 0,
      hostType: 'PERSONAL',
      sponsor: 'Proven',
      trackingMetrics: ['gym_visits', 'workout_duration'],
    },
  });
  const escrow1 = await createEscrowForChallenge('00000000-0000-0000-0000-000000000101');
  console.log(`✅ Created: Daily Gym Warrior (starts in ~30min: ${soonStart.toLocaleTimeString()}) - Escrow: ${escrow1.slice(0, 8)}...`);

  // ===== CHALLENGES 2 & 3: START TOMORROW =====
  const tomorrowStart = new Date();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 7);

  await prisma.challenge.upsert({
    where: { id: '00000000-0000-0000-0000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      creatorId: userId,
      title: 'Sunrise Runner',
      description: 'Start your day right with a morning run! Complete a run before 9 AM every day and upload proof. Perfect for building a healthy morning routine.',
      stakeAmount: 10,
      image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800',
      startDate: tomorrowStart,
      endDate: tomorrowEnd,
      verificationType: 'PHOTO',
      difficulty: 'MODERATE',
      metrics: 'Morning runs completed',
      rules: [
        'Run must be completed before 9:00 AM local time',
        'Upload a screenshot from your fitness app or a photo outdoors',
        'Minimum distance: 2km per run',
        'Complete at least 5 out of 7 days to win'
      ],
      totalPrizePool: 100,
      participants: 0,
      hostType: 'PERSONAL',
      sponsor: 'Proven',
      trackingMetrics: ['distance', 'time', 'pace'],
    },
  });
  const escrow2 = await createEscrowForChallenge('00000000-0000-0000-0000-000000000102');
  console.log(`✅ Created: Sunrise Runner (tomorrow) - Escrow: ${escrow2.slice(0, 8)}...`);

  await prisma.challenge.upsert({
    where: { id: '00000000-0000-0000-0000-000000000103' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000103',
      creatorId: userId,
      title: 'Clean Eating Week',
      description: 'Commit to eating healthy for 7 days! Photo your nutritious meals to prove you are fueling your body right. No junk food, no excuses!',
      stakeAmount: 10,
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800',
      startDate: tomorrowStart,
      endDate: tomorrowEnd,
      verificationType: 'PHOTO',
      difficulty: 'EASY',
      metrics: 'Healthy meals per day',
      rules: [
        'Upload a photo of at least one healthy meal per day',
        'Meals should include vegetables, lean protein, or whole grains',
        'No fast food, sugary drinks, or processed snacks',
        'Complete at least 6 out of 7 days to win'
      ],
      totalPrizePool: 100,
      participants: 0,
      hostType: 'PERSONAL',
      sponsor: 'Proven',
      trackingMetrics: ['meals', 'calories'],
    },
  });
  const escrow3 = await createEscrowForChallenge('00000000-0000-0000-0000-000000000103');
  console.log(`✅ Created: Clean Eating Week (tomorrow) - Escrow: ${escrow3.slice(0, 8)}...`);

  // ===== CHALLENGE 4: REALISTIC PRODUCTION CHALLENGE - STARTS TOMORROW =====
  // This is a real challenge with actual staking and payout mechanics
  const realChallengeStart = new Date();
  realChallengeStart.setDate(realChallengeStart.getDate() + 1);
  realChallengeStart.setHours(6, 0, 0, 0); // 6 AM tomorrow
  const realChallengeEnd = new Date(realChallengeStart);
  realChallengeEnd.setDate(realChallengeEnd.getDate() + 7);

  await prisma.challenge.upsert({
    where: { id: '00000000-0000-0000-0000-000000000104' },
    update: { startDate: realChallengeStart, endDate: realChallengeEnd },
    create: {
      id: '00000000-0000-0000-0000-000000000104',
      creatorId: userId,
      title: '7-Day Step Challenge',
      description: 'Walk 10,000 steps every day for 7 days. Track your steps using any fitness app (Apple Health, Google Fit, Fitbit, etc.) and submit a screenshot as proof. Winners split the prize pool!',
      stakeAmount: 5,
      image: 'https://images.unsplash.com/photo-1581889470536-467bdbe30cd0?w=1200&q=80&fit=crop', // Fitness tracker showing steps
      startDate: realChallengeStart,
      endDate: realChallengeEnd,
      verificationType: 'PHOTO',
      difficulty: 'MODERATE',
      metrics: 'Daily steps',
      rules: [
        'Reach at least 10,000 steps each day',
        'Submit a screenshot from your fitness app showing your daily step count',
        'Screenshots must show the date clearly',
        'Submit proof before 11:59 PM each day',
        'Complete at least 5 out of 7 days to win your share of the prize pool',
        'Prize pool is split equally among all winners'
      ],
      totalPrizePool: 0, // Will be calculated based on participants
      participants: 0,
      hostType: 'PERSONAL',
      sponsor: 'Proven',
      trackingMetrics: ['steps', 'distance'],
    },
  });
  const escrow4 = await createEscrowForChallenge('00000000-0000-0000-0000-000000000104');
  console.log(`✅ Created: 7-Day Step Challenge (REAL - tomorrow 6AM) - Escrow: ${escrow4.slice(0, 8)}...`);

  // ===== CHALLENGE 5: EARLY BIRD WAKE UP CHALLENGE - STARTS TOMORROW =====
  const earlyBirdStart = new Date();
  earlyBirdStart.setDate(earlyBirdStart.getDate() + 1);
  earlyBirdStart.setHours(5, 0, 0, 0); // 5 AM tomorrow
  const earlyBirdEnd = new Date(earlyBirdStart);
  earlyBirdEnd.setDate(earlyBirdEnd.getDate() + 7);

  await prisma.challenge.upsert({
    where: { id: '00000000-0000-0000-0000-000000000105' },
    update: { startDate: earlyBirdStart, endDate: earlyBirdEnd },
    create: {
      id: '00000000-0000-0000-0000-000000000105',
      creatorId: userId,
      title: 'Early Bird Challenge',
      description: 'Wake up before 6 AM every day for 7 days. Build the habit of early rising and win your share of the prize pool! Take a screenshot of your phone showing the time when you wake up.',
      stakeAmount: 5,
      image: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1200&q=80&fit=crop', // Sunrise/early morning
      startDate: earlyBirdStart,
      endDate: earlyBirdEnd,
      verificationType: 'PHOTO',
      difficulty: 'HARD',
      metrics: 'Wake up time',
      rules: [
        'Wake up before 6:00 AM local time each day',
        'Take a screenshot or photo showing the current time (phone clock, alarm app, etc.)',
        'Submit proof within 30 minutes of waking up',
        'Complete at least 5 out of 7 days to win',
        'Prize pool is split equally among all winners',
        'No going back to sleep after submitting!'
      ],
      totalPrizePool: 0,
      participants: 0,
      hostType: 'PERSONAL',
      sponsor: 'Proven',
      trackingMetrics: ['wake_time'],
    },
  });
  const escrow5 = await createEscrowForChallenge('00000000-0000-0000-0000-000000000105');
  console.log(`✅ Created: Early Bird Challenge (REAL - tomorrow 5AM) - Escrow: ${escrow5.slice(0, 8)}...`);

  console.log('🎉 All 5 challenges created (including 2 real production challenges)!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seed failed', e);
    await prisma.$disconnect();
    process.exit(1);
  });
