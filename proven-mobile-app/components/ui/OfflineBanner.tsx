/**
 * OfflineBanner - UI indicator for offline status and pending syncs
 * 
 * Shows when the user is offline or has pending changes to sync.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    FadeInDown,
    FadeOutUp,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';

export function OfflineBanner() {
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
    const { isOffline, pendingCount, isSyncing, triggerSync } = useNetwork();

    // Pulsing animation for syncing indicator
    const pulseOpacity = useSharedValue(1);

    React.useEffect(() => {
        if (isSyncing) {
            pulseOpacity.value = withRepeat(
                withTiming(0.5, { duration: 800 }),
                -1,
                true
            );
        } else {
            pulseOpacity.value = 1;
        }
    }, [isSyncing, pulseOpacity]);

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: pulseOpacity.value,
    }));

    // Don't show if online and no pending items
    if (!isOffline && pendingCount === 0 && !isSyncing) {
        return null;
    }

    const getBannerConfig = () => {
        if (isOffline) {
            return {
                icon: 'cloud-offline-outline' as const,
                message: 'You\'re offline',
                submessage: pendingCount > 0
                    ? `${pendingCount} change${pendingCount > 1 ? 's' : ''} will sync when you're back online`
                    : 'Changes will sync when you\'re back online',
                backgroundColor: colors.textMuted,
                showAction: false,
            };
        }

        if (isSyncing) {
            return {
                icon: 'sync-outline' as const,
                message: 'Syncing changes...',
                submessage: undefined,
                backgroundColor: colors.info,
                showAction: false,
            };
        }

        // Online with pending items (shouldn't happen often)
        return {
            icon: 'time-outline' as const,
            message: `${pendingCount} change${pendingCount > 1 ? 's' : ''} pending`,
            submessage: 'Tap to sync now',
            backgroundColor: colors.warning,
            showAction: true,
        };
    };

    const config = getBannerConfig();

    const BannerContent = (
        <View style={[styles.container, { top: insets.top }]}>
            <Animated.View
                entering={FadeInDown.duration(300)}
                exiting={FadeOutUp.duration(300)}
                style={[
                    styles.banner,
                    { backgroundColor: config.backgroundColor },
                ]}
            >
                <Animated.View style={[styles.iconContainer, isSyncing && pulseStyle]}>
                    <Ionicons
                        name={config.icon}
                        size={18}
                        color="#FFFFFF"
                    />
                </Animated.View>

                <View style={styles.textContainer}>
                    <Text style={styles.message}>{config.message}</Text>
                    {config.submessage && (
                        <Text style={styles.submessage}>{config.submessage}</Text>
                    )}
                </View>
            </Animated.View>
        </View>
    );

    if (config.showAction) {
        return (
            <Pressable onPress={triggerSync}>
                {BannerContent}
            </Pressable>
        );
    }

    return BannerContent;
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1000,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.xs,
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.lg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    iconContainer: {
        marginRight: spacing.sm,
    },
    textContainer: {
        flex: 1,
    },
    message: {
        ...typography.bodyBold,
        color: '#FFFFFF',
        fontSize: 14,
    },
    submessage: {
        ...typography.small,
        color: 'rgba(255, 255, 255, 0.85)',
        marginTop: 2,
    },
});
