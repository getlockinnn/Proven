import { useState } from 'react';
import { Shield, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import * as authApi from '@/lib/api/auth';
import { useAuth } from '@/hooks/useAuth';

interface TwoFactorVerifyProps {
  onSuccess: () => void;
  onBack?: () => void;
}

export function TwoFactorVerify({ onSuccess, onBack }: TwoFactorVerifyProps) {
  const { user, setTwoFactorVerified, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showBackupOption, setShowBackupOption] = useState(false);

  const handleVerify = async () => {
    if (code.length < 6) {
      toast({
        title: 'Invalid Code',
        description: 'Please enter a valid code',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.verify2FA(code);
      if (response.success && response.data?.verified) {
        setTwoFactorVerified(true);

        if (response.data.usedBackupCode) {
          toast({
            title: 'Backup Code Used',
            description: 'You used a backup code. Consider regenerating your backup codes in settings.',
          });
        }

        onSuccess();
      } else {
        throw new Error(response.message || 'Invalid verification code');
      }
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid verification code. Please try again.',
        variant: 'destructive',
      });
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length >= 6) {
      handleVerify();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Two-Factor Authentication
          </h1>
          <p className="text-muted-foreground">
            {showBackupOption
              ? 'Enter one of your backup codes'
              : 'Enter the code from your authenticator app'}
          </p>
          {user?.email && (
            <p className="text-sm text-muted-foreground mt-1">
              Signed in as: {user.email}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <Input
            type="text"
            inputMode="numeric"
            pattern={showBackupOption ? '[A-Za-z0-9-]*' : '[0-9]*'}
            maxLength={showBackupOption ? 9 : 6}
            placeholder={showBackupOption ? 'XXXX-XXXX' : '000000'}
            value={code}
            onChange={(e) => {
              const value = showBackupOption
                ? e.target.value.toUpperCase()
                : e.target.value.replace(/\D/g, '');
              setCode(value);
            }}
            onKeyDown={handleKeyDown}
            className="text-center text-2xl tracking-widest font-mono"
            autoFocus
          />

          <Button
            onClick={handleVerify}
            disabled={isLoading || (showBackupOption ? code.length < 8 : code.length !== 6)}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify'
            )}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setShowBackupOption(!showBackupOption);
                setCode('');
              }}
              className="text-sm text-primary hover:underline"
            >
              {showBackupOption
                ? 'Use authenticator app instead'
                : 'Use a backup code instead'}
            </button>
          </div>

          <div className="flex gap-2 pt-4">
            {onBack && (
              <Button variant="outline" onClick={onBack} className="flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            <Button variant="ghost" onClick={signOut} className="flex-1 text-muted-foreground">
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
