import { apiClient } from './client';
import type {
  ApiResponse,
  Pagination,
  DashboardStats,
  Challenge,
  ChallengeDetails,
  Participant,
  DailyProgress,
  Proof,
  User,
  UserDetails,
  Dispute,
  EscrowEntry,
  AuditLog,
  SystemSettings,
} from './types';

// Dashboard
export const getStats = () =>
  apiClient.get<ApiResponse<DashboardStats>>('/admin/stats');

// Challenges
export const getChallenges = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) =>
  apiClient.get<ApiResponse<{ challenges: Challenge[]; pagination: Pagination }>>(
    '/admin/challenges',
    { params }
  );

export const getChallengeDetails = (id: string) =>
  apiClient.get<ApiResponse<ChallengeDetails>>(`/admin/challenges/${id}`);

export const updateChallenge = (id: string, data: { status?: string; endDate?: string }) =>
  apiClient.patch<ApiResponse<Challenge>>(`/admin/challenges/${id}`, data);

export const createChallenge = (data: {
  title: string;
  description?: string;
  category: string;
  duration: number;
  stakeAmount: number;
  startDate: string;
  proofType?: string;
  image?: string;
}) =>
  apiClient.post<ApiResponse<Challenge>>('/admin/challenges', data);

export const closeChallenge = (id: string) =>
  apiClient.post<ApiResponse<{
    statusResults: { completed: number; failed: number; total: number };
    dustSweep: { amount: number; tx?: string; error?: string } | null;
    settlementsCompleted: number;
  }>>(`/admin/challenges/${id}/close`);

export const pauseChallenge = (id: string, pause: boolean) =>
  apiClient.post<ApiResponse<{ id: string; title: string; isPaused: boolean; pausedAt?: string }>>(
    `/admin/challenges/${id}/pause`,
    { pause }
  );

export const endChallenge = (id: string, reason?: string) =>
  apiClient.post<ApiResponse<{
    id: string;
    title: string;
    originalEndDate: string;
    newEndDate: string;
    endedEarly: boolean;
    activeParticipantsAffected: number;
  }>>(
    `/admin/challenges/${id}/end`,
    { reason }
  );

export const deleteChallenge = (id: string) =>
  apiClient.delete<ApiResponse<{
    id: string;
    title: string;
    deletedRecords: {
      escrowWallet: number;
      userChallenges: number;
      submissions: number;
      transactions: number;
    };
  }>>(`/admin/challenges/${id}`);

export const getParticipants = (challengeId: string, params?: { page?: number; limit?: number }) =>
  apiClient.get<ApiResponse<{ participants: Participant[]; pagination: Pagination }>>(
    `/admin/challenges/${challengeId}/participants`,
    { params }
  );

export const getProgress = (challengeId: string) =>
  apiClient.get<ApiResponse<{ dailyProgress: DailyProgress[]; totalDays: number }>>(
    `/admin/challenges/${challengeId}/progress`
  );

// Proofs
export const getProofs = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  challengeId?: string;
  search?: string;
}) =>
  apiClient.get<ApiResponse<{ proofs: Proof[]; pagination: Pagination; summary: { total: number; pending: number; urgent: number } }>>(
    '/admin/proofs',
    { params }
  );

export const approveProof = (id: string) =>
  apiClient.post<ApiResponse<{ id: string; status: string; newProgress: number; dailyPayout?: number; transactionSignature?: string; payoutFailed?: boolean; payoutError?: string }>>(
    `/admin/proofs/${id}/approve`
  );

export const rejectProof = (id: string, data: { reason: string; category: string }) =>
  apiClient.post<ApiResponse<{ id: string; status: string }>>(
    `/admin/proofs/${id}/reject`,
    data
  );

export const flagProof = (id: string, data?: { note?: string }) =>
  apiClient.post<ApiResponse<{ id: string; flagged: boolean }>>(
    `/admin/proofs/${id}/flag`,
    data
  );

// Users
export const getUsers = (params?: {
  page?: number;
  limit?: number;
  flagged?: boolean;
  blocked?: boolean;
  search?: string;
}) =>
  apiClient.get<ApiResponse<{ users: User[]; pagination: Pagination; stats: { totalUsers: number; activeToday: number; flaggedUsers: number; blockedUsers: number } }>>(
    '/admin/users',
    { params }
  );

export const getUserDetails = (id: string) =>
  apiClient.get<ApiResponse<UserDetails>>(`/admin/users/${id}`);

export const flagUser = (id: string, data: { reason: string }) =>
  apiClient.post<ApiResponse<{ id: string; isFlagged: boolean; flagReason?: string }>>(
    `/admin/users/${id}/flag`,
    data
  );

