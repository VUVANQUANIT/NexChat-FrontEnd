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
}
