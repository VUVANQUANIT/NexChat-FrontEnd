import { Injectable, inject } from '@angular/core';
import { AxiosClientService } from './axios-client.service';
import { PageResponse } from './user.service';

export interface FriendRequest {
  id: number;
  requesterId: number;
  requesterUsername: string;
  requesterAvatarUrl?: string;
  addresseeId: number;
  addresseeUsername: string;
  addresseeAvatarUrl?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class FriendshipService {
  private readonly axiosClient = inject(AxiosClientService);

  async sendRequest(addresseeId: number): Promise<FriendRequest> {
    return this.axiosClient.post('/friendships/requests', { addresseeId });
  }

  async getRequests(status?: string, direction = 'RECEIVED', page = 0, size = 20): Promise<PageResponse<FriendRequest>> {
    const params: any = { direction, page, size };
    if (status) params.status = status;
    return this.axiosClient.get('/friendships/requests', { params });
  }

  async acceptRequest(id: number): Promise<any> {
    return this.axiosClient.post(`/friendships/requests/${id}/accept`);
  }

  async rejectRequest(id: number): Promise<any> {
    return this.axiosClient.post(`/friendships/requests/${id}/reject`);
  }
}
