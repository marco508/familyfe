// services/defisService.ts — Défis de maison (ANNEXE V3)
import apiClient, { ApiResponse } from './apiClient';

export type StatutDefi = 'ouvert' | 'clos';

export interface DefiParticipant {
  utilisateur_id: number;
  nom: string;
  image: string | null;
  termine: boolean;
}

export interface Defi {
  id: number;
  maison_id: number;
  titre: string;
  description: string | null;
  points: number;
  date_fin: string | null;
  statut: StatutDefi;
  createur_id: number;
  date_creation: string;
  participants: DefiParticipant[];
  mon_etat: DefiParticipant | null;
  je_participe: boolean;
  mon_termine: boolean;
}

export interface DefiCreateInput {
  titre: string;
  description?: string;
  points: number;
  date_fin?: string;
}

class DefisService {
  async list(maisonId: number): Promise<ApiResponse<Defi[]>> {
    return apiClient.get(`/maisons/${maisonId}/defis`);
  }

  async create(maisonId: number, data: DefiCreateInput): Promise<ApiResponse<Defi>> {
    return apiClient.post(`/maisons/${maisonId}/defis`, data);
  }

  async rejoindre(defiId: number): Promise<ApiResponse<Defi>> {
    return apiClient.post(`/defis/${defiId}/rejoindre`, {});
  }

  async terminer(defiId: number): Promise<ApiResponse<Defi>> {
    return apiClient.post(`/defis/${defiId}/terminer`, {});
  }

  async cloturer(defiId: number): Promise<ApiResponse<Defi>> {
    return apiClient.post(`/defis/${defiId}/cloturer`, {});
  }

  async remove(defiId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/defis/${defiId}`);
  }
}

export const defisService = new DefisService();
export default defisService;
