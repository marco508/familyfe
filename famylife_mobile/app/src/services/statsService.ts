// services/statsService.ts — ANNEXE V6 : moteur d'équité, streak, bilan de la
// semaine. Statistiques calculées côté API depuis les tâches validées et les
// points gagnés (voir app/routers/stats.py). Purement lecture (GET).
import apiClient, { ApiResponse } from './apiClient';

export type PeriodeEquite = 'semaine' | 'mois';

export interface EquiteMembre {
  utilisateur_id: number;
  nom: string;
  image: string | null;
  taches_faites: number;
  points: number;
  part_pct: number;
}

export interface EquiteSuggestion {
  utilisateur_id: number;
  nom: string;
  image: string | null;
}

export interface Equite {
  periode: PeriodeEquite;
  total_taches: number;
  moyenne_pct: number;
  desequilibre: boolean;
  suggestion: EquiteSuggestion | null;
  membres: EquiteMembre[];
}

export interface Streak {
  streak: number;
  actif_aujourdhui: boolean;
}

export interface BilanMembre {
  utilisateur_id: number;
  nom: string;
  image: string | null;
  taches: number;
}

export interface BilanSemaine {
  total_taches: number;
  points_semaine: number;
  top: BilanMembre | null;
  par_membre: BilanMembre[];
}

class StatsService {
  // Moteur d'équité : part de la charge (tâches validées) par membre.
  async equite(maisonId: number, periode: PeriodeEquite = 'semaine'): Promise<ApiResponse<Equite>> {
    return apiClient.get(`/maisons/${maisonId}/equite`, { params: { periode } });
  }

  // Série de l'utilisateur courant (jours consécutifs avec au moins une tâche validée).
  async streak(maisonId: number): Promise<ApiResponse<Streak>> {
    return apiClient.get(`/maisons/${maisonId}/streak`);
  }

  // Bilan motivant des 7 derniers jours (total, top membre, répartition, points).
  async bilanSemaine(maisonId: number): Promise<ApiResponse<BilanSemaine>> {
    return apiClient.get(`/maisons/${maisonId}/bilan-semaine`);
  }
}

export const statsService = new StatsService();
export default statsService;
