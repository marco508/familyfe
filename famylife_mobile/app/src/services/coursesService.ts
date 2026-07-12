// services/coursesService.ts — Liste de courses (ANNEXE V3)
import apiClient, { ApiResponse } from './apiClient';

export interface CourseItem {
  id: number;
  maison_id: number;
  nom: string;
  quantite: string | null;
  categorie: string | null;
  achete: boolean;
  ajoute_par: number;
  achete_par: number | null;
  date_creation: string;
}

export interface CourseItemCreateInput {
  nom: string;
  quantite?: string;
  categorie?: string;
}

export interface CourseItemUpdateInput {
  achete?: boolean;
  nom?: string;
  quantite?: string;
  categorie?: string;
}

class CoursesService {
  async list(maisonId: number): Promise<ApiResponse<CourseItem[]>> {
    return apiClient.get(`/maisons/${maisonId}/courses`);
  }

  async create(maisonId: number, data: CourseItemCreateInput): Promise<ApiResponse<CourseItem>> {
    return apiClient.post(`/maisons/${maisonId}/courses`, data);
  }

  async update(itemId: number, data: CourseItemUpdateInput): Promise<ApiResponse<CourseItem>> {
    return apiClient.patch(`/courses/${itemId}`, data);
  }

  async remove(itemId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/courses/${itemId}`);
  }

  async viderAchetes(maisonId: number): Promise<ApiResponse<{ message: string }>> {
    return apiClient.delete(`/maisons/${maisonId}/courses/achetes`);
  }
}

export const coursesService = new CoursesService();
export default coursesService;
