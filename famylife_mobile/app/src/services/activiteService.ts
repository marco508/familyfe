// services/activiteService.ts
import apiClient, { ApiResponse } from './apiClient';
import { GageEffet } from './tacheService';

export type StatutActivite = 'a_faire' | 'en_cours' | 'termine';
export type GageResultat = 'en_attente' | 'reussi' | 'echoue';
export type Recurrence = 'aucune' | 'quotidien' | 'hebdo' | 'mensuel';
// ANNEXE V4 — activités sociales à participants : `maison` (tout le monde voit)
// ou `participants` (seuls les participants + créateur voient/sont notifiés).
export type Visibilite = 'maison' | 'participants';

export interface MiniUser {
  id: number;
  nom: string;
  image: string | null;
}

export interface SousTache {
  id: number;
  titre: string;
  fait: boolean;
}

export interface Activite {
  id: number;
  maison_id: number;
  titre: string;
  description: string | null;
  statut: StatutActivite;
  date_echeance: string | null; // AAAA-MM-JJ
  heure_echeance: string | null; // HH:MM
  // Seuil par jour de semaine (0=lundi … 6=dimanche), alternative à une date fixe.
  echeance_jour_semaine: number | null;
  rappel: boolean;
  createur_id: number;
  date_creation: string;
  createur: MiniUser | null;
  assignes: MiniUser[];
  // Gage
  gage_actif: boolean;
  penalite: string | null;
  recompense: string | null;
  points_penalite: number;
  points_recompense: number;
  gage_resultat: GageResultat;
  // Effets de gage paramétrables (appliqués à la résolution du gage).
  gage_effets_echec: GageEffet[];
  gage_effets_reussite: GageEffet[];
  // ANNEXE V3 — récurrence, sous-tâches, photo preuve.
  recurrence: Recurrence;
  sous_taches: SousTache[];
  preuve_url: string | null;
  // ANNEXE V4 — visibilité + participants (activités sociales).
  visibilite: Visibilite;
  participants: MiniUser[];
}

export interface ActiviteCreateInput {
  titre: string;
  description?: string;
  statut?: StatutActivite;
  date_echeance?: string; // AAAA-MM-JJ
  heure_echeance?: string; // HH:MM
  echeance_jour_semaine?: number | null; // 0=lundi … 6=dimanche
  rappel?: boolean;
  assignes?: number[];
  // Gage
  gage_actif?: boolean;
  penalite?: string;
  recompense?: string;
  points_penalite?: number;
  points_recompense?: number;
  gage_effets_echec?: GageEffet[];
  gage_effets_reussite?: GageEffet[];
  // Récurrence
  recurrence?: Recurrence;
  // ANNEXE V4 — visibilité + participants.
  visibilite?: Visibilite;
  participants?: number[];
}

export interface ActiviteUpdateInput extends Partial<ActiviteCreateInput> {}

class ActiviteService {
  async list(maisonId: number, statut?: StatutActivite): Promise<ApiResponse<Activite[]>> {
    return apiClient.get(`/maisons/${maisonId}/activites`, { params: statut ? { statut } : undefined });
  }

  async create(maisonId: number, data: ActiviteCreateInput): Promise<ApiResponse<Activite>> {
    return apiClient.post(`/maisons/${maisonId}/activites`, data);
  }

  async get(activiteId: number): Promise<ApiResponse<Activite>> {
    return apiClient.get(`/activites/${activiteId}`);
  }

  async update(activiteId: number, data: ActiviteUpdateInput): Promise<ApiResponse<Activite>> {
    return apiClient.put(`/activites/${activiteId}`, data);
  }

  async updateStatut(activiteId: number, statut: StatutActivite): Promise<ApiResponse<Activite>> {
    return apiClient.patch(`/activites/${activiteId}/statut`, { statut });
  }

  async remove(activiteId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/activites/${activiteId}`);
  }

  // Gage : chef ou créateur — réussi (+points_recompense, statut termine) ou échoué (-points_penalite).
  async resoudreGage(activiteId: number, resultat: 'reussi' | 'echoue'): Promise<ApiResponse<Activite>> {
    return apiClient.post(`/activites/${activiteId}/gage/resoudre`, { resultat });
  }

  // ANNEXE V3 — Sous-tâches (checklist).
  async listSousTaches(activiteId: number): Promise<ApiResponse<SousTache[]>> {
    return apiClient.get(`/activites/${activiteId}/sous-taches`);
  }

  async createSousTache(activiteId: number, titre: string): Promise<ApiResponse<SousTache>> {
    return apiClient.post(`/activites/${activiteId}/sous-taches`, { titre });
  }

  async updateSousTache(sousTacheId: number, data: { fait?: boolean; titre?: string }): Promise<ApiResponse<SousTache>> {
    return apiClient.patch(`/sous-taches/${sousTacheId}`, data);
  }

  async removeSousTache(sousTacheId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/sous-taches/${sousTacheId}`);
  }

  // ANNEXE V3 — Photo preuve (multipart).
  async uploadPreuve(activiteId: number, fileUri: string): Promise<ApiResponse<{ preuve_url: string }>> {
    return apiClient.uploadImage(`/activites/${activiteId}/preuve`, fileUri, 'image');
  }
}

export const activiteService = new ActiviteService();
export default activiteService;
