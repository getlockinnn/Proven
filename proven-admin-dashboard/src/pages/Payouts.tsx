import { useState } from "react";
import {
  Wallet,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  usePayoutStatus,
  useFailedPayouts,
  useRetryPayout,
  useRetryAllPayouts,
  useTriggerSettlement,
} from "@/hooks/useAdminData";

export default function Payouts() {
  const { data: statusResponse, isLoading: statusLoading } = usePayoutStatus();
  const { data: failedResponse, isLoading: failedLoading } = useFailedPayouts();
  const retryPayout = useRetryPayout();
  const retryAll = useRetryAllPayouts();
  const triggerSettlement = useTriggerSettlement();

  const stats = statusResponse?.data?.stats;
  const recentPayouts = statusResponse?.data?.recent || [];
  const failedPayouts = failedResponse?.data || [];

  const handleRetry = async (jobId: string) => {
    try {
      await retryPayout.mutateAsync(jobId);
      toast({ title: "Payout Queued", description: "The payout has been queued for retry." });
    } catch {
      toast({ title: "Retry Failed", description: "Failed to retry payout.", variant: "destructive" });
    }
  };

  const handleRetryAll = async () => {
    try {
      await retryAll.mutateAsync(undefined);
      toast({ title: "All Retried", description: "All failed payouts have been queued for retry." });
    } catch {
      toast({ title: "Retry Failed", description: "Failed to retry payouts.", variant: "destructive" });
    }
  };

  const handleTriggerSettlement = async () => {
    try {
      await triggerSettlement.mutateAsync();
      toast({ title: "Settlement Triggered", description: "Daily settlement has been triggered." });
    } catch {
      toast({ title: "Settlement Failed", description: "Failed to trigger settlement.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Payouts</h1>
          <p className="text-muted-foreground mt-1">Queue status, failed payouts, and settlement controls</p>
        </div>
        <Button
          onClick={handleTriggerSettlement}
          disabled={triggerSettlement.isPending}
          className="gap-2"
        >
          {triggerSettlement.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Run Settlement
        </Button>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs">Queued</span>
            </div>
            {statusLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-warning">{stats?.queued ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Loader2 className="w-4 h-4" />
              <span className="text-xs">Processing</span>
            </div>
            {statusLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-primary">{stats?.processing ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs">Completed</span>
            </div>
            {statusLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-success">{stats?.completed ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <XCircle className="w-4 h-4" />
              <span className="text-xs">Failed</span>
            </div>
            {statusLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-destructive">{stats?.failed ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Wallet className="w-4 h-4" />
              <span className="text-xs">Total</span>
            </div>
            {statusLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-foreground">{stats?.total ?? 0}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failed Payouts */}
      {(failedPayouts.length > 0 || failedLoading) && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Failed Payouts ({failedPayouts.length})
            </CardTitle>
            {failedPayouts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryAll}
                disabled={retryAll.isPending}
                className="gap-2"
              >
                {retryAll.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Retry All
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {failedLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">User</TableHead>
                    <TableHead className="text-muted-foreground">Challenge</TableHead>
                    <TableHead className="text-muted-foreground">Type</TableHead>
                    <TableHead className="text-muted-foreground">Amount</TableHead>
                    <TableHead className="text-muted-foreground">Day</TableHead>
                    <TableHead className="text-muted-foreground">Error</TableHead>
                    <TableHead className="text-muted-foreground">Attempts</TableHead>
                    <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedPayouts.map((job) => (
                    <TableRow key={job.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {job.user?.name || job.user?.email || job.userId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {job.challenge?.title || job.challengeId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {job.type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">
                        ${(job.amount / 1_000_000).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{job.dayDate}</TableCell>
                      <TableCell className="text-destructive text-sm max-w-[200px] truncate">
                        {job.lastError || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{job.attempts}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetry(job.id)}
                          disabled={retryPayout.isPending}
                          className="gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Payouts */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Recent Payouts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {statusLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentPayouts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">User</TableHead>
                  <TableHead className="text-muted-foreground">Challenge</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Day</TableHead>
                  <TableHead className="text-muted-foreground">Processed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayouts.map((payout) => (
                  <TableRow key={payout.id} className="border-border">
                    <TableCell className="font-medium text-foreground">
                      {payout.user?.name || payout.userId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payout.challenge?.title || payout.challengeId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          payout.type === 'DAILY_BASE'
                            ? "bg-primary/10 text-primary border-primary/20 text-xs"
                            : payout.type === 'DAILY_BONUS'
                              ? "bg-success/10 text-success border-success/20 text-xs"
                              : "text-xs"
                        }
                      >
                        {payout.type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-success">
                      ${(payout.amount / 1_000_000).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{payout.dayDate}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {payout.processedAt
                        ? new Date(payout.processedAt).toLocaleString()
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              No completed payouts yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
