// src/contexts/ThemeContext.tsx
// Mode sombre "bonbon" : palette claire (par défaut) ou sombre, persistée sur
// l'appareil. `useTheme()` expose `colors`/`gradients` équivalents à ceux de
// `theme/designTokens.ts` mais adaptés au mode courant — au minimum le fond,
// les cartes et le texte changent. Les composants qui veulent être "dark
// aware" appellent `useTheme()` au lieu d'importer `colors` statiquement.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  colors as lightColors,
  gradients as lightGradients,
  darkColors,
  darkGradients,
} from '../../theme/designTokens';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = '@theme_mode';

interface ThemeContextData {
  mode: ThemeMode;
  isDark: boolean;
  colors: typeof lightColors;
  gradients: typeof lightGradients;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') setModeState(saved);
      } catch {
        // ignore — reste en mode clair par défaut
      }
    })();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort
    }
  }, []);

  const toggleTheme = useCallback(async () => {
    await setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo<ThemeContextData>(
    () => ({
      mode,
      isDark: mode === 'dark',
      colors: mode === 'dark' ? (darkColors as typeof lightColors) : lightColors,
      // Les deux palettes sont déclarées `as const` : leurs types sont des
      // tuples de littéraux hex qui ne se recouvrent pas ('#1B1330' n'est pas
      // assignable à '#FFE9F3'), d'où le passage par `unknown`. On garde
      // `typeof lightGradients` comme type public : c'est lui qui donne aux
      // écrans le tuple `readonly [string, string, ...]` attendu par
      // LinearGradient. Les deux palettes ont bien les mêmes clés.
      gradients: mode === 'dark' ? (darkGradients as unknown as typeof lightGradients) : lightGradients,
      setMode,
      toggleTheme,
    }),
    [mode, setMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme doit être utilisé dans un ThemeProvider');
  }
  return context;
};
