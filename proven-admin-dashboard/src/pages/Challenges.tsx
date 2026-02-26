import { useState, useMemo } from "react";
import { Plus, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChallengeRow } from "@/components/admin/ChallengeRow";
import { CreateChallengeForm } from "@/components/admin/CreateChallengeForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useChallenges } from "@/hooks/useAdminData";

export default function Challenges() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Fetch challenges from API
  const { data: challengesData, isLoading } = useChallenges({
    status: activeTab === "all" ? undefined : activeTab,
    search: searchQuery || undefined,
  });

  const challenges = challengesData?.data?.challenges || [];

  // Calculate stats from all challenges (fetch all for stats)
  const { data: allChallengesData } = useChallenges({ limit: 100 });
  const allChallenges = allChallengesData?.data?.challenges || [];

  const stats = useMemo(() => ({
    all: allChallenges.length,
    active: allChallenges.filter((c) => c.status === "active").length,
    upcoming: allChallenges.filter((c) => c.status === "upcoming").length,
    completed: allChallenges.filter((c) => c.status === "completed").length,
  }), [allChallenges]);

  // Filter challenges locally for search (API may not support search yet)
  const filteredChallenges = useMemo(() => {
    if (!searchQuery) return challenges;
    return challenges.filter((challenge) =>
      challenge.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [challenges, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Challenges</h1>
          <p className="text-muted-foreground mt-1">Manage all challenges in the ecosystem</p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Challenge
        </Button>
      </div>

      <CreateChallengeForm open={showCreateForm} onOpenChange={setShowCreateForm} />

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search challenges..."
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All ({stats.all})
          </TabsTrigger>
          <TabsTrigger value="active" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Active ({stats.active})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Upcoming ({stats.upcoming})
          </TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Completed ({stats.completed})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6 space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-[80px] w-full" />
              <Skeleton className="h-[80px] w-full" />
              <Skeleton className="h-[80px] w-full" />
            </>
          ) : filteredChallenges.length > 0 ? (
            filteredChallenges.map((challenge) => (
              <ChallengeRow
                key={challenge.id}
                id={challenge.id}
                title={challenge.title}
                category={challenge.category}
                duration={challenge.duration}
                stakeAmount={challenge.stakeAmount}
                status={challenge.status}
                participants={challenge.participants}
                poolSize={challenge.poolSize}
                startDate={new Date(challenge.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
            ))
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No challenges found matching your criteria
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
