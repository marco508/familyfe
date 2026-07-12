// services/pieceService.ts — Pièces de la maison (ANNEXE V4)
import apiClient, { ApiResponse } from './apiClient';
import { PublicUser } from './maisonService';

export type TypePiece = 'chambre' | 'salon' | 'cuisine' | 'salle_de_bain' | 'bureau' | 'garage' | 'autre';

export interface Piece {
  id: number;
  maison_id: number;
  nom: string;
  type: TypePiece;
  affecte_a: number | null;
  membre: PublicUser | null;
  date_creation: string;
}

export interface PieceCreateInput {
  nom: string;
  type: TypePiece;
  affecte_a?: number | null;
}

export interface PieceUpdateInput extends Partial<PieceCreateInput> {}

class PieceService {
  async list(maisonId: number): Promise<ApiResponse<Piece[]>> {
    return apiClient.get(`/maisons/${maisonId}/pieces`);
  }

  async create(maisonId: number, data: PieceCreateInput): Promise<ApiResponse<Piece>> {
    return apiClient.post(`/maisons/${maisonId}/pieces`, data);
  }

  async update(pieceId: number, data: PieceUpdateInput): Promise<ApiResponse<Piece>> {
    return apiClient.put(`/pieces/${pieceId}`, data);
  }

  async remove(pieceId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/pieces/${pieceId}`);
  }

  async affecter(pieceId: number, utilisateurId: number | null): Promise<ApiResponse<Piece>> {
    return apiClient.post(`/pieces/${pieceId}/affecter`, { utilisateur_id: utilisateurId });
  }
}

export const pieceService = new PieceService();
export default pieceService;