export const blockUser = (id: string) =>
  apiClient.post<ApiResponse<{ id: string; isBlocked: boolean }>>(
    `/admin/users/${id}/block`
  );

export const exportUsers = (params?: { format?: 'csv' | 'json'; flagged?: boolean; blocked?: boolean }) => {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).reduce((acc, [key, value]) => {
      if (value !== undefined) acc[key] = String(value);
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  // Return the URL for direct download
  const baseUrl = apiClient.defaults.baseURL || '';
  return `${baseUrl}/admin/users/export${queryString ? `?${queryString}` : ''}`;
};

// Escrow
export const getEscrow = () =>
  apiClient.get<ApiResponse<{
    escrow: EscrowEntry[];
    stats: {
      totalInEscrow: number;
      pendingClaims: number;
      totalPaidOut: number;
    };
  }>>('/admin/escrow');

// Disputes
export const getDisputes = (params?: {
  page?: number;
  limit?: number;
  status?: string;
}) =>
  apiClient.get<ApiResponse<{ disputes: Dispute[]; pagination: Pagination; stats: { pendingReview: number; resolvedThisWeek: number } }>>(
    '/admin/disputes',
    { params }
  );

export const getDisputeDetails = (id: string) =>
  apiClient.get<ApiResponse<Dispute>>(`/admin/disputes/${id}`);

export const resolveDispute = (id: string, data: { resolution: 'approved' | 'upheld'; notes?: string }) =>
  apiClient.post<ApiResponse<{ id: string; status: string; resolution: string }>>(
    `/admin/disputes/${id}/resolve`,
    data
  );

// Audit Logs
export const getAuditLogs = (params?: {
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
  search?: string;
}) =>
  apiClient.get<ApiResponse<{ logs: AuditLog[]; pagination: Pagination }>>(
    '/admin/audit-logs',
    { params }
  );

export const exportAuditLogs = (params?: {
  format?: 'csv' | 'json';
  action?: string;
  actorId?: string;
  startDate?: string;
  endDate?: string;
}) => {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).reduce((acc, [key, value]) => {
      if (value !== undefined) acc[key] = String(value);
      return acc;
    }, {} as Record<string, string>)
  ).toString();

  // Return the URL for direct download
  const baseUrl = apiClient.defaults.baseURL || '';
  return `${baseUrl}/admin/audit-logs/export${queryString ? `?${queryString}` : ''}`;
};

// Settings
export const getSettings = () =>
  apiClient.get<ApiResponse<{ settings: SystemSettings; adminUsers: Array<{ id: string; name: string; email: string; image?: string }> }>>(
    '/admin/settings'
  );

export const updateSettings = (data: Partial<SystemSettings>) =>
  apiClient.patch<ApiResponse<{ settings: SystemSettings }>>(
    '/admin/settings',
    data
  );

// Settlements & Payouts
export const triggerSettlement = () =>
  apiClient.post<ApiResponse<void>>('/admin/settlements/run');

export const settleDay = (challengeId: string, dayDate: string) =>
  apiClient.post<ApiResponse<{
    id: string;
    challengeId: string;
    dayDate: string;
    showedUp: number;
    missed: number;
    bonusPerPerson: number;
    totalDistributed: number;
  }>>(`/admin/settlements/${challengeId}/${dayDate}`);

export const getFailedPayouts = (challengeId?: string) =>
  apiClient.get<ApiResponse<Array<{
    id: string;
    userId: string;
    challengeId: string;
    amount: number;
    type: string;
    dayDate: string;
    status: string;
    attempts: number;
    lastError: string | null;
    walletAddress: string | null;
    createdAt: string;
    user: { id: string; name: string | null; email: string | null };
    challenge: { id: string; title: string };
  }>>>('/admin/payouts/failed', { params: challengeId ? { challengeId } : undefined });

export const getPayoutStatus = () =>
  apiClient.get<ApiResponse<{
    stats: { queued: number; processing: number; completed: number; failed: number; total: number };
    recent: Array<{
      id: string;
      userId: string;
      challengeId: string;
      amount: number;
      type: string;
      dayDate: string;
      transactionSignature: string | null;
      processedAt: string | null;
      user: { id: string; name: string | null };
      challenge: { id: string; title: string };
    }>;
  }>>('/admin/payouts/status');

export const retryPayout = (jobId: string) =>
  apiClient.post<ApiResponse<void>>(`/admin/payouts/${jobId}/retry`);

export const retryAllPayouts = (challengeId?: string) =>
  apiClient.post<ApiResponse<void>>('/admin/payouts/retry-all', challengeId ? { challengeId } : {});
