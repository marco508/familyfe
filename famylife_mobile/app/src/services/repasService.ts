// services/repasService.ts — Menu de la semaine (ANNEXE V3)
import apiClient, { ApiResponse } from './apiClient';

export type MomentRepas = 'petit_dej' | 'midi' | 'soir';

export interface Repas {
  id: number;
  maison_id: number;
  date: string; // AAAA-MM-JJ
  moment: MomentRepas;
  titre: string;
  notes: string | null;
}

export interface RepasCreateInput {
  date: string;
  moment: MomentRepas;
  titre: string;
  notes?: string;
}

export interface RepasUpdateInput extends Partial<RepasCreateInput> {}

class RepasService {
  async list(maisonId: number, debut?: string, fin?: string): Promise<ApiResponse<Repas[]>> {
    return apiClient.get(`/maisons/${maisonId}/repas`, { params: { debut, fin } });
  }

  async create(maisonId: number, data: RepasCreateInput): Promise<ApiResponse<Repas>> {
    return apiClient.post(`/maisons/${maisonId}/repas`, data);
  }

  async update(repasId: number, data: RepasUpdateInput): Promise<ApiResponse<Repas>> {
    return apiClient.put(`/repas/${repasId}`, data);
  }

  async remove(repasId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/repas/${repasId}`);
  }

  // Génère des articles de courses depuis les ingrédients d'un repas.
  async versCourses(repasId: number, items: string[]): Promise<ApiResponse<any[]>> {
    return apiClient.post(`/repas/${repasId}/vers-courses`, { items });
  }
}

export const repasService = new RepasService();
export default repasService;
