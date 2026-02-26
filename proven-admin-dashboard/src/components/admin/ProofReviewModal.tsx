import { useState } from "react";
import { X, Check, Clock, User, Calendar, Play, Pause, Volume2, VolumeX, Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Proof {
  id: string;
  user: string;
  userAvatar: string;
  challenge: string;
  dayNumber: number;
  submittedAt: string;
  proofType: "image" | "video";
  thumbnailUrl: string;
  status: "pending" | "approved" | "rejected";
}

interface ProofReviewModalProps {
  proof: Proof | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (proofId: string) => void;
  onReject: (proofId: string, reason: string, category: string) => void;
  onFlagForReview: (proofId: string) => void;
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const rejectionReasons = [
  { value: "unclear", label: "Unclear or Low Quality" },
  { value: "unrelated", label: "Unrelated Content" },
  { value: "timestamp", label: "Invalid Timestamp" },
  { value: "duplicate", label: "Duplicate Submission" },
  { value: "incomplete", label: "Incomplete Proof" },
  { value: "other", label: "Other" },
];

export function ProofReviewModal({
  proof,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onFlagForReview,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: ProofReviewModalProps) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionCategory, setRejectionCategory] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  if (!proof) return null;

  const handleApprove = () => {
    onApprove(proof.id);
    onOpenChange(false);
    resetForm();
  };

  const handleReject = () => {
    if (!rejectionCategory) return;
    onReject(proof.id, rejectionReason, rejectionCategory);
    onOpenChange(false);
    resetForm();
  };

  const handleFlag = () => {
    onFlagForReview(proof.id);
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setShowRejectForm(false);
    setRejectionCategory("");
    setRejectionReason("");
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl p-0 bg-card border-border overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Media Preview Section */}
          <div className="lg:w-3/5 bg-background relative">
            {/* Navigation Arrows */}
            {onNavigate && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/50 backdrop-blur-sm hover:bg-background/80 disabled:opacity-30"
                  onClick={() => onNavigate("prev")}
                  disabled={!hasPrev}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/50 backdrop-blur-sm hover:bg-background/80 disabled:opacity-30"
                  onClick={() => onNavigate("next")}
                  disabled={!hasNext}
                >
                  <ChevronRight className="w-5 h-5" />
                </Button>
              </>
            )}

            {/* Media Content */}
            <div className="aspect-video lg:aspect-auto lg:h-full relative">
              {proof.proofType === "video" ? (
                <div className="relative w-full h-full min-h-[300px] lg:min-h-[500px]">
                  <video
                    src={proof.thumbnailUrl}
                    poster={proof.thumbnailUrl}
                    className="w-full h-full object-contain bg-black"
                    controls={false}
                    muted={isMuted}
                  />
                  {/* Video Controls Overlay */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-full px-4 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8"
                      onClick={() => setIsPlaying(!isPlaying)}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8"
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              ) : (
                <img
                  src={proof.thumbnailUrl}
                  alt="Proof submission"
                  className="w-full h-full object-contain bg-black min-h-[300px] lg:min-h-[500px]"
                />
              )}
              
              {/* Media Type Badge */}
              <Badge className="absolute top-4 left-4 bg-background/80 text-foreground backdrop-blur-sm uppercase text-[10px]">
                {proof.proofType}
              </Badge>
            </div>
          </div>

          {/* Details Section */}
          <div className="lg:w-2/5 p-6 flex flex-col">
            <DialogHeader className="pb-4 border-b border-border">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg font-semibold">Proof Review</DialogTitle>
                <Badge 
                  variant="outline" 
                  className={
                    proof.status === "pending" 
                      ? "border-warning/50 text-warning bg-warning/10" 
                      : proof.status === "approved"
                      ? "border-success/50 text-success bg-success/10"
                      : "border-destructive/50 text-destructive bg-destructive/10"
                  }
                >
                  {proof.status}
                </Badge>
              </div>
            </DialogHeader>

            {/* Proof Details */}
            <div className="flex-1 py-4 space-y-4 overflow-y-auto">
              {/* User Info */}
              <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-warning flex items-center justify-center text-primary-foreground text-sm font-medium overflow-hidden">
                  {proof.userAvatar ? (
                    <img src={proof.userAvatar} alt={proof.user} className="w-full h-full object-cover" />
                  ) : (
                    proof.user.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">{proof.user}</p>
                  <p className="text-sm text-muted-foreground">Participant</p>
                </div>
              </div>

              {/* Challenge Info */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Challenge:</span>
                  <span className="text-foreground font-medium">{proof.challenge}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Day:</span>
                  <Badge variant="secondary">{proof.dayNumber}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Submitted:</span>
                  <span className="text-foreground">{proof.submittedAt}</span>
                </div>
              </div>

              {/* Rejection Form */}
              {showRejectForm && (
                <div className="space-y-4 p-4 bg-destructive/5 border border-destructive/20 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Rejection Category *</Label>
                    <Select value={rejectionCategory} onValueChange={setRejectionCategory}>
                      <SelectTrigger className="bg-secondary border-border">
                        <SelectValue placeholder="Select a reason..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {rejectionReasons.map((reason) => (
                          <SelectItem key={reason.value} value={reason.value}>
                            {reason.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Additional Details (Optional)</Label>
                    <Textarea
                      placeholder="Provide more context for the rejection..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="bg-secondary border-border min-h-[80px] resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-border space-y-3">
              {proof.status === "pending" && !showRejectForm && (
                <>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-success hover:bg-success/90 text-success-foreground"
                      onClick={handleApprove}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Approve Proof
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => setShowRejectForm(true)}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full border-border"
                    onClick={handleFlag}
                  >
                    <Flag className="w-4 h-4 mr-2" />
                    Flag for Re-review
                  </Button>
                </>
              )}

              {showRejectForm && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-border"
                    onClick={() => setShowRejectForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleReject}
                    disabled={!rejectionCategory}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Confirm Rejection
                  </Button>
                </div>
              )}

              {proof.status !== "pending" && (
                <Button
                  variant="outline"
                  className="w-full border-border"
                  onClick={handleClose}
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}