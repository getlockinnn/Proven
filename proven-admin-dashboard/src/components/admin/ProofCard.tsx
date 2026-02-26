import { Check, X, Eye, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProofCardProps {
  id: string;
  user: string;
  userAvatar: string;
  challenge: string;
  dayNumber: number;
  submittedAt: string;
  proofType: "image" | "video";
  thumbnailUrl: string;
  status: "pending" | "approved" | "rejected";
  onApprove?: () => void;
  onReject?: () => void;
  onView?: () => void;
}

export function ProofCard({
  user,
  userAvatar,
  challenge,
  dayNumber,
  submittedAt,
  proofType,
  thumbnailUrl,
  status,
  onApprove,
  onReject,
  onView,
}: ProofCardProps) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 transition-colors">
      <div className="aspect-video relative bg-muted">
        <img
          src={thumbnailUrl}
          alt="Proof"
          className="w-full h-full object-cover"
        />
        <Badge className="absolute top-2 right-2 bg-background/80 text-foreground backdrop-blur-sm uppercase text-[10px]">
          {proofType}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-background/50 backdrop-blur-sm hover:bg-background/80 text-foreground opacity-0 hover:opacity-100 transition-opacity"
          onClick={onView}
        >
          <Eye className="w-5 h-5" />
        </Button>
      </div>
      
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-warning flex items-center justify-center text-primary-foreground text-xs font-medium overflow-hidden">
            {userAvatar ? (
              <img src={userAvatar} alt={user} className="w-full h-full object-cover" />
            ) : (
              user.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{user}</p>
            <p className="text-xs text-muted-foreground truncate">{challenge}</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {submittedAt}
          </span>
          <Badge variant="secondary" className="text-[10px]">
            Day {dayNumber}
          </Badge>
        </div>

        {status === "pending" && (
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 bg-success/10 text-success hover:bg-success/20 hover:text-success"
              onClick={onApprove}
            >
              <Check className="w-4 h-4 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
              onClick={onReject}
            >
              <X className="w-4 h-4 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
