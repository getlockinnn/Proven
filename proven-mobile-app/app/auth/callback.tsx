import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';

export default function AuthCallback() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/(main)');
  }, [isAuthenticated, router]);

  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'none' }} />
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.provenGreen} />
        <Text style={styles.text}>{loading ? 'Preparing...' : 'Completing sign in...'}</Text>
        {stuck ? (
          <View style={styles.stuck}>
            <Text style={styles.stuckText}>
              If this is taking too long, go back and try signing in again.
            </Text>
            <Pressable style={styles.button} onPress={() => router.replace('/(auth)/signin')}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  text: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  stuck: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  stuckText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  button: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.provenGreen,
  },
  buttonText: {
    ...typography.bodyBold,
    color: '#fff',
  },
});
