// services/chatService.ts — Chat de maison + commentaires d'activité (ANNEXE V3)
import apiClient, { ApiResponse } from './apiClient';
import { MiniUser } from './activiteService';

export interface Message {
  id: number;
  maison_id: number;
  utilisateur_id: number;
  contenu: string;
  date_creation: string;
  auteur: MiniUser | null;
}

export interface Commentaire {
  id: number;
  activite_id: number;
  utilisateur_id: number;
  contenu: string;
  date_creation: string;
  auteur: MiniUser | null;
}

class ChatService {
  // ---- Chat de maison ----
  async listMessages(maisonId: number, avantId?: number, limit?: number): Promise<ApiResponse<Message[]>> {
    return apiClient.get(`/maisons/${maisonId}/messages`, { params: { avant_id: avantId, limit } });
  }

  async envoyerMessage(maisonId: number, contenu: string): Promise<ApiResponse<Message>> {
    return apiClient.post(`/maisons/${maisonId}/messages`, { contenu });
  }

  // ---- Commentaires d'activité ----
  async listCommentaires(activiteId: number): Promise<ApiResponse<Commentaire[]>> {
    return apiClient.get(`/activites/${activiteId}/commentaires`);
  }

  async ajouterCommentaire(activiteId: number, contenu: string): Promise<ApiResponse<Commentaire>> {
    return apiClient.post(`/activites/${activiteId}/commentaires`, { contenu });
  }
}

export const chatService = new ChatService();
export default chatService;
