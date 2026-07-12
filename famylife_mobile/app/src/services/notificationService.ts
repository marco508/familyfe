// services/notificationService.ts
// Centre de notifications in-app (mécanisme principal — fonctionne sans push
// distant, indisponible dans Expo Go SDK 54). Voir aussi reminderService.ts
// pour les rappels locaux best-effort planifiés sur l'appareil.
import apiClient, { ApiResponse } from './apiClient';

export type NotificationType = 'activite' | 'evenement' | 'vote' | 'anniversaire' | 'rotation';

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
}

export const notificationService = new NotificationService();
export default notificationService;
