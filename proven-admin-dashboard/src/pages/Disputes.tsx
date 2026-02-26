import { useState, useMemo } from "react";
import { AlertCircle, Clock, CheckCircle, XCircle, MessageSquare, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useDisputes, useResolveDispute } from "@/hooks/useAdminData";

export default function Disputes() {
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch disputes based on active tab
  const { data: disputesData, isLoading } = useDisputes({
    status: activeTab === "all" ? undefined : activeTab.toUpperCase(),
  });

  const disputes = disputesData?.data?.disputes || [];
  const summary = disputesData?.data?.summary;

  // Fetch all disputes for stats
  const { data: allDisputesData } = useDisputes({ limit: 100 });
  const allDisputes = allDisputesData?.data?.disputes || [];

  // Mutation
  const resolveDisputeMutation = useResolveDispute();

  const filteredDisputes = useMemo(() => {
    if (activeTab === "all") return disputes;
    return disputes;
  }, [disputes, activeTab]);

  const stats = useMemo(() => ({
    pending: allDisputes.filter((d) => d.status === "PENDING").length,
    resolved: allDisputes.filter((d) => d.status === "RESOLVED").length,
  }), [allDisputes]);

  const handleResolve = async (disputeId: string, resolution: "APPROVED" | "DENIED") => {
    try {
      await resolveDisputeMutation.mutateAsync({
        id: disputeId,
        resolution,
        reason: resolution === "APPROVED" ? "Appeal accepted" : "Original decision upheld",
      });
      toast({
        title: resolution === "APPROVED" ? "Dispute Approved" : "Dispute Denied",
        description: resolution === "APPROVED"
          ? "The appeal has been accepted and the proof is now approved."
          : "The original decision has been upheld.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resolve dispute. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Disputes & Appeals</h1>
        <p className="text-muted-foreground mt-1">Review and resolve user appeals</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <p className="text-sm text-muted-foreground">Pending Review</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <p className="text-3xl font-semibold text-warning">{summary?.pending ?? stats.pending}</p>
          )}
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">Resolved This Week</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <p className="text-3xl font-semibold text-success">{summary?.resolved ?? stats.resolved}</p>
          )}
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Avg. Resolution Time</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <p className="text-3xl font-semibold text-foreground">{summary?.avgResolutionTime ?? "N/A"}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Pending ({stats.pending})
          </TabsTrigger>
          <TabsTrigger value="resolved" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Resolved ({stats.resolved})
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6 space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-[140px] w-full" />
              <Skeleton className="h-[140px] w-full" />
              <Skeleton className="h-[140px] w-full" />
            </>
          ) : filteredDisputes.length > 0 ? (
            filteredDisputes.map((dispute) => (
              <div
                key={dispute.id}
                className="bg-card rounded-xl border border-border p-5 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono text-muted-foreground">{dispute.id.slice(0, 8)}</span>
                      <Badge
                        variant="outline"
                        className={
                          dispute.status === "PENDING"
                            ? "border-warning/50 text-warning bg-warning/10"
                            : "border-success/50 text-success bg-success/10"
                        }
                      >
                        {dispute.status.toLowerCase()}
                      </Badge>
                      {dispute.resolution && (
                        <Badge variant="outline" className="border-muted text-muted-foreground">
                          {dispute.resolution.toLowerCase()}
                        </Badge>
                      )}
                    </div>

                    <h3 className="font-medium text-foreground mb-1">{dispute.challenge}</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Day {dispute.proofDay} • User: <span className="font-mono">{dispute.user}</span>
                    </p>

                    <div className="bg-secondary/50 rounded-lg p-3 border border-border">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-sm text-foreground">{dispute.reason}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-muted-foreground">{formatTimeAgo(dispute.createdAt)}</span>
                    {dispute.status === "PENDING" && (
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="outline" className="border-border">
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Review
                        </Button>
                        <Button
                          size="sm"
                          className="bg-success text-success-foreground hover:bg-success/90"
                          onClick={() => handleResolve(dispute.id, "APPROVED")}
                          disabled={resolveDisputeMutation.isPending}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/50 text-destructive hover:bg-destructive/10"
                          onClick={() => handleResolve(dispute.id, "DENIED")}
                          disabled={resolveDisputeMutation.isPending}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Deny
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No disputes found
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
