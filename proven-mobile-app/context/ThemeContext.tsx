/**
 * Theme Context
 * Provides theme mode management with persistence and system theme detection
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
    ThemeColors,
    createShadows,
    darkColors,
    lightColors,
} from '../constants/theme';

// Theme mode types
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

// Storage key
const THEME_STORAGE_KEY = '@proven_theme_mode';

// Context type
interface ThemeContextType {
    // Current theme mode setting
    themeMode: ThemeMode;
    // Resolved theme (what's actually displayed)
    resolvedTheme: ResolvedTheme;
    // Theme colors based on resolved theme
    colors: ThemeColors;
    // Shadows based on resolved theme
    shadows: ReturnType<typeof createShadows>;
    // Whether theme is still loading from storage
    isLoading: boolean;
    // Function to change theme mode
    setThemeMode: (mode: ThemeMode) => void;
    // Helper to check if dark mode is active
    isDark: boolean;
}

// Create context with undefined default
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider component
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemColorScheme = useColorScheme();
    const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
    const [isLoading, setIsLoading] = useState(true);

    // Load saved theme on mount
    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
                setThemeModeState(savedTheme as ThemeMode);
            }
        } catch (error) {
            console.error('Error loading theme:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Save theme and update state
    const setThemeMode = async (mode: ThemeMode) => {
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
            setThemeModeState(mode);
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    };

    // Resolve the actual theme based on mode and system preference
    const resolvedTheme: ResolvedTheme = useMemo(() => {
        if (themeMode === 'system') {
            return systemColorScheme === 'dark' ? 'dark' : 'light';
        }
        return themeMode;
    }, [themeMode, systemColorScheme]);

    // Get colors based on resolved theme
    const colors = useMemo(() => {
        return resolvedTheme === 'dark' ? darkColors : lightColors;
    }, [resolvedTheme]);

    // Get shadows based on resolved theme
    const shadows = useMemo(() => {
        return createShadows(colors);
    }, [colors]);

    const isDark = resolvedTheme === 'dark';

    const contextValue: ThemeContextType = {
        themeMode,
        resolvedTheme,
        colors,
        shadows,
        isLoading,
        setThemeMode,
        isDark,
    };

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    );
}

// Hook to use theme context
export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}

// Export types
export type { ThemeColors };
