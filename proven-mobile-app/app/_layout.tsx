// Polyfills must be imported first, before any Solana-related code
import '../lib/polyfills';

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OfflineBanner } from "../components/ui/OfflineBanner";
import { AuthProvider } from "../context/AuthContext";
import { NetworkProvider } from "../context/NetworkContext";
import { NotificationProvider } from "../context/NotificationContext";
import { TapestryProvider } from "../context/TapestryContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { WalletProvider } from "../context/WalletContext";

// Inner component that can use theme
function AppContent() {
  const { isDark, colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <OfflineBanner />
      <Stack 
        screenOptions={{ 
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeAreaWrapper: {
    flex: 1,
  },
});

// Wrapper to apply theme background to SafeAreaProvider
function ThemedSafeAreaProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.safeAreaWrapper, { backgroundColor: colors.background }]}>
      {children}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <ThemedSafeAreaProvider>
          <AuthProvider>
            <TapestryProvider>
              <NotificationProvider>
                <NetworkProvider>
                  <WalletProvider>
                    <AppContent />
                  </WalletProvider>
                </NetworkProvider>
              </NotificationProvider>
            </TapestryProvider>
          </AuthProvider>
        </ThemedSafeAreaProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
