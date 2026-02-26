import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Users, Wallet, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ChallengeRowProps {
  id: string;
  title: string;
  category: string;
  duration: number;
  stakeAmount: number;
  status: "upcoming" | "active" | "completed";
  participants: number;
  poolSize: number;
  startDate: string;
}

const statusStyles = {
  upcoming: "bg-warning/10 text-warning border-warning/20",
  active: "bg-success/10 text-success border-success/20",
  completed: "bg-muted text-muted-foreground border-muted",
};

export function ChallengeRow({
  id,
  title,
  category,
  duration,
  stakeAmount,
  status,
  participants,
  poolSize,
  startDate,
}: ChallengeRowProps) {
  const navigate = useNavigate();
  
  return (
    <div 
      className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:border-primary/30 transition-colors group cursor-pointer"
      onClick={() => navigate(`/challenges/${id}`)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-medium text-foreground truncate">{title}</h3>
          <Badge variant="outline" className={cn("text-xs", statusStyles[status])}>
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="bg-secondary px-2 py-0.5 rounded text-xs">{category}</span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {duration} days
          </span>
          <span className="flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5" />
            ${stakeAmount}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Participants</p>
          <p className="font-semibold text-foreground flex items-center justify-center gap-1">
            <Users className="w-3.5 h-3.5 text-primary" />
            {participants}
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Pool Size</p>
          <p className="font-semibold text-foreground">${poolSize.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground text-xs">Start Date</p>
          <p className="font-medium text-foreground">{startDate}</p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-card border-border">
          <DropdownMenuItem onClick={() => navigate(`/challenges/${id}`)}>View Details</DropdownMenuItem>
          <DropdownMenuItem>Manage Participants</DropdownMenuItem>
          <DropdownMenuItem className="text-warning">Pause Challenge</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">End Challenge</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
