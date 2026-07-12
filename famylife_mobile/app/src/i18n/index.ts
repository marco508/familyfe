// src/i18n/index.ts
// i18n minimal FR/EN : `LanguageProvider` (persisté AsyncStorage) + `useT()`.
// Français par défaut. `t('nav.accueil')` lit un chemin en points dans le
// dictionnaire courant (repli automatique sur le français si la clé/langue
// est manquante). Fondation volontairement simple : toutes les chaînes de
// l'app n'ont pas encore été branchées, mais la structure permet de le faire
// progressivement.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fr from './fr';
import en from './en';

export type Lang = 'fr' | 'en';

const DICTS: Record<Lang, any> = { fr, en };
const STORAGE_KEY = '@lang';

interface LanguageContextData {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  t: (path: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextData>({} as LanguageContextData);

function readPath(dict: any, path: string): string | undefined {
  const value = path.split('.').reduce<any>((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict);
  return typeof value === 'string' ? value : undefined;
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'fr' || saved === 'en') setLangState(saved);
      } catch {
        // ignore — reste en français par défaut
      }
    })();
  }, []);

  const setLang = useCallback(async (next: Lang) => {
    setLangState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort
    }
  }, []);

  const t = useCallback(
    (path: string, fallback?: string) => {
      return readPath(DICTS[lang], path) ?? readPath(DICTS.fr, path) ?? fallback ?? path;
    },
    [lang]
  );

  const value = useMemo<LanguageContextData>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return React.createElement(LanguageContext.Provider, { value }, children);
};

export const useT = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useT doit être utilisé dans un LanguageProvider');
  }
  return context;
};
