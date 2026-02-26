import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  Wallet,
  Calendar,
  Clock,
  Trophy,
  TrendingUp,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  Pause,
  StopCircle,
  Flag,
  Loader2,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import ChallengeFinalizationModal from "@/components/admin/ChallengeFinalizationModal";
import { useChallengeDetails, useParticipants, useProgress, useCloseChallenge, usePauseChallenge, useEndChallenge, useDeleteChallenge, useProofs } from "@/hooks/useAdminData";

const statusStyles = {
  upcoming: "bg-warning/10 text-warning border-warning/20",
  active: "bg-success/10 text-success border-success/20",
  completed: "bg-muted text-muted-foreground border-muted",
};

const proofStatusStyles = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

type ProofHistoryItem = {
  id: string;
  dayNumber?: number;
  submissionDate?: string;
  reviewedAt?: string | null;
  status?: string;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

type ParticipantItem = {
  id: string;
  image?: string | null;
  name?: string | null;
  email?: string | null;
  wallet?: string | null;
  daysCompleted: number;
  totalDays: number;
  missedDays: number;
  status: string;
};

export default function ChallengeDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [finalizationOpen, setFinalizationOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch real data from API
  const { data: challengeResponse, isLoading: challengeLoading, error: challengeError } = useChallengeDetails(id || "");
  const { data: participantsResponse, isLoading: participantsLoading } = useParticipants(id || "");
  const { data: progressResponse, isLoading: progressLoading } = useProgress(id || "");
  const { data: proofsResponse } = useProofs({ challengeId: id, limit: 20 });
  const closeChallengeAction = useCloseChallenge();
  const pauseChallenge = usePauseChallenge();
  const endChallenge = useEndChallenge();
  const deleteChallenge = useDeleteChallenge();

  const challengeData = challengeResponse?.data;
  const participants: ParticipantItem[] = participantsResponse?.data?.participants || [];
  const dailyProgressData = progressResponse?.data?.dailyProgress || [];
  const proofHistory: ProofHistoryItem[] = proofsResponse?.data?.proofs || [];

  const handleCloseChallenge = async () => {
    if (!id) return;
    try {
      await closeChallengeAction.mutateAsync(id);
      toast({
        title: "Challenge Closed",
        description: "Statuses updated and remaining funds swept.",
      });
      setFinalizationOpen(false);
    } catch (error) {
      toast({
        title: "Close Failed",
        description: "Failed to close challenge. Please try again.",
        variant: "destructive",
      });
      throw error; // re-throw so modal shows error state
    }
  };

  const handlePauseChallenge = async () => {
    if (!id || !challengeData) return;
    const isPaused = challengeData.isPaused;
    try {
      await pauseChallenge.mutateAsync({ id, pause: !isPaused });
      toast({
        title: isPaused ? "Challenge Resumed" : "Challenge Paused",
        description: isPaused
          ? "The challenge has been resumed. Participants can submit proofs again."
          : "The challenge has been paused. Participants cannot submit proofs.",
      });
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast({
        title: "Action Failed",
        description: error?.response?.data?.message || "Failed to pause/resume challenge.",
        variant: "destructive",
      });
    }
  };

  const handleEndChallenge = async () => {
    if (!id) return;
    try {
      const result = await endChallenge.mutateAsync({ id });
      toast({
        title: "Challenge Ended",
        description: `Challenge ended early. ${result.data?.data?.activeParticipantsAffected || 0} active participants affected.`,
      });
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast({
        title: "Action Failed",
        description: error?.response?.data?.message || "Failed to end challenge.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteChallenge = async () => {
    if (!id) return;
    try {
      await deleteChallenge.mutateAsync(id);
      toast({
        title: "Challenge Deleted",
        description: "The challenge and all associated data have been permanently deleted.",
      });
      navigate("/challenges");
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      toast({
        title: "Delete Failed",
        description: error?.response?.data?.message || "Failed to delete challenge.",
        variant: "destructive",
      });
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return "just now";
  };

  // Loading state
  if (challengeLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (challengeError || !challengeData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-muted-foreground">Challenge not found or failed to load</p>
        <Button onClick={() => navigate("/challenges")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Challenges
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button & Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-4">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate("/challenges")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Challenges
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-semibold text-foreground">{challengeData.title}</h1>
              <Badge variant="outline" className={cn("text-xs", statusStyles[challengeData.status as keyof typeof statusStyles])}>
                {challengeData.status}
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl">{challengeData.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setFinalizationOpen(true)}
            className="bg-success hover:bg-success/90 text-success-foreground gap-2"
            disabled={challengeData.status !== 'completed'}
          >
            <Flag className="w-4 h-4" />
            Close Challenge
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-border">
                <MoreHorizontal className="w-4 h-4 mr-2" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card border-border">
              <DropdownMenuItem
                className="text-warning cursor-pointer"
                onClick={handlePauseChallenge}
                disabled={pauseChallenge.isPending || challengeData.status !== 'active'}
              >
                <Pause className="w-4 h-4 mr-2" />
                {challengeData.isPaused ? 'Resume Challenge' : 'Pause Challenge'}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive cursor-pointer"
                onClick={handleEndChallenge}
                disabled={endChallenge.isPending || challengeData.status === 'completed'}
              >
                <StopCircle className="w-4 h-4 mr-2" />
                End Challenge
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive cursor-pointer"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleteChallenge.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Challenge
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ChallengeFinalizationModal
        open={finalizationOpen}
        onOpenChange={setFinalizationOpen}
        onConfirm={handleCloseChallenge}
        challengeId={id}
        challengeData={challengeData ? {
          title: challengeData.title,
          poolSize: challengeData.poolSize || 0,
          activeParticipants: challengeData.activeParticipants || 0,
          droppedParticipants: challengeData.droppedParticipants || 0,
          completedParticipants: challengeData.completedParticipants,
        } : undefined}
        participants={participants}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Challenge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>"{challengeData.title}"</strong>?
              <br /><br />
              This will permanently delete:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>The challenge and its escrow wallet</li>
                <li>All {challengeData.participants} participant enrollments</li>
                <li>All submissions and proofs</li>
                <li>All related transactions</li>
              </ul>
              <br />
              <strong className="text-destructive">This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChallenge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteChallenge.isPending}
            >
              {deleteChallenge.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...</>
              ) : (
                "Delete Permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Key Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs">Participants</span>
            </div>
            <p className="text-xl font-semibold text-foreground">{challengeData.participants}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Wallet className="w-4 h-4" />
              <span className="text-xs">Pool Size</span>
            </div>
            <p className="text-xl font-semibold text-foreground">${challengeData.poolSize?.toLocaleString() || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-xs">Duration</span>
            </div>
            <p className="text-xl font-semibold text-foreground">{challengeData.duration} days</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-xs">Current Day</span>
            </div>
            <p className="text-xl font-semibold text-foreground">Day {challengeData.currentDay}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Boundary timezone: IST</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Completion Rate</span>
            </div>
            <p className="text-xl font-semibold text-success">{challengeData.completionRate}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Trophy className="w-4 h-4" />
              <span className="text-xs">Active / Dropped</span>
            </div>
            <p className="text-xl font-semibold text-foreground">
              <span className="text-success">{challengeData.activeParticipants}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-destructive">{challengeData.droppedParticipants}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Overview
          </TabsTrigger>
          <TabsTrigger value="participants" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Participants ({challengeData.participants})
          </TabsTrigger>
          <TabsTrigger value="proofs" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Proof History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Daily Progress Chart */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Daily Progress</CardTitle>
            </CardHeader>
            <CardContent>
              {progressLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : dailyProgressData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyProgressData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="day"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Bar dataKey="approved" fill="hsl(var(--success))" name="Approved" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="rejected" fill="hsl(var(--destructive))" name="Rejected" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No progress data available yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Completion Trend */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Active Participants Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {progressLoading ? (
                <div className="h-[250px] flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : dailyProgressData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyProgressData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="day"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="submissions"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))" }}
                        name="Submissions"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  No submission data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="participants" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              {participantsLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : participants.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Participant</TableHead>
                      <TableHead className="text-muted-foreground">Wallet</TableHead>
                      <TableHead className="text-muted-foreground">Progress</TableHead>
                      <TableHead className="text-muted-foreground">Missed Days</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((participant) => (
                      <TableRow key={participant.id} className="border-border">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              {participant.image && <AvatarImage src={participant.image} />}
                              <AvatarFallback className="bg-gradient-to-br from-primary to-warning text-primary-foreground text-xs">
                                {(participant.name || participant.email || 'U').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-foreground">{participant.name || participant.email || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm">
                          {participant.wallet ? `${participant.wallet.slice(0, 6)}...${participant.wallet.slice(-4)}` : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 w-40">
                            <Progress
                              value={(participant.daysCompleted / participant.totalDays) * 100}
                              className="h-2 flex-1"
                            />
                            <span className="text-sm text-muted-foreground whitespace-nowrap">
                              {participant.daysCompleted}/{participant.totalDays}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "text-sm",
                            participant.missedDays > 0 ? "text-destructive" : "text-muted-foreground"
                          )}>
                            {participant.missedDays}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              participant.status === "active"
                                ? "bg-success/10 text-success border-success/20"
                                : participant.status === "completed"
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : "bg-destructive/10 text-destructive border-destructive/20"
                            )}
                          >
                            {participant.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  No participants yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proofs" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              {proofHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">User</TableHead>
                      <TableHead className="text-muted-foreground">Day</TableHead>
                      <TableHead className="text-muted-foreground">Submitted</TableHead>
                      <TableHead className="text-muted-foreground">Reviewed</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proofHistory.map((proof) => (
                      <TableRow key={proof.id} className="border-border">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              {proof.user?.image && <AvatarImage src={proof.user.image} />}
                              <AvatarFallback className="bg-gradient-to-br from-primary to-warning text-primary-foreground text-xs">
                                {(proof.user?.name || proof.user?.email || 'U').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-foreground">{proof.user?.name || proof.user?.email || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">Day {proof.dayNumber || '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {proof.submissionDate ? formatRelativeTime(proof.submissionDate) : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {proof.reviewedAt ? formatRelativeTime(proof.reviewedAt) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs", proofStatusStyles[proof.status?.toLowerCase() as keyof typeof proofStatusStyles])}>
                            {proof.status?.toLowerCase() === "approved" && <CheckCircle className="w-3 h-3 mr-1" />}
                            {proof.status?.toLowerCase() === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                            {proof.status?.toLowerCase() === "pending" && <Clock className="w-3 h-3 mr-1" />}
                            {proof.status?.toLowerCase() || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:text-primary"
                            onClick={() => navigate("/proofs")}
                          >
                            View Proof
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  No proofs submitted yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
