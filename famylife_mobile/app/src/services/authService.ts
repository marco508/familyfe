// services/authService.ts
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import apiClient, { ApiResponse } from './apiClient';

export interface LoginCredentials {
  identifiant: string; // email, nom OU téléphone (voir SPEC section 2)
  password: string;
}

export interface SignupData {
  nom: string;
  email: string;
  password: string;
  telephone?: string;
  date_naissance?: string; // AAAA-MM-JJ, optionnel
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserProfile {
  id: number;
  nom: string;
  email: string;
  telephone: string | null;
  image: string | null;
  date_creation: string;
  date_naissance?: string | null;
  // ANNEXE V10 — catégories de notification DÉSACTIVÉES (ex: `["chat"]`).
  // Vide = tout est activé. Attention au sens : le serveur stocke la négation,
  // pas la liste de ce qu'on reçoit. La conversion en « activé = je reçois » se
  // fait dans l'écran (`(app)/notifications-reglages.tsx`), jamais dans la tête
  // de l'utilisateur.
  // Optionnel : un serveur plus ancien n'envoie pas le champ → lu comme `[]`.
  notif_desactivees?: string[];
}

export interface UpdateProfileData {
  nom: string;
  email: string;
  telephone?: string | null;
  image?: string | null;
  date_naissance?: string | null;
}

class AuthService {
  // Connexion — `identifiant` accepte email OU nom OU téléphone (POST /token, form-urlencoded).
  async login(credentials: LoginCredentials): Promise<ApiResponse<TokenResponse>> {
    const formBody = `username=${encodeURIComponent(credentials.identifiant)}&password=${encodeURIComponent(credentials.password)}`;

    const response = await apiClient.postUrlEncoded<TokenResponse>('/token', formBody);

    if (response.data?.access_token) {
      await apiClient.saveToken(response.data.access_token);
    }

    return response;
  }

  // Inscription (POST /signup) puis connexion automatique.
  async signup(data: SignupData): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post('/signup', {
      nom: data.nom,
      email: data.email,
      password: data.password,
      telephone: data.telephone || undefined,
      date_naissance: data.date_naissance || undefined,
    });
  }

  async logout(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post<{ message: string }>('/logout', {});
      await apiClient.clearToken();
      return response;
    } catch (error) {
      await apiClient.clearToken();
      return {
        data: { message: 'Déconnexion locale effectuée' },
        error: error instanceof Error ? error.message : undefined,
        status: 0,
      };
    }
  }

  // Déconnexion de TOUS les appareils : incrémente la version de session côté
  // serveur, ce qui invalide immédiatement tous les tokens existants (utile en
  // cas de vol de token). On efface aussi le token local.
  async deconnexionGlobale(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post<{ message: string }>('/me/deconnexion-globale', {});
      await apiClient.clearToken();
      return response;
    } catch (error) {
      await apiClient.clearToken();
      return {
        data: { message: 'Déconnexion locale effectuée' },
        error: error instanceof Error ? error.message : undefined,
        status: 0,
      };
    }
  }

  // Suppression définitive du compte (POST /me/supprimer, corps { password }).
  // Mot de passe faux → 403 (rien n'est supprimé). Succès → 200. En cas de
  // succès uniquement, on efface le token local (comme `logout()`). On renvoie
  // l'ApiResponse pour que l'appelant distingue succès / mot de passe faux.
  async deleteAccount(password: string): Promise<ApiResponse<{ message: string }>> {
    const response = await apiClient.post<{ message: string }>('/me/supprimer', { password });
    if (!response.error) {
      await apiClient.clearToken();
    }
    return response;
  }

  async getProfile(): Promise<ApiResponse<UserProfile>> {
    return apiClient.get('/me');
  }

  async updateProfile(profileData: UpdateProfileData): Promise<ApiResponse<UserProfile>> {
    const dateNaissanceValue = profileData.date_naissance !== undefined ? (profileData.date_naissance || undefined) : undefined;
    return apiClient.put<UserProfile>('/me', {
      nom: profileData.nom,
      email: profileData.email,
      telephone: profileData.telephone || undefined,
      image: profileData.image || undefined,
      date_naissance: dateNaissanceValue,
    });
  }

  isAuthenticated(): boolean {
    return apiClient.getToken() !== null;
  }

  getToken(): string | null {
    return apiClient.getToken();
  }

  // ANNEXE V3 — upload de la photo de profil (multipart `image`).
  async uploadAvatar(fileUri: string): Promise<ApiResponse<{ image: string }>> {
    return apiClient.uploadImage('/me/avatar', fileUri, 'image');
  }

  // ANNEXE V3 — enregistre le jeton Expo push (best-effort, dev build uniquement).
  async setPushToken(token: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post('/me/push-token', { token });
  }

  // Demande la permission, récupère le jeton Expo Push et l'enregistre côté
  // serveur. Appelé après connexion / restauration de session. Best-effort :
  // ne bloque jamais et n'échoue jamais bruyamment (Expo Go n'a pas de push).
  async registerForPush(): Promise<string | null> {
    try {
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted') return null;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Général',
          importance: Notifications.AndroidImportance.DEFAULT,
        }).catch(() => {});
      }

      const projectId =
        (Constants.expoConfig as any)?.extra?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId;

      const tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : (undefined as any),
      );
      const token = tokenResp?.data;
      if (!token) return null;

      await this.setPushToken(token);
      return token;
    } catch (e) {
      console.warn('registerForPush:', e);
      return null;
    }
  }
}

export const authService = new AuthService();
export default authService;
