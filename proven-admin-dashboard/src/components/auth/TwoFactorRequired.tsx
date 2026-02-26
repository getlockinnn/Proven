import { useState } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { TwoFactorSetup } from './TwoFactorSetup';

interface TwoFactorRequiredProps {
  onSetupComplete: () => void;
}

export function TwoFactorRequired({ onSetupComplete }: TwoFactorRequiredProps) {
  const { user, signOut, refreshAdminStatus } = useAuth();
  const [showSetup, setShowSetup] = useState(false);

  const handleSetupComplete = async () => {
    await refreshAdminStatus();
    onSetupComplete();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-warning/10 mb-4">
          <AlertTriangle className="w-8 h-8 text-warning" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          Two-Factor Authentication Required
        </h1>

        <p className="text-muted-foreground mb-6">
          Admin accounts require two-factor authentication for enhanced security.
          Please set up 2FA to continue.
        </p>

        {user?.email && (
          <p className="text-sm text-muted-foreground mb-6">
            Signed in as: {user.email}
          </p>
        )}

        <div className="space-y-3">
          <Button onClick={() => setShowSetup(true)} className="w-full gap-2">
            <Shield className="w-4 h-4" />
            Set Up Two-Factor Authentication
          </Button>

          <Button variant="ghost" onClick={signOut} className="w-full text-muted-foreground">
            Sign Out
          </Button>
        </div>

        <TwoFactorSetup
          open={showSetup}
          onOpenChange={setShowSetup}
          onSuccess={handleSetupComplete}
        />
      </div>
    </div>
  );
}
