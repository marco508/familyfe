// src/contexts/MaisonContext.tsx
// Maison active de l'utilisateur (persistée sur l'appareil), liste des
// maisons, membres de la maison active, et helpers (isChef, refresh).
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import maisonService, {
  Membre,
  MaisonCreateInput,
  MaisonListItem,
} from '../services/maisonService';
import { useAuth } from './AuthContext';
import { appEvents, EVENTS } from '../utils/EventEmitter';

const STORAGE_KEY_MAISON_ACTIVE = '@maison_active';

interface MaisonContextData {
  maisons: MaisonListItem[];
  maisonActive: MaisonListItem | null;
  membres: Membre[];
  loading: boolean;
  loadingMembres: boolean;
  isChef: boolean;
  // Gestion = chef, co-chef OU chef temporaire (ANNEXE V4 — `require_gestion` côté API).
  isGestion: boolean;
  // ANNEXE V4 — visiteur temporaire : lecture seule (masque les actions de création/gestion).
  isVisiteur: boolean;
  hasMaison: boolean;
  // Un premier chargement réussi de la liste a eu lieu (sinon on affiche un loader,
  // on ne redirige pas vers l'onboarding).
  initialized: boolean;
  selectMaison: (maison: MaisonListItem) => Promise<void>;
  refresh: () => Promise<void>;
  refreshMembres: () => Promise<void>;
  createMaison: (data: MaisonCreateInput) => Promise<{ success: boolean; error?: string; maison?: MaisonListItem }>;
  joinMaison: (codeInvitation: string) => Promise<{ success: boolean; error?: string }>;
}

const MaisonContext = createContext<MaisonContextData>({} as MaisonContextData);

export const MaisonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [maisons, setMaisons] = useState<MaisonListItem[]>([]);
  const [maisonActive, setMaisonActiveState] = useState<MaisonListItem | null>(null);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMembres, setLoadingMembres] = useState(false);
  // Vrai dès qu'un chargement de la liste a RÉUSSI au moins une fois. Empêche de
  // renvoyer l'utilisateur vers l'onboarding tant qu'on n'a pas confirmé qu'il n'a
  // vraiment aucune maison (une erreur réseau ne doit pas vider la liste).
  const [initialized, setInitialized] = useState(false);

  const persistActiveId = async (id: number | null) => {
    try {
      if (id === null) {
        await AsyncStorage.removeItem(STORAGE_KEY_MAISON_ACTIVE);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY_MAISON_ACTIVE, String(id));
      }
    } catch {
      // ignore
    }
  };

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setMaisons([]);
      setMaisonActiveState(null);
      setMembres([]);
      // On REMET initialized à false : la prochaine connexion sera traitée comme
      // un premier chargement (loader affiché), pour ne PAS rediriger vers
      // l'onboarding sur l'état vide laissé par la déconnexion précédente.
      setInitialized(false);
      setLoading(false);
      return;
    }
    // Le loader global (qui remonte tout l'arbre) n'est affiché qu'au 1er
    // chargement. Les rafraîchissements suivants (après une modif) se font en
    // arrière-plan, sans démonter les écrans.
    const firstLoad = !initialized;
    if (firstLoad) setLoading(true);
    try {
      const response = await maisonService.list();

      // En cas d'ERREUR (réseau, timeout, 5xx…), on NE vide PAS la liste : on
      // conserve l'état précédent. Sinon un simple rechargement raté après une
      // modification renverrait à tort l'utilisateur vers l'écran créer/rejoindre.
      if (response.error || !response.data) {
        return;
      }

      const list = response.data;
      setMaisons(list);

      let activeId: string | null = null;
      try {
        activeId = await AsyncStorage.getItem(STORAGE_KEY_MAISON_ACTIVE);
      } catch {
        activeId = null;
      }

      let next: MaisonListItem | null = null;
      if (activeId) {
        next = list.find((m) => String(m.id) === activeId) ?? null;
      }
      if (!next && list.length > 0) {
        next = list[0];
      }
      setMaisonActiveState(next);
      await persistActiveId(next ? next.id : null);
      setInitialized(true);
    } finally {
      if (firstLoad) setLoading(false);
    }
  }, [isAuthenticated, initialized]);

  const refreshMembres = useCallback(async () => {
    if (!maisonActive) {
      setMembres([]);
      return;
    }
    setLoadingMembres(true);
    try {
      const response = await maisonService.membres(maisonActive.id);
      setMembres(response.data ?? []);
    } finally {
      setLoadingMembres(false);
    }
  }, [maisonActive]);

  const selectMaison = async (maison: MaisonListItem) => {
    setMaisonActiveState(maison);
    await persistActiveId(maison.id);
    appEvents.emit(EVENTS.MAISON_CHANGED, maison.id);
  };

  const createMaison = async (data: MaisonCreateInput) => {
    const response = await maisonService.create(data);
    if (response.error || !response.data) {
      return { success: false, error: response.error || 'Impossible de créer la maison' };
    }
    await refresh();
    await selectMaison(response.data);
    return { success: true, maison: response.data };
  };

  const joinMaison = async (codeInvitation: string) => {
    const response = await maisonService.join(codeInvitation);
    if (response.error || !response.data) {
      return { success: false, error: response.error || 'Impossible de rejoindre la maison' };
    }
    await refresh();
    return { success: true };
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshMembres();
  }, [refreshMembres]);

  useEffect(() => {
    const onUnauthorized = () => {
      setMaisons([]);
      setMaisonActiveState(null);
      setMembres([]);
      // Forcer un vrai rechargement (avec loader) à la reconnexion.
      setInitialized(false);
    };
    appEvents.on(EVENTS.UNAUTHORIZED, onUnauthorized);
    return () => {
      appEvents.off(EVENTS.UNAUTHORIZED, onUnauthorized);
    };
  }, []);

  const isChef = maisonActive?.role === 'chef';
  const isGestion =
    maisonActive?.role === 'chef' || maisonActive?.role === 'co_chef' || maisonActive?.role === 'chef_temporaire';
  const isVisiteur = maisonActive?.role === 'visiteur';

  return (
    <MaisonContext.Provider
      value={{
        maisons,
        maisonActive,
        membres,
        loading,
        loadingMembres,
        isChef,
        isGestion,
        isVisiteur,
        hasMaison: maisons.length > 0,
        initialized,
        selectMaison,
        refresh,
        refreshMembres,
        createMaison,
        joinMaison,
      }}
    >
      {children}
    </MaisonContext.Provider>
  );
};

export const useMaison = () => {
  const context = useContext(MaisonContext);
  if (!context) {
    throw new Error('useMaison doit être utilisé dans un MaisonProvider');
  }
  return context;
};
