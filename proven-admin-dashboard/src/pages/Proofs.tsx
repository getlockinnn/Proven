import { useState, useMemo } from "react";
import { Search, Filter, Clock, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProofCard } from "@/components/admin/ProofCard";
import { ProofReviewModal } from "@/components/admin/ProofReviewModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useProofs, useApproveProof, useRejectProof, useFlagProof } from "@/hooks/useAdminData";
import type { Proof } from "@/lib/api/types";

export default function Proofs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch proofs based on active tab
  const { data: proofsData, isLoading } = useProofs({
    status: activeTab === "all" ? undefined : activeTab.toUpperCase(),
    search: searchQuery || undefined,
  });

  const proofs = proofsData?.data?.proofs || [];
  const summary = proofsData?.data?.summary;

  // Fetch all proofs for stats
  const { data: allProofsData } = useProofs({ limit: 100 });
  const allProofs = allProofsData?.data?.proofs || [];

  const stats = useMemo(() => ({
    all: allProofs.length,
    pending: allProofs.filter((p) => p.status === "pending").length,
    approved: allProofs.filter((p) => p.status === "approved").length,
    rejected: allProofs.filter((p) => p.status === "rejected").length,
  }), [allProofs]);

  // Mutations
  const approveProofMutation = useApproveProof();
  const rejectProofMutation = useRejectProof();
  const flagProofMutation = useFlagProof();

  // Filter proofs locally for search
  const filteredProofs = useMemo(() => {
    if (!searchQuery) return proofs;
    return proofs.filter((proof) =>
      proof.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      proof.challenge.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [proofs, searchQuery]);

  const handleViewProof = (proof: Proof) => {
    setSelectedProof(proof);
    setModalOpen(true);
  };

  const handleApprove = async (proofId: string) => {
    try {
      const response = await approveProofMutation.mutateAsync(proofId);
      const data = response.data?.data;

      if (data?.payoutFailed) {
        toast({
          title: "Approved (Payout Failed)",
          description: `Proof approved but daily payout of $${data.dailyPayout?.toFixed(2)} failed: ${data.payoutError}`,
          variant: "destructive",
        });
      } else if (data?.dailyPayout) {
        toast({
          title: "Proof Approved",
          description: `Approved — $${data.dailyPayout.toFixed(2)} USDC sent to wallet`,
        });
      } else {
        toast({
          title: "Proof Approved",
          description: "The proof has been approved.",
        });
      }
      setModalOpen(false);
    } catch (error: any) {
      toast({
        title: "Approval Issue",
        description: error.message || "We couldn't approve this proof right now. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (proofId: string, reason: string, category: string) => {
    try {
      await rejectProofMutation.mutateAsync({ id: proofId, reason, category });
      toast({
        title: "Proof Rejected",
        description: `Reason: ${category}${reason ? ` - ${reason}` : ""}`,
      });
      setModalOpen(false);
    } catch (error: any) {
      toast({
        title: "Rejection Issue",
        description: error.message || "We couldn't reject this proof right now. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFlag = async (proofId: string) => {
    try {
      await flagProofMutation.mutateAsync({ id: proofId });
      toast({
        title: "Flagged for Review",
        description: "This proof has been flagged for additional review.",
      });
    } catch (error: any) {
      toast({
        title: "Flag Issue",
        description: error.message || "We couldn't flag this proof right now. Please try again.",
        variant: "destructive",
      });
    }
  };

  const currentProofIndex = filteredProofs.findIndex((p) => p.id === selectedProof?.id);

  const handleNavigate = (direction: "prev" | "next") => {
    const newIndex = direction === "prev" ? currentProofIndex - 1 : currentProofIndex + 1;
    if (newIndex >= 0 && newIndex < filteredProofs.length) {
      setSelectedProof(filteredProofs[newIndex]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Proof Review</h1>
          <p className="text-muted-foreground mt-1">Verify and approve submitted proofs</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-warning/50 text-warning bg-warning/10">
            <Clock className="w-3 h-3 mr-1" />
            {summary?.pending ?? stats.pending} pending
          </Badge>
          {summary?.urgent ? (
            <Badge variant="outline" className="border-destructive/50 text-destructive bg-destructive/10">
              {summary.urgent} urgent
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by user or challenge..."
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
          <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Pending ({stats.pending})
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
            Approved ({stats.approved})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <XCircle className="w-3.5 h-3.5 mr-1.5" />
            Rejected ({stats.rejected})
          </TabsTrigger>
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All ({stats.all})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-[280px] w-full" />
              ))}
            </div>
          ) : filteredProofs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProofs.map((proof) => (
                <ProofCard
                  key={proof.id}
                  id={proof.id}
                  user={proof.user}
                  userAvatar={proof.userAvatar}
                  challenge={proof.challenge}
                  dayNumber={proof.dayNumber}
                  submittedAt={proof.submittedAt}
                  proofType={proof.proofType}
                  thumbnailUrl={proof.thumbnailUrl}
                  status={proof.status}
                  onApprove={() => handleApprove(proof.id)}
                  onReject={() => {
                    setSelectedProof(proof);
                    setModalOpen(true);
                  }}
                  onView={() => handleViewProof(proof)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No proofs found matching your criteria
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Proof Review Modal */}
      <ProofReviewModal
        proof={selectedProof}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onApprove={handleApprove}
        onReject={handleReject}
        onFlagForReview={handleFlag}
        onNavigate={handleNavigate}
        hasPrev={currentProofIndex > 0}
        hasNext={currentProofIndex < filteredProofs.length - 1}
      />
    </div>
  );
}
