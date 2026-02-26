import { useState, useEffect } from "react";
import { Save, Shield, Clock, FileType, AlertTriangle, Users, Loader2, Smartphone, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { useSettings, useUpdateSettings } from "@/hooks/useAdminData";
import { useAuth } from "@/hooks/useAuth";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import * as authApi from "@/lib/api/auth";

export default function Settings() {
  const { data: settingsResponse, isLoading } = useSettings();
  const updateSettingsMutation = useUpdateSettings();
  const { adminStatus, refreshAdminStatus, user } = useAuth();

  const settings = settingsResponse?.data;

  const [cutoffTime, setCutoffTime] = useState("23:00");
  const [reviewWindow, setReviewWindow] = useState("24");
  const [maxProofsPerDay, setMaxProofsPerDay] = useState("1");
  const [emergencyPause, setEmergencyPause] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // 2FA state
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState("");

  // Initialize form with API data
  useEffect(() => {
    if (settings) {
      setCutoffTime(settings.proofCutoffTime || "23:00");
      setReviewWindow(String(settings.reviewWindowHours || 24));
      setMaxProofsPerDay(String(settings.maxProofsPerDay || 1));
      setEmergencyPause(settings.emergencyPause || false);
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = () => {
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updateSettingsMutation.mutateAsync({
        proofCutoffTime: cutoffTime,
        reviewWindowHours: parseInt(reviewWindow, 10),
        maxProofsPerDay: parseInt(maxProofsPerDay, 10),
        emergencyPause,
      });
      toast({
        title: "Settings Saved",
        description: "System settings have been updated successfully.",
      });
      setHasChanges(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEmergencyPauseChange = (checked: boolean) => {
    setEmergencyPause(checked);
    handleChange();
  };

  const handleDisable2FA = async () => {
    if (disable2FACode.length < 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter your 2FA code",
        variant: "destructive",
      });
      return;
    }

    setDisabling2FA(true);
    try {
      await authApi.disable2FA(disable2FACode);
      await refreshAdminStatus();
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled",
      });
      setDisable2FACode("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disable 2FA",
        variant: "destructive",
      });
    } finally {
      setDisabling2FA(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">System Settings</h1>
        <p className="text-muted-foreground mt-1">Configure global system parameters</p>
      </div>

      {/* Access Warning */}
      <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium text-warning mb-1">Super Admin Access Required</h3>
          <p className="text-sm text-warning/80">
            These settings affect all challenges and users. Changes are logged and cannot be undone.
          </p>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">Two-Factor Authentication</h2>
            <p className="text-sm text-muted-foreground">Secure your account with 2FA</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
            <div className="flex items-center gap-3">
              {adminStatus?.twoFactorEnabled ? (
                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                  <Check className="w-4 h-4 text-success" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">
                  {adminStatus?.twoFactorEnabled ? "2FA Enabled" : "2FA Not Enabled"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={adminStatus?.twoFactorEnabled
                ? "border-success/50 text-success"
                : "border-muted text-muted-foreground"
              }
            >
              {adminStatus?.twoFactorEnabled ? "Active" : "Inactive"}
            </Badge>
          </div>

          {/* Enable/Disable 2FA */}
          {adminStatus?.twoFactorEnabled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                To disable 2FA, enter your current authenticator code:
              </p>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={disable2FACode}
                  onChange={(e) => setDisable2FACode(e.target.value.replace(/\D/g, ""))}
                  className="bg-secondary border-border font-mono tracking-widest w-32"
                />
                <Button
                  variant="destructive"
                  onClick={handleDisable2FA}
                  disabled={disabling2FA || disable2FACode.length !== 6}
                >
                  {disabling2FA ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Disabling...
                    </>
                  ) : (
                    "Disable 2FA"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShow2FASetup(true)} className="gap-2">
              <Shield className="w-4 h-4" />
              Enable Two-Factor Authentication
            </Button>
          )}
        </div>
      </div>

      <TwoFactorSetup
        open={show2FASetup}
        onOpenChange={setShow2FASetup}
        onSuccess={() => {
          refreshAdminStatus();
          toast({
            title: "2FA Enabled",
            description: "Two-factor authentication is now active",
          });
        }}
      />

      {/* Proof Settings */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">Proof Submission</h2>
            <p className="text-sm text-muted-foreground">Configure proof submission rules</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cutoff" className="text-foreground">Daily Cutoff Time (UTC)</Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Input
                  id="cutoff"
                  type="time"
                  value={cutoffTime}
                  onChange={(e) => { setCutoffTime(e.target.value); handleChange(); }}
                  className="bg-secondary border-border"
                />
              )}
              <p className="text-xs text-muted-foreground">Proofs must be submitted before this time</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="review" className="text-foreground">Review Window (hours)</Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Input
                  id="review"
                  type="number"
                  value={reviewWindow}
                  onChange={(e) => { setReviewWindow(e.target.value); handleChange(); }}
                  className="bg-secondary border-border"
                />
              )}
              <p className="text-xs text-muted-foreground">Time allowed for admin review</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxProofs" className="text-foreground">Max Proofs Per Day</Label>
            {isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <Input
                id="maxProofs"
                type="number"
                value={maxProofsPerDay}
                onChange={(e) => { setMaxProofsPerDay(e.target.value); handleChange(); }}
                className="bg-secondary border-border w-32"
              />
            )}
            <p className="text-xs text-muted-foreground">Maximum proof submissions per user per day</p>
          </div>
        </div>
      </div>

      {/* File Settings */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileType className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">Allowed File Types</h2>
            <p className="text-sm text-muted-foreground">Configure accepted proof formats</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-14" />
            </>
          ) : (
            (settings?.allowedFileTypes || ["jpg", "png", "heic", "mp4", "mov", "webp"]).map((type) => (
              <Badge key={type} variant="secondary" className="bg-secondary uppercase">
                {type}
              </Badge>
            ))
          )}
        </div>
      </div>

      {/* Admin Roles */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">Admin Roles</h2>
            <p className="text-sm text-muted-foreground">Manage admin access levels</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Reviewer</p>
              <p className="text-sm text-muted-foreground">Can approve/reject proofs</p>
            </div>
            <Badge variant="outline" className="border-success/50 text-success">3 members</Badge>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Manager</p>
              <p className="text-sm text-muted-foreground">Can manage challenges</p>
            </div>
            <Badge variant="outline" className="border-primary/50 text-primary">2 members</Badge>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
            <div>
              <p className="font-medium text-foreground">Super Admin</p>
              <p className="text-sm text-muted-foreground">Full system access</p>
            </div>
            <Badge variant="outline" className="border-warning/50 text-warning">1 member</Badge>
          </div>
        </div>
      </div>

      {/* Emergency Controls */}
      <div className="bg-card rounded-xl border border-destructive/30 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="font-medium text-foreground">Emergency Controls</h2>
            <p className="text-sm text-muted-foreground">Critical system toggles</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Emergency Pause</p>
            <p className="text-sm text-muted-foreground">Pause all challenge operations immediately</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-11" />
          ) : (
            <Switch
              checked={emergencyPause}
              onCheckedChange={handleEmergencyPauseChange}
            />
          )}
        </div>

        {emergencyPause && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive font-medium">
              System is currently paused. No proofs can be submitted or approved.
            </p>
          </div>
        )}
      </div>

      <Separator className="bg-border" />

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        {hasChanges && (
          <p className="text-sm text-muted-foreground self-center">You have unsaved changes</p>
        )}
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleSave}
          disabled={!hasChanges || updateSettingsMutation.isPending || isLoading}
        >
          {updateSettingsMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
