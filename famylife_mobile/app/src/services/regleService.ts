// services/regleService.ts — Règles de la maison, votées, + rappel (ANNEXE V4)
import apiClient, { ApiResponse } from './apiClient';
import { MiniUser } from './activiteService';

export type StatutRegle = 'proposee' | 'adoptee' | 'rejetee';

export interface RegleVoteOption {
  id: number;
  texte: string;
  nb_voix: number;
}

export interface Regle {
  id: number;
  maison_id: number;
  titre: string;
  contenu: string;
  statut: StatutRegle;
  vote_id: number | null;
  ordre: number;
  createur_id: number;
  date_creation: string;
  createur?: MiniUser | null;
  // Résultats de vote — présents seulement si `vote_id` est renseigné.
  options?: RegleVoteOption[];
  total_voix?: number;
  mon_vote_option_id?: number | null;
}

export interface RegleCreateInput {
  titre: string;
  contenu: string;
  soumettre_au_vote?: boolean;
}

export interface RegleUpdateInput {
  titre?: string;
  contenu?: string;
  ordre?: number;
}

export interface ReglesALire {
  doit_lire: boolean;
  regles: Regle[];
}

class RegleService {
  async list(maisonId: number): Promise<ApiResponse<Regle[]>> {
    return apiClient.get(`/maisons/${maisonId}/regles`);
  }

  // Gestion — si `soumettre_au_vote`, crée un vote lié (oui/non), statut `proposee` ;
  // sinon la règle est directement `adoptee`.
  async create(maisonId: number, data: RegleCreateInput): Promise<ApiResponse<Regle>> {
    return apiClient.post(`/maisons/${maisonId}/regles`, data);
  }

  async update(regleId: number, data: RegleUpdateInput): Promise<ApiResponse<Regle>> {
    return apiClient.put(`/regles/${regleId}`, data);
  }

  async remove(regleId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/regles/${regleId}`);
  }

  async adopter(regleId: number): Promise<ApiResponse<Regle>> {
    return apiClient.post(`/regles/${regleId}/adopter`, {});
  }

  async rejeter(regleId: number): Promise<ApiResponse<Regle>> {
    return apiClient.post(`/regles/${regleId}/rejeter`, {});
  }

  // Rappel à la connexion — à interroger pour la maison active (une fois par
  // session côté mobile, voir `components/RulesReminderModal.tsx`).
  async aLire(maisonId: number): Promise<ApiResponse<ReglesALire>> {
    return apiClient.get(`/maisons/${maisonId}/regles/a-lire`);
  }

  async lues(maisonId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.post(`/maisons/${maisonId}/regles/lues`, {});
  }
}

export const regleService = new RegleService();
export default regleService;
