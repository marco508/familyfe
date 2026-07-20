// services/notificationService.ts
// Centre de notifications in-app (mécanisme principal — fonctionne sans push
// distant, indisponible dans Expo Go SDK 54). Voir aussi reminderService.ts
// pour les rappels locaux best-effort planifiés sur l'appareil.
import apiClient, { ApiResponse } from './apiClient';

export type NotificationType = 'activite' | 'evenement' | 'vote' | 'anniversaire' | 'rotation';

// ANNEXE V10 — préférences de notification par catégorie.
//
// Contrat serveur (déjà implémenté et testé) :
//   · GET  /me                → `notif_desactivees: string[]`  (les DÉSACTIVÉES)
//   · GET  /me/notifications  → `{ categories: [...] }`        (taxonomie connue)
//   · PUT  /me/notifications  → corps `{ desactivees: [...] }`, réponse
//                               `{ desactivees: [...] }`. `[]` est légitime
//                               (tout réactiver) ; catégorie inconnue → 400.
//
// Ce repli n'est utilisé que si `GET /me/notifications` échoue (réseau) : la
// liste du serveur reste la source de vérité, on ne la double pas en dur.
export const CATEGORIES_NOTIF_REPLI = [
  'corvees',
  'sorties',
  'decisions',
  'depenses',
  'courses',
  'chat',
  'jeu',
  'foyer',
] as const;

export type CategorieNotif = (typeof CATEGORIES_NOTIF_REPLI)[number];

export interface AppNotification {
  id: number;
  type: NotificationType;
  titre: string;
  message: string;
  lien: string | null; // ex: "activite:5", "vote:3", "agenda", "maison"
  lu: boolean;
  maison_id: number | null;
  date_creation: string;
}

class NotificationService {
  async list(nonLues?: boolean, limit?: number): Promise<ApiResponse<AppNotification[]>> {
    return apiClient.get('/notifications', { params: { non_lues: nonLues, limit } });
  }

  async compteur(): Promise<ApiResponse<{ non_lues: number }>> {
    return apiClient.get('/notifications/compteur');
  }

  async marquerLu(id: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post(`/notifications/${id}/lu`, {});
  }

  async marquerToutLu(): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post('/notifications/lu-tout', {});
  }

  async supprimer(id: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/notifications/${id}`);
  }

  // ANNEXE V10 — la liste des catégories connues DU SERVEUR. On la préfère à
  // une taxonomie codée en dur : le jour où le backend en ajoute une, l'écran
  // l'affiche sans qu'on ait à repasser derrière.
  async categories(): Promise<ApiResponse<{ categories: string[] }>> {
    return apiClient.get('/me/notifications');
  }

  // Les catégories que l'utilisateur ne veut PAS recevoir. `[]` = tout
  // réactiver, et c'est une valeur parfaitement légitime (pas un « rien à
  // envoyer »). L'état des préférences se lit, lui, dans `GET /me`
  // (`notif_desactivees`) — voir authService.
  async setDesactivees(desactivees: string[]): Promise<ApiResponse<{ desactivees: string[] }>> {
    return apiClient.put('/me/notifications', { desactivees });
  }
}

export const notificationService = new NotificationService();
export default notificationService;
