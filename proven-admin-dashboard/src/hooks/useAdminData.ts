import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '../lib/api/admin';

// Query keys
export const queryKeys = {
  stats: ['admin', 'stats'] as const,
  challenges: (params?: object) => ['admin', 'challenges', params] as const,
  challengeDetails: (id: string) => ['admin', 'challenges', id] as const,
  participants: (challengeId: string, params?: object) => ['admin', 'challenges', challengeId, 'participants', params] as const,
  progress: (challengeId: string) => ['admin', 'challenges', challengeId, 'progress'] as const,
  proofs: (params?: object) => ['admin', 'proofs', params] as const,
  users: (params?: object) => ['admin', 'users', params] as const,
  userDetails: (id: string) => ['admin', 'users', id] as const,
  escrow: ['admin', 'escrow'] as const,
  disputes: (params?: object) => ['admin', 'disputes', params] as const,
  disputeDetails: (id: string) => ['admin', 'disputes', id] as const,
  auditLogs: (params?: object) => ['admin', 'audit-logs', params] as const,
  settings: ['admin', 'settings'] as const,
  payoutStatus: ['admin', 'payouts', 'status'] as const,
  failedPayouts: (challengeId?: string) => ['admin', 'payouts', 'failed', challengeId] as const,
};

// Dashboard Stats
export const useStats = () => {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => adminApi.getStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};

// Challenges
export const useChallenges = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.challenges(params),
    queryFn: () => adminApi.getChallenges(params),
  });
};

export const useChallengeDetails = (id: string) => {
  return useQuery({
    queryKey: queryKeys.challengeDetails(id),
    queryFn: () => adminApi.getChallengeDetails(id),
    enabled: !!id,
  });
};

export const useUpdateChallenge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status?: string; endDate?: string } }) =>
      adminApi.updateChallenge(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.challengeDetails(id) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
    },
  });
};

export const useCreateChallenge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof adminApi.createChallenge>[0]) =>
      adminApi.createChallenge(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
};

export const useCloseChallenge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminApi.closeChallenge(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.challengeDetails(id) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.escrow });
      queryClient.invalidateQueries({ queryKey: queryKeys.payoutStatus });
    },
  });
};

export const usePauseChallenge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, pause }: { id: string; pause: boolean }) =>
      adminApi.pauseChallenge(id, pause),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.challengeDetails(id) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });
};

export const useEndChallenge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      adminApi.endChallenge(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.challengeDetails(id) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });
};

export const useDeleteChallenge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminApi.deleteChallenge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.escrow });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });
};

export const useParticipants = (challengeId: string, params?: { page?: number; limit?: number }) => {
  return useQuery({
    queryKey: queryKeys.participants(challengeId, params),
    queryFn: () => adminApi.getParticipants(challengeId, params),
    enabled: !!challengeId,
  });
};

export const useProgress = (challengeId: string) => {
  return useQuery({
    queryKey: queryKeys.progress(challengeId),
    queryFn: () => adminApi.getProgress(challengeId),
    enabled: !!challengeId,
  });
};

// Proofs
export const useProofs = (params?: {
  page?: number;
  limit?: number;
  status?: string;
  challengeId?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.proofs(params),
    queryFn: () => adminApi.getProofs(params),
  });
};

export const useApproveProof = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminApi.approveProof(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'proofs'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
};

export const useRejectProof = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason, category }: { id: string; reason: string; category: string }) =>
      adminApi.rejectProof(id, { reason, category }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'proofs'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
};

export const useFlagProof = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      adminApi.flagProof(id, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'proofs'] });
    },
  });
};

// Users
export const useUsers = (params?: {
  page?: number;
  limit?: number;
  flagged?: boolean;
  blocked?: boolean;
  search?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => adminApi.getUsers(params),
  });
};

export const useUserDetails = (id: string) => {
  return useQuery({
    queryKey: queryKeys.userDetails(id),
    queryFn: () => adminApi.getUserDetails(id),
    enabled: !!id,
  });
};

export const useFlagUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.flagUser(id, { reason }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userDetails(id) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
};

export const useBlockUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminApi.blockUser(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userDetails(id) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
};

// Export utilities (for direct download)
export const getExportUsersUrl = adminApi.exportUsers;
export const getExportAuditLogsUrl = adminApi.exportAuditLogs;

// Escrow
export const useEscrow = () => {
  return useQuery({
    queryKey: queryKeys.escrow,
    queryFn: () => adminApi.getEscrow(),
  });
};

// Disputes
export const useDisputes = (params?: {
  page?: number;
  limit?: number;
  status?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.disputes(params),
    queryFn: () => adminApi.getDisputes(params),
  });
};

export const useDisputeDetails = (id: string) => {
  return useQuery({
    queryKey: queryKeys.disputeDetails(id),
    queryFn: () => adminApi.getDisputeDetails(id),
    enabled: !!id,
  });
};

export const useResolveDispute = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, resolution, notes }: { id: string; resolution: 'approved' | 'upheld'; notes?: string }) =>
      adminApi.resolveDispute(id, { resolution, notes }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.disputeDetails(id) });
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
    },
  });
};

// Audit Logs
export const useAuditLogs = (params?: {
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => adminApi.getAuditLogs(params),
  });
};

// Settings
export const useSettings = () => {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => adminApi.getSettings(),
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof adminApi.updateSettings>[0]) =>
      adminApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });
};

// Payouts
export const usePayoutStatus = () => {
  return useQuery({
    queryKey: queryKeys.payoutStatus,
    queryFn: () => adminApi.getPayoutStatus(),
    refetchInterval: 15000,
  });
};

export const useFailedPayouts = (challengeId?: string) => {
  return useQuery({
    queryKey: queryKeys.failedPayouts(challengeId),
    queryFn: () => adminApi.getFailedPayouts(challengeId),
  });
};

export const useRetryPayout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => adminApi.retryPayout(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payoutStatus });
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts', 'failed'] });
    },
  });
};

export const useRetryAllPayouts = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (challengeId?: string) => adminApi.retryAllPayouts(challengeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payoutStatus });
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts', 'failed'] });
    },
  });
};

export const useTriggerSettlement = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => adminApi.triggerSettlement(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payoutStatus });
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
    },
  });
};
