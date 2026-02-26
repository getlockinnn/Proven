import { ReactNode, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TwoFactorVerify } from './TwoFactorVerify';
import { TwoFactorRequired } from './TwoFactorRequired';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const {
    user,
    isLoading,
    isAdmin,
    adminStatus,
    twoFactorVerified,
    signOut,
    refreshAdminStatus,
  } = useAuth();
  const location = useLocation();
  const [forceRefresh, setForceRefresh] = useState(0);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Show access denied if not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-destructive/10 mb-4">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don't have permission to access the admin dashboard.
            <br />
            <span className="text-sm">Signed in as: {user.email}</span>
          </p>
          <Button onClick={signOut} variant="outline">
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  // TODO: Re-enable 2FA checks when ready
  // // Check if 2FA setup is required (admin but 2FA not enabled)
  // if (adminStatus?.twoFactorRequired) {
  //   return (
  //     <TwoFactorRequired
  //       onSetupComplete={() => {
  //         refreshAdminStatus();
  //         setForceRefresh((f) => f + 1);
  //       }}
  //     />
  //   );
  // }

  // // Check if 2FA verification is needed (2FA enabled but not verified this session)
  // if (adminStatus?.twoFactorEnabled && !twoFactorVerified) {
  //   return (
  //     <TwoFactorVerify
  //       onSuccess={() => {
  //         setForceRefresh((f) => f + 1);
  //       }}
  //     />
  //   );
  // }

  // All checks passed - render children
  return <>{children}</>;
}
