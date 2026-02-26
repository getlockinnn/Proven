import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

interface CircularProgressProps {
    percentage: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
    trackColor?: string;
    showText?: boolean;
}

export function CircularProgress({
    percentage,
    size = 40,
    strokeWidth = 4,
    color,
    trackColor = 'rgba(255, 255, 255, 0.2)',
    showText = true,
}: CircularProgressProps) {
    const { colors } = useTheme();

    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const fillPercentage = Math.min(Math.max(percentage, 0), 100);
    const strokeDashoffset = circumference - (fillPercentage / 100) * circumference;

    const progressColor = color || colors.coral;

    return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={progressColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </Svg>
            {showText && (
                <View style={[StyleSheet.absoluteFill, styles.textContainer]}>
                    <Text style={[styles.percentageText, { color: '#fff' }]}>
                        {Math.round(fillPercentage)}%
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    textContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    percentageText: {
        ...typography.small,
        fontSize: 12,
        fontWeight: '700',
    },
});
