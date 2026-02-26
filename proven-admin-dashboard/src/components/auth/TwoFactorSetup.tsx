import { useState } from 'react';
import { Shield, Copy, Check, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import * as authApi from '@/lib/api/auth';
import { useAuth } from '@/hooks/useAuth';

interface TwoFactorSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type SetupStep = 'intro' | 'qr' | 'verify' | 'backup' | 'complete';

export function TwoFactorSetup({ open, onOpenChange, onSuccess }: TwoFactorSetupProps) {
  const { refreshAdminStatus } = useAuth();
  const [step, setStep] = useState<SetupStep>('intro');
  const [isLoading, setIsLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);

  const handleStartSetup = async () => {
    setIsLoading(true);
    try {
      const response = await authApi.setup2FA();
      if (response.success && response.data) {
        setQrCodeUrl(response.data.qrCodeUrl);
        setBackupCodes(response.data.backupCodes);
        setStep('qr');
      } else {
        throw new Error(response.message || 'Failed to setup 2FA');
      }
    } catch (error: any) {
      toast({
        title: 'Setup Issue',
        description: error.message || "We couldn't start the 2FA setup right now. Please try again.",
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      toast({
        title: 'Check Your Code',
        description: 'Please enter all 6 digits from your authenticator app.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.verifySetup2FA(verificationCode);
      if (response.success) {
        setStep('backup');
      } else {
        throw new Error(response.message || 'Invalid verification code');
      }
    } catch (error: any) {
      toast({
        title: 'Verification Issue',
        description: error.message || "That code didn't work. Please check your authenticator app and try again.",
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopiedCodes(true);
    toast({
      title: 'Copied',
      description: 'Backup codes copied to clipboard',
    });
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleComplete = async () => {
    await refreshAdminStatus();
    setStep('complete');
    setTimeout(() => {
      onOpenChange(false);
      onSuccess?.();
      // Reset state
      setStep('intro');
      setQrCodeUrl('');
      setBackupCodes([]);
      setVerificationCode('');
    }, 2000);
  };

  const handleClose = () => {
    if (step === 'complete' || step === 'intro') {
      onOpenChange(false);
      setStep('intro');
      setQrCodeUrl('');
      setBackupCodes([]);
      setVerificationCode('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription>
            {step === 'intro' && 'Secure your admin account with 2FA'}
            {step === 'qr' && 'Scan the QR code with your authenticator app'}
            {step === 'verify' && 'Enter the code from your authenticator'}
            {step === 'backup' && 'Save your backup codes'}
            {step === 'complete' && '2FA is now enabled!'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step: Intro */}
          {step === 'intro' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-2">
                  Enable Two-Factor Authentication
                </h3>
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to your admin account. You'll need
                  an authenticator app like Google Authenticator or Authy.
                </p>
              </div>
              <Button onClick={handleStartSetup} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  'Get Started'
                )}
              </Button>
            </div>
          )}

          {/* Step: QR Code */}
          {step === 'qr' && (
            <div className="text-center space-y-4">
              <div className="bg-white p-4 rounded-lg inline-block mx-auto">
                <img
                  src={qrCodeUrl}
                  alt="2FA QR Code"
                  className="w-48 h-48 mx-auto"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app
              </p>
              <Button onClick={() => setStep('verify')} className="w-full">
                I've Scanned the Code
              </Button>
            </div>
          )}

          {/* Step: Verify */}
          {step === 'verify' && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest font-mono"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('qr')}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={isLoading || verificationCode.length !== 6}
                  className="flex-1"
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
              </div>
            </div>
          )}

          {/* Step: Backup Codes */}
          {step === 'backup' && (
            <div className="space-y-4">
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex gap-2">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm text-warning">
                  <p className="font-medium">Save these backup codes!</p>
                  <p className="text-warning/80">
                    You can use these codes to access your account if you lose your
                    authenticator device.
                  </p>
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, index) => (
                    <div key={index} className="text-foreground">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                onClick={handleCopyBackupCodes}
                className="w-full"
              >
                {copiedCodes ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Backup Codes
                  </>
                )}
              </Button>

              <Button onClick={handleComplete} className="w-full">
                I've Saved My Codes
              </Button>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-success/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-success" />
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-2">
                  2FA Enabled Successfully!
                </h3>
                <p className="text-sm text-muted-foreground">
                  Your account is now protected with two-factor authentication.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
