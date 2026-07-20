// services/maisonService.ts
import apiClient, { ApiResponse } from './apiClient';

export interface PublicUser {
  id: number;
  nom: string;
  email: string;
  telephone: string | null;
  image: string | null;
}

// ANNEXE V4 — rôles étendus (chef_temporaire, visiteur) + lien familial.
export type RoleMembre = 'chef' | 'co_chef' | 'chef_temporaire' | 'membre' | 'visiteur';
export type LienFamille = 'pere' | 'mere' | 'enfant' | 'frere' | 'soeur' | 'conjoint' | 'autre';
export type TypeLogement = 'maison' | 'appartement';

// ANNEXE V8 — découverte progressive. Un foyer neuf démarre avec `modules: []`
// et n'affiche que le cœur de l'app (Aujourd'hui, Tâches, Agenda, Équité,
// Logement, Inviter, Réglages, Notifications) : ces briques-là ne sont JAMAIS
// désactivables. Le reste s'active à la demande depuis `(app)/modules`.
// Seules valeurs acceptées par l'API (un module inconnu → 400).
export const MODULES_CLES = ['courses', 'depenses', 'decisions', 'jeu', 'portefeuille', 'chat'] as const;
export type ModuleCle = (typeof MODULES_CLES)[number];

export interface Membre extends PublicUser {
  role: RoleMembre;
  date_ajout: string;
  points: number;
  // ANNEXE V3 — profil enfant (restreint certaines actions de gestion/votes).
  est_enfant: boolean;
  // ANNEXE V4 — famille & rôles étendus (temporaires).
  lien_famille: LienFamille | null;
  role_expire_le: string | null; // chef_temporaire
  visite_expire_le: string | null; // visiteur
}

export interface Anniversaire {
  id: number;
  nom: string;
  image: string | null;
  date_naissance: string;
  prochaine_date: string;
  jours_restants: number;
  age_a_venir: number;
  aujourdhui: boolean;
}

export interface Maison {
  id: number;
  nom: string;
  code_invitation: string;
  chef_id: number;
  emoji: string;
  couleur: string;
  date_creation: string;
  // ANNEXE V4 — logement / adresse (colonnes ajoutées à `maisons`).
  type_logement: TypeLogement;
  adresse: string | null;
  complement: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  etage: string | null;
  numero_appartement: string | null;
  digicode: string | null;
  interphone: string | null;
  acces: string | null;
  surface: number | null;
  // ANNEXE V8 — modules optionnels activés pour ce logement. `[]` = foyer neuf
  // (rien d'optionnel n'est allumé). Les anciennes versions du serveur peuvent
  // omettre le champ : le repli sur `[]` est centralisé dans MaisonContext.
  modules: ModuleCle[];
}

export interface MaisonListItem extends Maison {
  role: RoleMembre;
  nb_membres: number;
}

export interface MaisonDetail extends Maison {
  role: RoleMembre;
  membres: Membre[];
  // ANNEXE V4 — nombre de pièces déclarées.
  nb_pieces: number;
}

export interface MaisonCreateInput {
  nom: string;
  emoji?: string;
  couleur?: string;
}

// ANNEXE V4 — mise à jour étendue (gestion) : nom/emoji/couleur + logement.
export interface MaisonUpdateInput extends Partial<MaisonCreateInput> {
  type_logement?: TypeLogement;
  adresse?: string;
  complement?: string;
  code_postal?: string;
  ville?: string;
  pays?: string;
  etage?: string;
  numero_appartement?: string;
  digicode?: string;
  interphone?: string;
  acces?: string;
  surface?: number | null;
  // ANNEXE V8 — `[]` est légitime (tout couper). Réservé chef/co-chef (403 sinon).
  modules?: ModuleCle[];
}

class MaisonService {
  async list(): Promise<ApiResponse<MaisonListItem[]>> {
    return apiClient.get('/maisons');
  }

  async get(maisonId: number): Promise<ApiResponse<MaisonDetail>> {
    return apiClient.get(`/maisons/${maisonId}`);
  }

  async create(data: MaisonCreateInput): Promise<ApiResponse<MaisonListItem>> {
    return apiClient.post('/maisons', data);
  }

  async update(maisonId: number, data: MaisonUpdateInput): Promise<ApiResponse<Maison>> {
    return apiClient.put(`/maisons/${maisonId}`, data);
  }

  async remove(maisonId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/maisons/${maisonId}`);
  }

  async join(codeInvitation: string): Promise<ApiResponse<Maison & { role: string }>> {
    return apiClient.post('/maisons/join', { code_invitation: codeInvitation });
  }

  async membres(maisonId: number): Promise<ApiResponse<Membre[]>> {
    return apiClient.get(`/maisons/${maisonId}/membres`);
  }

  async addMembre(maisonId: number, utilisateurId: number): Promise<ApiResponse<PublicUser>> {
    return apiClient.post(`/maisons/${maisonId}/membres`, { utilisateur_id: utilisateurId });
  }

  async removeMembre(maisonId: number, utilisateurId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/maisons/${maisonId}/membres/${utilisateurId}`);
  }

  async searchUsers(q: string): Promise<ApiResponse<PublicUser[]>> {
    return apiClient.get('/users/search', { params: { q } });
  }

  async searchUsersByTelephones(telephones: string[]): Promise<ApiResponse<PublicUser[]>> {
    return apiClient.post('/users/search/telephones', { telephones });
  }

  async anniversaires(maisonId: number): Promise<ApiResponse<Anniversaire[]>> {
    return apiClient.get(`/maisons/${maisonId}/anniversaires`);
  }
}

export const maisonService = new MaisonService();
export default maisonService;
