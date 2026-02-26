import { useState, useMemo } from "react";
import { Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserRow } from "@/components/admin/UserRow";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsers, getExportUsersUrl } from "@/hooks/useAdminData";

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch users from API
  const { data: usersData, isLoading } = useUsers({
    search: searchQuery || undefined,
  });

  const users = usersData?.data?.users || [];
  const apiStats = usersData?.data?.stats;

  // Filter users locally for search (API may not support search yet)
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    return users.filter((user) =>
      user.walletAddress?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const handleExport = () => {
    const exportUrl = getExportUsersUrl({ format: 'csv' });
    window.open(exportUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Users</h1>
          <p className="text-muted-foreground mt-1">Manage participants and their activity</p>
        </div>
        <Button variant="outline" className="border-border" onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Total Users</p>
          {isLoading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <p className="text-2xl font-semibold text-foreground mt-1">
              {apiStats?.totalUsers?.toLocaleString() ?? 0}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Active Today</p>
          {isLoading ? (
            <Skeleton className="h-8 w-20 mt-1" />
          ) : (
            <p className="text-2xl font-semibold text-foreground mt-1">
              {apiStats?.activeToday ?? 0}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Flagged Users</p>
          {isLoading ? (
            <Skeleton className="h-8 w-16 mt-1" />
          ) : (
            <p className="text-2xl font-semibold text-warning mt-1">
              {apiStats?.flaggedUsers ?? 0}
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Blocked Users</p>
          {isLoading ? (
            <Skeleton className="h-8 w-16 mt-1" />
          ) : (
            <p className="text-2xl font-semibold text-destructive mt-1">
              {apiStats?.blockedUsers ?? 0}
            </p>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by wallet address or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary border-border font-mono"
          />
        </div>
        <Button variant="outline" className="border-border">
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* User List */}
      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
            <Skeleton className="h-[72px] w-full" />
          </>
        ) : filteredUsers.length > 0 ? (
          filteredUsers.map((user) => (
            <UserRow
              key={user.id}
              walletAddress={user.walletAddress}
              name={user.name}
              email={user.email}
              avatar={user.image}
              activeChallenges={user.activeChallenges}
              completedChallenges={user.completedChallenges}
              totalEarned={user.totalEarned}
              totalStaked={user.totalStaked}
              missedDays={user.missedDays}
              flagged={user.flagged}
            />
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No users found matching your search
          </div>
        )}
      </div>
    </div>
  );
}
