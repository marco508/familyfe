// services/portefeuilleService.ts — Portefeuille immobilier (ANNEXE V4)
// Pour l'appelant : liste des maisons dont il est chef (ou chef_temporaire),
// avec un résumé "patrimoine" (adresse, pièces, membres, surface).
import apiClient, { ApiResponse } from './apiClient';
import { TypeLogement } from './maisonService';

export interface MaisonPortefeuille {
  id: number;
  nom: string;
  emoji: string;
  couleur: string;
  type_logement: TypeLogement;
  adresse: string | null;
  complement: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  surface: number | null;
  nb_pieces: number;
  nb_membres: number;
}

class PortefeuilleService {
  async list(): Promise<ApiResponse<MaisonPortefeuille[]>> {
    return apiClient.get('/portefeuille');
  }
}

export const portefeuilleService = new PortefeuilleService();
export default portefeuilleService;
