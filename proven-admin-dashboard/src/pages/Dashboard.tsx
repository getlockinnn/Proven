import { Trophy, Users, Wallet, FileCheck, AlertCircle, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/admin/StatCard";
import { ProofCard } from "@/components/admin/ProofCard";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useStats, useProofs, useApproveProof, useRejectProof } from "@/hooks/useAdminData";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch dashboard stats
  const { data: statsData, isLoading: statsLoading } = useStats();
  const stats = statsData?.data;

  // Fetch recent pending proofs
  const { data: proofsData, isLoading: proofsLoading } = useProofs({
    status: 'PENDING',
    limit: 4,
  });
  const recentProofs = proofsData?.data?.proofs || [];

  // Mutations
  const approveProof = useApproveProof();
  const rejectProof = useRejectProof();

  const handleApprove = async (proofId: string) => {
    try {
      const response = await approveProof.mutateAsync(proofId);
      const data = response.data?.data;

      if (data?.payoutFailed) {
        toast({
          title: "Approved (Payout Failed)",
          description: `Proof approved but daily payout of $${data.dailyPayout?.toFixed(2)} failed: ${data.payoutError}`,
          variant: "destructive",
        });
      } else if (data?.dailyPayout) {
        toast({
          title: "Proof approved",
          description: `Approved — $${data.dailyPayout.toFixed(2)} USDC sent to wallet`,
        });
      } else {
        toast({
          title: "Proof approved",
          description: "The proof has been approved successfully.",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve proof. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (proofId: string) => {
    try {
      await rejectProof.mutateAsync({
        id: proofId,
        reason: "Rejected from dashboard",
        category: "other",
      });
      toast({
        title: "Proof rejected",
        description: "The proof has been rejected.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject proof. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your Proven ecosystem</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="animate-fade-in animate-fade-in-delay-1">
          {statsLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <StatCard
              title="Active Challenges"
              value={stats?.activeChallenges.value ?? 0}
              change={stats?.activeChallenges.change}
              changeType="positive"
              icon={Trophy}
            />
          )}
        </div>
        <div className="animate-fade-in animate-fade-in-delay-1">
          {statsLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <StatCard
              title="Total Participants"
              value={stats?.totalParticipants.value?.toLocaleString() ?? "0"}
              change={stats?.totalParticipants.change}
              changeType="positive"
              icon={Users}
            />
          )}
        </div>
        <div className="animate-fade-in animate-fade-in-delay-2">
          {statsLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <StatCard
              title="USDC in Escrow"
              value={stats?.escrowTotal.formatted ?? "$0"}
              icon={Wallet}
            />
          )}
        </div>
        <div className="animate-fade-in animate-fade-in-delay-2">
          {statsLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <StatCard
              title="Pending Proofs"
              value={stats?.pendingProofs.value ?? 0}
              change={stats?.pendingProofs.urgent ? `${stats.pendingProofs.urgent} urgent` : undefined}
              changeType="negative"
              icon={FileCheck}
            />
          )}
        </div>
        <div className="animate-fade-in animate-fade-in-delay-3">
          {statsLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <StatCard
              title="Missed Today"
              value={stats?.missedToday.value ?? 0}
              icon={AlertCircle}
              iconColor="text-warning"
            />
          )}
        </div>
        <div className="animate-fade-in animate-fade-in-delay-3">
          {statsLoading ? (
            <Skeleton className="h-[120px] w-full" />
          ) : (
            <StatCard
              title="Daily Payouts"
              value={stats?.dailyPayouts.formatted ?? "$0"}
              changeType="positive"
              icon={TrendingUp}
              iconColor="text-success"
            />
          )}
        </div>
      </div>

      {/* Proof Queue Section */}
      <div className="animate-fade-in animate-fade-in-delay-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">Pending Proofs</h2>
            <p className="text-sm text-muted-foreground">Review and verify submitted proofs</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/proofs")}
            className="border-border hover:border-primary hover:bg-primary/5"
          >
            View All
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {proofsLoading ? (
            <>
              <Skeleton className="h-[280px] w-full" />
              <Skeleton className="h-[280px] w-full" />
              <Skeleton className="h-[280px] w-full" />
              <Skeleton className="h-[280px] w-full" />
            </>
          ) : recentProofs.length > 0 ? (
            recentProofs.map((proof) => (
              <ProofCard
                key={proof.id}
                {...proof}
                onApprove={() => handleApprove(proof.id)}
                onReject={() => handleReject(proof.id)}
                onView={() => navigate(`/proofs?selected=${proof.id}`)}
              />
            ))
          ) : (
            <div className="col-span-4 text-center py-8 text-muted-foreground">
              No pending proofs to review
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in animate-fade-in-delay-4">
        <div className="stat-card">
          <h3 className="text-sm text-muted-foreground mb-3">Proofs Submitted Today</h3>
          <div className="flex items-end justify-between">
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <span className="text-3xl font-semibold text-foreground">
                  {stats?.proofsSubmittedToday ?? 0}
                </span>
                <div className="flex-1 ml-4 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-warning"
                    style={{ width: `${Math.min((stats?.proofsSubmittedToday ?? 0) / (stats?.totalParticipants.value ?? 1) * 100, 100)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="stat-card">
          <h3 className="text-sm text-muted-foreground mb-3">Escrow Total</h3>
          <div className="flex items-baseline gap-2">
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <span className="text-3xl font-semibold text-foreground">
                {stats?.escrowTotal.formatted ?? "$0"}
              </span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <h3 className="text-sm text-muted-foreground mb-3">Urgent Proofs</h3>
          <div className="flex items-baseline gap-2">
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <span className="text-3xl font-semibold text-foreground">
                  {stats?.pendingProofs.urgent ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">awaiting review</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
