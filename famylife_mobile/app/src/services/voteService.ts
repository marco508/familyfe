// services/voteService.ts
import apiClient, { ApiResponse } from './apiClient';
import { MiniUser } from './activiteService';

export type StatutVote = 'ouvert' | 'clos';

export interface VoteOption {
  id: number;
  texte: string;
  nb_voix: number;
}

export interface Vote {
  id: number;
  maison_id: number;
  question: string;
  description: string | null;
  statut: StatutVote;
  createur_id: number;
  date_creation: string;
  date_cloture: string | null;
  createur: MiniUser | null;
  options: VoteOption[];
  total_voix: number;
  mon_vote_option_id: number | null;
}

export interface VoteCreateInput {
  question: string;
  description?: string;
  options: string[];
}

class VoteService {
  async list(maisonId: number): Promise<ApiResponse<Vote[]>> {
    return apiClient.get(`/maisons/${maisonId}/votes`);
  }

  async create(maisonId: number, data: VoteCreateInput): Promise<ApiResponse<Vote>> {
    return apiClient.post(`/maisons/${maisonId}/votes`, data);
  }

  async get(voteId: number): Promise<ApiResponse<Vote>> {
    return apiClient.get(`/votes/${voteId}`);
  }

  async voter(voteId: number, optionId: number): Promise<ApiResponse<Vote>> {
    return apiClient.post(`/votes/${voteId}/voter`, { option_id: optionId });
  }

  async cloturer(voteId: number): Promise<ApiResponse<Vote>> {
    return apiClient.post(`/votes/${voteId}/cloturer`, {});
  }

  async remove(voteId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/votes/${voteId}`);
  }
}

export const voteService = new VoteService();
export default voteService;
