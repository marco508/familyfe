// services/classementService.ts — Classement des points + badges (ANNEXE V3)
import apiClient, { ApiResponse } from './apiClient';

export type PeriodeClassement = 'semaine' | 'mois' | 'total';

export interface ClassementEntry {
  utilisateur_id: number;
  nom: string;
  image: string | null;
  points: number;
}

export interface Badge {
  code: string;
  titre: string;
  description: string;
}

export interface MembreBadges {
  utilisateur_id: number;
  nom: string;
  image: string | null;
  points: number;
  badges: Badge[];
}

class ClassementService {
  async get(maisonId: number, periode: PeriodeClassement = 'total'): Promise<ApiResponse<ClassementEntry[]>> {
    return apiClient.get(`/maisons/${maisonId}/classement`, { params: { periode } });
  }

  async badges(maisonId: number): Promise<ApiResponse<MembreBadges[]>> {
    return apiClient.get(`/maisons/${maisonId}/badges`);
  }
}

export const classementService = new ClassementService();
export default classementService;
