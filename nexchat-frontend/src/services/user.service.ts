import { Injectable, inject } from '@angular/core';
import { AxiosClientService } from './axios-client.service';
import { UserProfile } from './auth.service';

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly axiosClient = inject(AxiosClientService);

  async searchUsers(query: string, page = 0, size = 20): Promise<PageResponse<UserProfile>> {
    return this.axiosClient.get(`/users/search`, { params: { q: query, page, size } });
  }

  async getMe(): Promise<UserProfile> {
    return this.axiosClient.get<UserProfile>('/users/me');
  }

  async updateMe(payload: Partial<Pick<UserProfile, 'fullName' | 'avatarUrl'>>): Promise<UserProfile> {
    return this.axiosClient.patch<UserProfile>('/users/me', payload);
  }

  async getUserById(userId: number): Promise<UserProfile> {
    return this.axiosClient.get<UserProfile>(`/users/${userId}`);
  }
}
