// services/depensesService.ts — Dépenses partagées + bilan (ANNEXE V3)
import apiClient, { ApiResponse } from './apiClient';

export interface Depense {
  id: number;
  maison_id: number;
  titre: string;
  montant: number;
  paye_par: number;
  date: string;
  categorie: string | null;
  description: string | null;
  parts: number[]; // ids des membres qui partagent la dépense
}

export interface DepenseCreateInput {
  titre: string;
  montant: number;
  paye_par?: number;
  date?: string;
  categorie?: string;
  description?: string;
  participants?: number[];
}

export interface DepenseUpdateInput extends Partial<DepenseCreateInput> {}

export interface SoldeMembre {
  utilisateur_id: number;
  nom: string;
  paye: number;
  du: number;
  solde: number;
}

export interface Reglement {
  de: number;
  de_nom?: string;
  vers: number;
  vers_nom?: string;
  montant: number;
}

export interface BilanDepenses {
  soldes: SoldeMembre[];
  reglements: Reglement[];
}

class DepensesService {
  async list(maisonId: number): Promise<ApiResponse<Depense[]>> {
    return apiClient.get(`/maisons/${maisonId}/depenses`);
  }

  async create(maisonId: number, data: DepenseCreateInput): Promise<ApiResponse<Depense>> {
    return apiClient.post(`/maisons/${maisonId}/depenses`, data);
  }

  async update(depenseId: number, data: DepenseUpdateInput): Promise<ApiResponse<Depense>> {
    return apiClient.put(`/depenses/${depenseId}`, data);
  }

  async remove(depenseId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/depenses/${depenseId}`);
  }

  async bilan(maisonId: number): Promise<ApiResponse<BilanDepenses>> {
    return apiClient.get(`/maisons/${maisonId}/depenses/bilan`);
  }
}

export const depensesService = new DepensesService();
export default depensesService;
