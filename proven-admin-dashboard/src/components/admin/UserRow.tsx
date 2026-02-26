import { MoreHorizontal, Trophy, Wallet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface UserRowProps {
  walletAddress: string;
  name?: string;
  email?: string;
  avatar?: string;
  activeChallenges: number;
  completedChallenges: number;
  totalEarned: number;
  totalStaked: number;
  missedDays: number;
  flagged?: boolean;
}

export function UserRow({
  walletAddress,
  name,
  email,
  avatar,
  activeChallenges,
  completedChallenges,
  totalEarned,
  totalStaked,
  missedDays,
  flagged,
}: UserRowProps) {
  const shortAddress = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : null;
  const displayName = name || email?.split('@')[0] || shortAddress || 'Unknown User';

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 bg-card rounded-xl border transition-colors group",
      flagged ? "border-warning/50" : "border-border hover:border-primary/30"
    )}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-warning flex items-center justify-center text-primary-foreground text-sm font-medium overflow-hidden shrink-0">
          {avatar ? (
            <img src={avatar} alt={shortAddress} className="w-full h-full object-cover" />
          ) : (
            walletAddress.slice(2, 4).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm text-foreground">{displayName}</p>
            {flagged && (
              <Badge variant="outline" className="border-warning/50 text-warning bg-warning/10 text-[10px]">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Flagged
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {shortAddress && <span className="font-mono mr-2">{shortAddress}</span>}
            {activeChallenges} active · {completedChallenges} completed
          </p>
        </div>
      </div>

      <div className="flex items-center gap-8 text-sm">
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Earned</p>
          <p className="font-semibold text-success">${totalEarned.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Staked</p>
          <p className="font-semibold text-foreground">${totalStaked.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Missed</p>
          <p className={cn(
            "font-semibold",
            missedDays > 3 ? "text-destructive" : "text-foreground"
          )}>
            {missedDays} days
          </p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem>View History</DropdownMenuItem>
          <DropdownMenuItem>View Active Proofs</DropdownMenuItem>
          <DropdownMenuItem className="text-warning">Flag User</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">Block Submissions</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
