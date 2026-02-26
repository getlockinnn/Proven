import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChallengeCloseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  challengeId?: string;
  challengeData?: {
    title: string;
    poolSize: number;
    activeParticipants: number;
    droppedParticipants: number;
    completedParticipants?: number;
  };
  participants?: Array<{
    id: string;
    name: string;
    wallet: string;
    image?: string;
    daysCompleted: number;
    totalDays: number;
    status: string;
    stakeAmount?: number;
  }>;
}

type Step = "confirm" | "processing" | "success";

export default function ChallengeFinalizationModal({
  open,
  onOpenChange,
  onConfirm,
  challengeData,
  participants = [],
}: ChallengeCloseModalProps) {
  const [step, setStep] = useState<Step>("confirm");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      setError(null);
    }
  }, [open]);

  const completed = participants.filter(p => p.status === 'completed' || p.status === 'active').length;
  const failed = participants.filter(p => p.status === 'dropped' || p.status === 'failed').length;

  const handleConfirm = async () => {
    setStep("processing");
    setError(null);
    try {
      await onConfirm();
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setStep("confirm");
    }
  };

  const handleClose = () => {
    setStep("confirm");
    setError(null);
    onOpenChange(false);
  };

  const renderConfirm = () => (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Close Challenge
        </DialogTitle>
        <DialogDescription>
          Close "{challengeData?.title}" and finalize all participant statuses.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-secondary/50 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="w-4 h-4" />
                <span className="text-sm">Participants</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {challengeData?.activeParticipants ?? 0 + (challengeData?.droppedParticipants ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-secondary/50 border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Wallet className="w-4 h-4" />
                <span className="text-sm">Pool</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                ${challengeData?.poolSize?.toLocaleString() ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* What will happen */}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-foreground mb-3">This will:</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
                Update all participant statuses (completed or failed)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
                Sweep any remaining escrow dust to treasury
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
                Mark challenge as finalized (cannot be undone)
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              Daily payouts and bonuses were already distributed via the settlement system.
              This step only updates final statuses and cleans up remaining funds.
            </p>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
            <p className="text-sm text-destructive flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {error}
            </p>
          </div>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={handleClose} className="border-border">
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          className="bg-success hover:bg-success/90 text-success-foreground gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Close Challenge
        </Button>
      </DialogFooter>
    </>
  );

  const renderProcessing = () => (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl flex items-center gap-2">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          Closing Challenge
        </DialogTitle>
        <DialogDescription>
          Updating statuses and sweeping remaining funds...
        </DialogDescription>
      </DialogHeader>

      <div className="py-12 flex flex-col items-center justify-center space-y-4">
        <div className="w-20 h-20 rounded-full border-4 border-primary/20 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground">This may take a moment...</p>
      </div>

      <DialogFooter>
        <Button disabled variant="outline" className="w-full">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </Button>
      </DialogFooter>
    </>
  );

  const renderSuccess = () => (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-success" />
          Challenge Closed
        </DialogTitle>
        <DialogDescription>
          The challenge has been successfully closed and finalized.
        </DialogDescription>
      </DialogHeader>

      <div className="py-8 flex flex-col items-center justify-center space-y-4">
        <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-success" />
        </div>
        <p className="text-sm text-muted-foreground">
          All participant statuses have been updated and remaining funds swept.
        </p>
      </div>

      <DialogFooter>
        <Button onClick={handleClose} className="w-full">
          Done
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "bg-card border-border max-w-lg",
        step === "processing" && "pointer-events-auto"
      )}>
        {step === "confirm" && renderConfirm()}
        {step === "processing" && renderProcessing()}
        {step === "success" && renderSuccess()}
      </DialogContent>
    </Dialog>
  );
}
