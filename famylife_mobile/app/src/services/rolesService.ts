// services/rolesService.ts — Rôles, transfert de chef, famille & visiteurs
// (ANNEXE V3 + rôles étendus ANNEXE V4).
import apiClient, { ApiResponse } from './apiClient';
import { LienFamille, Membre, RoleMembre } from './maisonService';

export interface RoleUpdateInput {
  // Le passage à 'chef' se fait uniquement via transfererChef().
  role?: Exclude<RoleMembre, 'chef'>;
  est_enfant?: boolean;
  // ANNEXE V4 — lien familial + expiration (chef_temporaire / visiteur).
  lien_famille?: LienFamille | null;
  expire_le?: string | null;
}

class RolesService {
  // Chef uniquement.
  async setRole(maisonId: number, utilisateurId: number, data: RoleUpdateInput): Promise<ApiResponse<Membre>> {
    return apiClient.post(`/maisons/${maisonId}/membres/${utilisateurId}/role`, data);
  }

  // Chef uniquement — l'ancien chef devient membre.
  async transfererChef(maisonId: number, utilisateurId: number): Promise<ApiResponse<{ role: string }>> {
    return apiClient.post(`/maisons/${maisonId}/transferer-chef`, { utilisateur_id: utilisateurId });
  }

  // ANNEXE V4 — chef uniquement : désigne un chef temporaire (expiration optionnelle).
  async chefTemporaire(maisonId: number, utilisateurId: number, expireLe?: string): Promise<ApiResponse<Membre>> {
    return apiClient.post(`/maisons/${maisonId}/chef-temporaire`, {
      utilisateur_id: utilisateurId,
      expire_le: expireLe || undefined,
    });
  }

  // ANNEXE V4 — gestion (chef/co-chef/chef temporaire) : marque un membre
  // "visiteur" temporaire (lecture seule) + déclenche le rappel des règles.
  async visiteurs(maisonId: number, utilisateurId: number, expireLe: string): Promise<ApiResponse<Membre>> {
    return apiClient.post(`/maisons/${maisonId}/visiteurs`, {
      utilisateur_id: utilisateurId,
      expire_le: expireLe,
    });
  }
}

export const rolesService = new RolesService();
export default rolesService;
