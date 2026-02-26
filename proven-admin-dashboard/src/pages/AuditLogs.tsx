import { useState, useMemo } from "react";
import { Search, Filter, Download, CheckCircle, XCircle, AlertTriangle, Settings, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuditLogs, getExportAuditLogsUrl } from "@/hooks/useAdminData";

const actionIcons: Record<string, React.ReactNode> = {
  proof_approved: <CheckCircle className="w-4 h-4" />,
  proof_rejected: <XCircle className="w-4 h-4" />,
  challenge_finalized: <Shield className="w-4 h-4" />,
  dispute_resolved: <AlertTriangle className="w-4 h-4" />,
  user_flagged: <AlertTriangle className="w-4 h-4" />,
  challenge_paused: <AlertTriangle className="w-4 h-4" />,
  settings_updated: <Settings className="w-4 h-4" />,
};

const typeStyles: Record<string, string> = {
  success: "bg-success/10 text-success border-success/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  info: "bg-muted text-muted-foreground border-muted",
};

export default function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: logsResponse, isLoading } = useAuditLogs({
    search: searchQuery || undefined,
  });

  const logs = logsResponse?.data?.logs || [];

  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    return logs.filter(
      (log) =>
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.actor.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [logs, searchQuery]);

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

  const handleExport = () => {
    const exportUrl = getExportAuditLogsUrl({ format: 'csv' });
    window.open(exportUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">Complete history of all admin actions</p>
        </div>
        <Button variant="outline" className="border-border" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export Logs
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <Button variant="outline" className="border-border">
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Logs Timeline */}
      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </>
        ) : filteredLogs.length > 0 ? (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                    typeStyles[log.type.toLowerCase()] || typeStyles.info
                  )}
                >
                  {actionIcons[log.action] || <Shield className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs font-mono">
                      {log.action.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{log.id.slice(0, 8)}</span>
                  </div>

                  <p className="text-foreground mb-1">{log.details}</p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>By: <span className="text-foreground">{log.actor}</span></span>
                    <span>Target: <span className="font-mono text-foreground">{log.target}</span></span>
                  </div>
                </div>

                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTimeAgo(log.createdAt)}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No audit logs found
          </div>
        )}
      </div>

      {/* Important Notice */}
      <div className="bg-card/50 border border-border rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Shield className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-medium text-foreground mb-1">Immutable Audit Trail</h3>
          <p className="text-sm text-muted-foreground">
            All admin actions are permanently logged and cannot be modified or deleted. 
            This ensures complete transparency and accountability for all system operations.
          </p>
        </div>
      </div>
    </div>
  );
}
