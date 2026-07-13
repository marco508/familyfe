// services/tacheService.ts — Tâches domestiques (ANNEXE V4)
// Corvées : assigné (fixe ou rotation), fréquence/routine, gage, validation en
// cochant (case à cocher) par le titulaire ou la gestion. Distinct des
// Activités (sociales, "à faire ensemble").
import apiClient, { ApiResponse } from './apiClient';
import { MiniUser } from './activiteService';

export type FrequenceTache = 'ponctuel' | 'quotidien' | 'hebdo' | 'mensuel';
export type AssignationTache = 'fixe' | 'rotation';
export type StatutTache = 'a_faire' | 'fait';

// Effet de gage paramétrable, appliqué automatiquement à l'oubli / à la réussite.
export type GageEffetType = 'points' | 'tache' | 'amende' | 'note';
export interface GageEffet {
  type: GageEffetType;
  valeur?: number; // points (négatif = pénalité)
  titre?: string; // tache : intitulé de la corvée
  jours?: number; // tache : échéance dans N jours
  montant?: number; // amende : € dus à la cagnotte
  texte?: string; // note : message
}

export interface Tache {
  id: number;
  maison_id: number;
  titre: string;
  description: string | null;
  piece_id: number | null;
  frequence: FrequenceTache;
  assignation: AssignationTache;
  assigne_id: number | null;
  rotation_ordre: number[];
  rotation_index: number;
  rotation_conditions: string | null;
  gage_actif: boolean;
  penalite: string | null;
  recompense: string | null;
  points_penalite: number;
  points_recompense: number;
  // Gage « corvée » cumulatif (ANNEXE V5) : sur oubli en rotation, la tâche reste
  // au retardataire ; gage_semaines_restantes suit le nombre de semaines dues.
  gage_semaines: number;
  gage_semaines_restantes: number;
  gage_effets_echec: GageEffet[];
  gage_effets_reussite: GageEffet[];
  echeance_date: string | null; // AAAA-MM-JJ
  echeance_heure: string | null; // HH:MM
  // Seuil par jour de semaine (0=lundi … 6=dimanche), alternative à une date fixe.
  echeance_jour_semaine: number | null;
  statut: StatutTache;
  prochaine_echeance: string | null;
  createur_id: number;
  date_creation: string;
  // Titulaire courant = assigne_id (fixe) ou rotation_ordre[rotation_index] (rotation).
  titulaire: MiniUser | null;
  fait_aujourdhui: boolean;
  // Pièces couvertes par la tâche (relation multi-pièces).
  pieces: { id: number; nom: string; type: string }[];
}

export interface TacheCreateInput {
  titre: string;
  description?: string;
  piece_id?: number | null;
  piece_ids?: number[]; // une tâche peut couvrir plusieurs pièces
  frequence?: FrequenceTache;
  assignation?: AssignationTache;
  assigne_id?: number | null;
  rotation_ordre?: number[];
  rotation_conditions?: string;
  gage_actif?: boolean;
  penalite?: string;
  recompense?: string;
  points_penalite?: number;
  points_recompense?: number;
  gage_semaines?: number; // gage initial (semaines) imposé au 1er oubli
  gage_effets_echec?: GageEffet[];
  gage_effets_reussite?: GageEffet[];
  echeance_date?: string;
  echeance_heure?: string;
  echeance_jour_semaine?: number | null; // 0=lundi … 6=dimanche
}

export interface TacheUpdateInput extends Partial<TacheCreateInput> {}

class TacheService {
  async list(maisonId: number): Promise<ApiResponse<Tache[]>> {
    return apiClient.get(`/maisons/${maisonId}/taches`);
  }

  async create(maisonId: number, data: TacheCreateInput): Promise<ApiResponse<Tache>> {
    return apiClient.post(`/maisons/${maisonId}/taches`, data);
  }

  async get(tacheId: number): Promise<ApiResponse<Tache>> {
    return apiClient.get(`/taches/${tacheId}`);
  }

  async update(tacheId: number, data: TacheUpdateInput): Promise<ApiResponse<Tache>> {
    return apiClient.put(`/taches/${tacheId}`, data);
  }

  async remove(tacheId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/taches/${tacheId}`);
  }

  // Titulaire (ou gestion) — valide la période courante ; récompense (gage),
  // programme la suite (récurrence/rotation).
  async valider(tacheId: number): Promise<ApiResponse<Tache>> {
    return apiClient.post(`/taches/${tacheId}/valider`, {});
  }
}

export const tacheService = new TacheService();
export default tacheService;
