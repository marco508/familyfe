// src/contexts/NotificationContext.tsx
// Compteur de notifications non-lues (badge cloche). Se recharge à la
// connexion, quand la maison active change, et périodiquement (best-effort —
// pas de push distant disponible en Expo Go). Les écrans peuvent aussi
// appeler `refresh()` explicitement (ex: au focus, après une action).
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import notificationService from '../services/notificationService';
import { useAuth } from './AuthContext';
import { appEvents, EVENTS } from '../utils/EventEmitter';

const POLL_INTERVAL_MS = 30000;

interface NotificationContextData {
  unreadCount: number;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextData>({} as NotificationContextData);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await notificationService.compteur();
      setUnreadCount(res.data?.non_lues ?? 0);
    } catch {
      // Best-effort : le badge reste simplement inchangé en cas d'erreur réseau.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    const onMaisonChanged = () => refresh();
    const onUnauthorized = () => setUnreadCount(0);
    appEvents.on(EVENTS.MAISON_CHANGED, onMaisonChanged);
    appEvents.on(EVENTS.UNAUTHORIZED, onUnauthorized);
    return () => {
      appEvents.off(EVENTS.MAISON_CHANGED, onMaisonChanged);
      appEvents.off(EVENTS.UNAUTHORIZED, onUnauthorized);
    };
  }, [refresh]);

  return (
    <NotificationContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications doit être utilisé dans un NotificationProvider');
  }
  return context;
};
