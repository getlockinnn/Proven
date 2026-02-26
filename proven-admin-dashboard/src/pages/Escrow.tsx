import { useNavigate } from "react-router-dom";
import { Wallet, ArrowUpRight, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEscrow } from "@/hooks/useAdminData";

export default function Escrow() {
  const navigate = useNavigate();
  const { data: escrowResponse, isLoading } = useEscrow();

  // API returns { escrow: [...], stats: {...} }
  const escrowData = escrowResponse?.data?.escrow || [];
  const stats = escrowResponse?.data?.stats;

  const totalInEscrow = stats?.totalInEscrow ?? escrowData.reduce((acc, item) => acc + item.totalLocked, 0);
  const totalClaimable = stats?.pendingClaims ?? escrowData.reduce((acc, item) => acc + item.claimable, 0);
  const totalPaidOut = stats?.totalPaidOut ?? escrowData.reduce((acc, item) => acc + item.paidOut, 0);
  const dailyAvgPayout = 0; // Not provided by API currently
  const dailyChange = 0; // Not provided by API currently

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Escrow & Payouts</h1>
        <p className="text-muted-foreground mt-1">Monitor locked funds and payout distribution</p>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">Total in Escrow</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-28" />
          ) : (
            <p className="text-3xl font-semibold text-foreground">${totalInEscrow.toLocaleString()}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">USDC locked</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <p className="text-sm text-muted-foreground">Pending Claims</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <p className="text-3xl font-semibold text-warning">${totalClaimable.toLocaleString()}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">Awaiting claim</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">Total Paid Out</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-28" />
          ) : (
            <p className="text-3xl font-semibold text-success">${totalPaidOut.toLocaleString()}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">All time</p>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5 text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Daily Avg Payout</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <p className="text-3xl font-semibold text-foreground">${dailyAvgPayout.toLocaleString()}</p>
          )}
          {isLoading ? (
            <Skeleton className="h-4 w-20 mt-1" />
          ) : (
            <p className={`text-sm mt-1 ${dailyChange >= 0 ? 'text-success' : 'text-destructive'}`}>
              {dailyChange >= 0 ? '+' : ''}{dailyChange}% vs last week
            </p>
          )}
        </div>
      </div>

      {/* Escrow Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-medium text-foreground">Escrow by Challenge</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary/50">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="px-4 py-3 font-medium">Challenge</th>
                <th className="px-4 py-3 font-medium text-right">Locked</th>
                <th className="px-4 py-3 font-medium text-right">Claimable</th>
                <th className="px-4 py-3 font-medium text-right">Paid Out</th>
                <th className="px-4 py-3 font-medium text-right">Participants</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-4"><Skeleton className="h-5 w-40" /></td>
                    <td className="px-4 py-4 text-right"><Skeleton className="h-5 w-20 ml-auto" /></td>
                    <td className="px-4 py-4 text-right"><Skeleton className="h-5 w-16 ml-auto" /></td>
                    <td className="px-4 py-4 text-right"><Skeleton className="h-5 w-20 ml-auto" /></td>
                    <td className="px-4 py-4 text-right"><Skeleton className="h-5 w-12 ml-auto" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-5 w-16 mx-auto" /></td>
                  </tr>
                ))
              ) : escrowData.length > 0 ? (
                escrowData.map((item, index) => (
                  <tr key={item.challengeId || index} className="hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-4">
                      <span className="font-medium text-foreground">{item.challenge}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono text-foreground">${item.totalLocked.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono text-warning">${item.claimable.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono text-success">${item.paidOut.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-muted-foreground">{item.participants}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Badge
                        variant="outline"
                        className={
                          item.status === "active"
                            ? "border-success/50 text-success bg-success/10"
                            : item.status === "upcoming"
                              ? "border-warning/50 text-warning bg-warning/10"
                              : "border-muted text-muted-foreground"
                        }
                      >
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No escrow data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notice + Payouts Link */}
      <div className="bg-card/50 border border-border rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-foreground mb-1">Escrow is View-Only</h3>
          <p className="text-sm text-muted-foreground">
            This page shows on-chain escrow balances. Payouts are processed automatically via the payout queue
            when proofs are approved (daily base) and at end-of-day settlement (bonus from no-shows).
          </p>
          <Button
            variant="link"
            className="px-0 mt-1 text-primary"
            onClick={() => navigate("/payouts")}
          >
            View Payout Queue &rarr;
          </Button>
        </div>
      </div>
    </div>
  );
}
