import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, typography } from '../../constants/theme';

interface CountdownTimerProps {
    deadline: Date | undefined;
    status: 'pending' | 'submitted' | 'active' | 'completed' | 'upcoming' | 'free' | undefined;
}

export function CountdownTimer({ deadline, status }: CountdownTimerProps) {
    const [timeLeft, setTimeLeft] = useState('');
    const [isUrgent, setIsUrgent] = useState(false);
    const [isCritical, setIsCritical] = useState(false);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date();
            if (!deadline) return 'No deadline';
            const diff = deadline.getTime() - now.getTime();

            if (diff <= 0) {
                return 'Times up';
            }

            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const minutes = Math.floor((diff / 1000 / 60) % 60);

            // Urgency logic
            const totalMinutesRef = Math.floor(diff / 1000 / 60);
            setIsUrgent(totalMinutesRef <= 60); // Last hour
            setIsCritical(totalMinutesRef <= 10); // Last 10 mins

            if (hours > 0) {
                return `Deadline in ${hours}h ${minutes}m`;
            }
            return `Deadline in ${minutes}m`;
        };

        setTimeLeft(calculateTimeLeft());
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 60000); // Update every minute

        return () => clearInterval(timer);
    }, [deadline]);

    // Only show if pending and deadline is in future (and not "Times up")
    // Note: Parent should probably handle the "show/hide" logic based on status, 
    // but strictly speaking user said: 
    // "Hide it when: Proof submitted OR Day missed"
    // "Show countdown only when: Today = not submitted AND Deadline is in the future"

    if (status !== 'pending' && status !== 'active') return null; // 'active' might be used as pending alias
    if (timeLeft === 'Times up') return null;

    return (
        <Text style={[
            styles.timerText,
            isUrgent && styles.timerUrgent,
            isCritical && styles.timerCritical
        ]}>
            {timeLeft}
        </Text>
    );
}

const styles = StyleSheet.create({
    timerText: {
        ...typography.caption,
        fontSize: 12,
        color: colors.error + 'D9', // Muted red (D9 = 85% opacity) assuming hex, or fallback
        fontWeight: '500',
        marginTop: 4,
        textAlign: 'right', // Right align to match pill
    },
    timerUrgent: {
        color: colors.error,
        fontWeight: '600',
    },
    timerCritical: {
        color: colors.error, // Could add pulse effect if we were using Reanimated
        fontWeight: '700',
    },
});
