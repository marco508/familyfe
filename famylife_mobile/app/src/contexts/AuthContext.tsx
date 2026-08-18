// src/contexts/AuthContext.tsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import authService, { LoginCredentials, SignupData, UserProfile } from '../services/authService';
import { appEvents, EVENTS } from '../utils/EventEmitter';

interface AuthContextData {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  signup: (data: SignupData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  deleteAccount: (password: string) => Promise<{ ok: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, []);

  // Déconnexion automatique quand l'API renvoie 401 (token expiré/invalide).
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    appEvents.on(EVENTS.UNAUTHORIZED, onUnauthorized);
    return () => {
      appEvents.off(EVENTS.UNAUTHORIZED, onUnauthorized);
    };
  }, []);

  const loadUserProfile = async () => {
    try {
      if (authService.isAuthenticated()) {
        const response = await authService.getProfile();
        if (response.data) {
          setUser(response.data);
          // Enregistre le jeton push pour cet appareil (best-effort).
          authService.registerForPush().catch(() => {});
        } else {
          await authService.logout();
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement du profil:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await authService.login(credentials);

      if (response.error) {
        return { success: false, error: response.error };
      }

      const profileResponse = await authService.getProfile();
      if (profileResponse.data) {
        setUser(profileResponse.data);
        // Enregistre le jeton push après connexion (best-effort).
        authService.registerForPush().catch(() => {});
        return { success: true };
      }

      return { success: false, error: 'Impossible de charger le profil' };
    } catch (error) {
      return { success: false, error: 'Erreur de connexion' };
    }
  };

  const signup = async (data: SignupData) => {
    try {
      const response = await authService.signup(data);

      if (response.error) {
        return { success: false, error: response.error };
      }

      // Auto-login après inscription (identifiant = email fourni à l'inscription).
      const loginResult = await login({ identifiant: data.email, password: data.password });
      return loginResult;
    } catch (error) {
      return { success: false, error: "Erreur lors de l'inscription" };
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  // Déconnexion de tous les appareils : révoque tous les tokens côté serveur.
  const logoutAll = async () => {
    await authService.deconnexionGlobale();
    setUser(null);
  };

  // Suppression définitive du compte. En cas de succès, on remet l'état à zéro
  // EXACTEMENT comme `logout` (setUser(null)) : `(app)/_layout.tsx` bascule
  // alors sur <Redirect href="/(auth)/login" /> puisque isAuthenticated = !!user.
  // En cas d'échec (mot de passe faux / erreur), on NE touche PAS à l'état et on
  // renvoie l'erreur à l'appelant : l'utilisateur reste connecté.
  const deleteAccount = async (password: string) => {
    const response = await authService.deleteAccount(password);
    if (response.error) {
      return { ok: false, error: response.error };
    }
    setUser(null);
    return { ok: true };
  };

  const refreshProfile = async () => {
    await loadUserProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        logoutAll,
        deleteAccount,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};
