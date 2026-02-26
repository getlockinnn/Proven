// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

// Pagination
export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
}

// Dashboard Stats
export interface DashboardStats {
  activeChallenges: { value: number; change: string };
  totalParticipants: { value: number; change: string };
  escrowTotal: { value: number; formatted: string };
  pendingProofs: { value: number; urgent: number };
  missedToday: { value: number };
  dailyPayouts: { value: number; formatted: string };
  proofsSubmittedToday: number;
}

// Challenge
export interface Challenge {
  id: string;
  title: string;
  description?: string;
  category: string;
  duration: number;
  stakeAmount: number;
  status: 'active' | 'upcoming' | 'completed';
  participants: number;
  poolSize: number;
  startDate: string;
  endDate: string;
  submissionsCount?: number;
  image?: string;
}

export interface ChallengeDetails extends Challenge {
  currentDay: number;
  proofDeadline: string;
  completionRate: number;
  activeParticipants: number;
  droppedParticipants: number;
  completedParticipants: number;
  creator?: { id: string; name: string; email: string };
  escrowAddress?: string;
  blockchainId?: string;
  totalSubmissions: number;
}

// Participant
export interface Participant {
  id: string;
  name: string;
  wallet: string;
  email?: string;
  image?: string;
  daysCompleted: number;
  totalDays: number;
  status: 'active' | 'dropped' | 'completed';
  missedDays: number;
  progress: number;
  stakeAmount: number;
  joinedAt: string;
}

// Daily Progress
export interface DailyProgress {
  day: string;
  dayNumber: number;
  submissions: number;
  approved: number;
  rejected: number;
  pending: number;
}

// Proof
export interface Proof {
  id: string;
  user: string;
  userAvatar: string;
  userId: string;
  walletAddress?: string;
  challenge: string;
  challengeId: string;
  dayNumber: number;
  submittedAt: string;
  submissionDate: string;
  proofType: 'image' | 'video';
  thumbnailUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  description?: string;
  reviewComments?: string;
  reviewedAt?: string;
}

// User
export interface User {
  id: string;
  walletAddress: string;
  name?: string;
  email?: string;
  image?: string;
  activeChallenges: number;
  completedChallenges: number;
  totalEarned: number;
  totalStaked: number;
  missedDays: number;
  flagged: boolean;
  flagReason?: string;
  blocked: boolean;
  createdAt: string;
}

export interface UserDetails extends User {
  bio?: string;
  isAdmin: boolean;
  stats: {
    activeChallenges: number;
    completedChallenges: number;
    failedChallenges: number;
    totalEarned: number;
    totalStaked: number;
    totalDisputes: number;
  };
  challengeHistory: Array<{
    id: string;
    challengeId: string;
    title: string;
    status: string;
    progress: number;
    stakeAmount: number;
    startDate: string;
    endDate?: string;
    submissionsCount: number;
    approvedCount: number;
    rejectedCount: number;
  }>;
  recentTransactions: Array<{
    id: string;
    transactionType: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
}

// Dispute
export interface Dispute {
  id: string;
  user: string;
  userId: string;
  challenge: string;
  challengeId: string;
  proofDay: number;
  reason: string;
  submittedAt: string;
  createdAt: string;
  status: 'pending' | 'resolved';
  originalDecision: string;
  resolution?: string;
  resolvedAt?: string;
}

// Escrow
export interface EscrowEntry {
  challengeId: string;
  challenge: string;
  totalLocked: number;
  claimable: number;
  paidOut: number;
  participants: number;
  status: 'active' | 'upcoming' | 'completed';
  escrowAddress?: string;
}

// Audit Log
export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  actorId?: string;
  target: string;
  details: string;
  timestamp: string;
  createdAt: string;
  type: 'success' | 'destructive' | 'warning' | 'info';
  metadata?: Record<string, unknown>;
}

// Settings
export interface SystemSettings {
  proofCutoffTime: string;
  reviewWindowHours: number;
  maxProofsPerDay: number;
  allowedFileTypes: string[];
  emergencyPause: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

// Finalization
export interface FinalizationData {
  challengeId: string;
  challengeTitle: string;
  totalPool: number;
  platformFee: number;
  platformFeePercentage: number;
  netPool: number;
  finishersCount: number;
  droppedCount: number;
  payoutPerFinisher: number;
  finishers: Array<{
    id: string;
    userId: string;
    name: string;
    wallet: string;
    daysCompleted: number;
    totalDays: number;
    payout: number;
  }>;
  escrowAddress?: string;
}
