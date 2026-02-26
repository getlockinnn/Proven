import { useState } from "react";
import { X, Calendar, DollarSign, Tag, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useCreateChallenge } from "@/hooks/useAdminData";
import { ImageUpload } from "@/lib/ImageUpload";

const CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "fitness", label: "Fitness" },
  { value: "wellness", label: "Wellness" },
  { value: "learning", label: "Learning" },
  { value: "productivity", label: "Productivity" },
  { value: "finance", label: "Finance" },
  { value: "creativity", label: "Creativity" },
];

const DURATIONS = [
  { value: "7", label: "7 Days" },
  { value: "14", label: "14 Days" },
  { value: "21", label: "21 Days" },
  { value: "30", label: "30 Days" },
  { value: "60", label: "60 Days" },
  { value: "90", label: "90 Days" },
];

interface CreateChallengeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateChallengeForm({ open, onOpenChange }: CreateChallengeFormProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    duration: "",
    stakeAmount: "",
    startDate: "",
    proofType: "image",
    image: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createChallenge = useCreateChallenge();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.category || !formData.duration || !formData.stakeAmount || !formData.startDate) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await createChallenge.mutateAsync({
        title: formData.title,
        description: formData.description || undefined,
        category: formData.category,
        duration: Number(formData.duration),
        stakeAmount: Number(formData.stakeAmount),
        startDate: formData.startDate,
        proofType: formData.proofType,
        image: formData.image || undefined,
      });

      toast({
        title: "Challenge created",
        description: `"${formData.title}" has been created successfully`,
      });

      setFormData({
        title: "",
        description: "",
        category: "",
        duration: "",
        stakeAmount: "",
        startDate: "",
        proofType: "image",
        image: "",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create challenge. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] bg-card border-border p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Create New Challenge
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium text-foreground">
              Challenge Title <span className="text-primary">*</span>
            </Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="title"
                placeholder="e.g., 30-Day Meditation Journey"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="pl-10 bg-secondary border-border focus:border-primary"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-foreground">
              Description
            </Label>
            <Textarea
              id="description"
              placeholder="Describe what participants need to do..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-secondary border-border focus:border-primary min-h-[80px] resize-none"
            />
          </div>

          {/* Category & Duration Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                Category <span className="text-primary">*</span>
              </Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger className="bg-secondary border-border focus:border-primary">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Select category" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                Duration <span className="text-primary">*</span>
              </Label>
              <Select
                value={formData.duration}
                onValueChange={(value) => setFormData({ ...formData, duration: value })}
              >
                <SelectTrigger className="bg-secondary border-border focus:border-primary">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Select duration" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {DURATIONS.map((dur) => (
                    <SelectItem key={dur.value} value={dur.value}>
                      {dur.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stake Amount & Start Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stakeAmount" className="text-sm font-medium text-foreground">
                Stake Amount (USDC) <span className="text-primary">*</span>
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="stakeAmount"
                  type="number"
                  min="1"
                  placeholder="50"
                  value={formData.stakeAmount}
                  onChange={(e) => setFormData({ ...formData, stakeAmount: e.target.value })}
                  className="pl-10 bg-secondary border-border focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-sm font-medium text-foreground">
                Start Date <span className="text-primary">*</span>
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="pl-10 bg-secondary border-border focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Proof Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              Required Proof Type
            </Label>
            <Select
              value={formData.proofType}
              onValueChange={(value) => setFormData({ ...formData, proofType: value })}
            >
              <SelectTrigger className="bg-secondary border-border focus:border-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="image">Image Upload</SelectItem>
                <SelectItem value="video">Video Upload</SelectItem>
                <SelectItem value="both">Image or Video</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cover Image */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">
              Cover Image
            </Label>
            <ImageUpload
              value={formData.image}
              onChange={(url) => setFormData({ ...formData, image: url })}
            />
          </div>

          {/* Summary Card */}
          {formData.stakeAmount && formData.duration && (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-muted-foreground mb-2">Challenge Summary</p>
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">
                  Daily Payout per Participant
                </span>
                <span className="text-primary font-semibold">
                  ${(Number(formData.stakeAmount) / Number(formData.duration)).toFixed(2)} USDC
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSubmitting ? "Creating..." : "Create Challenge"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
