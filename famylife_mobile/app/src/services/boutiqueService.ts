// services/boutiqueService.ts — Boutique de récompenses + échanges (ANNEXE V3)
import apiClient, { ApiResponse } from './apiClient';

export type StatutEchange = 'demande' | 'valide' | 'refuse';

export interface Recompense {
  id: number;
  maison_id: number;
  nom: string;
  cout_points: number;
  description: string | null;
  actif: boolean;
}

export interface RecompenseCreateInput {
  nom: string;
  cout_points: number;
  description?: string;
  actif?: boolean;
}

export interface RecompenseUpdateInput extends Partial<RecompenseCreateInput> {}

export interface Echange {
  id: number;
  recompense_id: number;
  maison_id: number;
  utilisateur_id: number;
  cout: number;
  statut: StatutEchange;
  date_creation: string;
  recompense_nom?: string;
  utilisateur_nom?: string;
}

class BoutiqueService {
  async list(maisonId: number): Promise<ApiResponse<Recompense[]>> {
    return apiClient.get(`/maisons/${maisonId}/boutique`);
  }

  async create(maisonId: number, data: RecompenseCreateInput): Promise<ApiResponse<Recompense>> {
    return apiClient.post(`/maisons/${maisonId}/boutique`, data);
  }

  async update(recompenseId: number, data: RecompenseUpdateInput): Promise<ApiResponse<Recompense>> {
    return apiClient.put(`/boutique/${recompenseId}`, data);
  }

  async remove(recompenseId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/boutique/${recompenseId}`);
  }

  async echanger(recompenseId: number): Promise<ApiResponse<Echange>> {
    return apiClient.post(`/boutique/${recompenseId}/echanger`, {});
  }

  async listEchanges(maisonId: number): Promise<ApiResponse<Echange[]>> {
    return apiClient.get(`/maisons/${maisonId}/echanges`);
  }

  async validerEchange(echangeId: number): Promise<ApiResponse<Echange>> {
    return apiClient.post(`/echanges/${echangeId}/valider`, {});
  }

  async refuserEchange(echangeId: number): Promise<ApiResponse<Echange>> {
    return apiClient.post(`/echanges/${echangeId}/refuser`, {});
  }
}

export const boutiqueService = new BoutiqueService();
export default boutiqueService;
