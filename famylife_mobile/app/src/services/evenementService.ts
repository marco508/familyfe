// services/evenementService.ts
import apiClient, { ApiResponse } from './apiClient';
import { MiniUser } from './activiteService';

export type RecurrenceEvenement = 'aucune' | 'hebdo' | 'mensuel';
export type ReponseRsvp = 'oui' | 'non' | 'peut_etre';

export interface ReponseEvenement {
  utilisateur_id: number;
  reponse: ReponseRsvp;
  nom: string;
  image: string | null;
}

export interface Evenement {
  id: number;
  maison_id: number;
  titre: string;
  description: string | null;
  date_debut: string; // ISO
  date_fin: string | null;
  toute_la_journee: boolean;
  lieu: string | null;
  couleur: string;
  createur_id: number;
  date_creation: string;
  createur: MiniUser | null;
  // ANNEXE V3 — récurrence + RSVP
  recurrence: RecurrenceEvenement;
  reponses: ReponseEvenement[];
  ma_reponse: ReponseRsvp | null;
}

export interface EvenementCreateInput {
  titre: string;
  description?: string;
  date_debut: string; // ISO
  date_fin?: string;
  toute_la_journee?: boolean;
  lieu?: string;
  couleur?: string;
  recurrence?: RecurrenceEvenement;
}

export interface EvenementUpdateInput extends Partial<EvenementCreateInput> {}

class EvenementService {
  async list(maisonId: number, debut?: string, fin?: string): Promise<ApiResponse<Evenement[]>> {
    return apiClient.get(`/maisons/${maisonId}/evenements`, {
      params: { debut, fin },
    });
  }

  async create(maisonId: number, data: EvenementCreateInput): Promise<ApiResponse<Evenement>> {
    return apiClient.post(`/maisons/${maisonId}/evenements`, data);
  }

  async get(evenementId: number): Promise<ApiResponse<Evenement>> {
    return apiClient.get(`/evenements/${evenementId}`);
  }

  async update(evenementId: number, data: EvenementUpdateInput): Promise<ApiResponse<Evenement>> {
    return apiClient.put(`/evenements/${evenementId}`, data);
  }

  async remove(evenementId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/evenements/${evenementId}`);
  }

  // ANNEXE V3 — RSVP (Oui / Non / Peut-être).
  async repondre(evenementId: number, reponse: ReponseRsvp): Promise<ApiResponse<Evenement>> {
    return apiClient.post(`/evenements/${evenementId}/reponse`, { reponse });
  }

  // ANNEXE V3 — export iCal : renvoie l'URL absolue de `GET /maisons/{id}/agenda.ics`
  // (le token ne peut pas être passé en header via Linking : voir écran agenda pour
  // le comportement "copier le lien" côté client).
  icalUrl(maisonId: number): string {
    return `${apiClient.getBaseUrl()}/maisons/${maisonId}/agenda.ics`;
  }
}

export const evenementService = new EvenementService();
export default evenementService;
