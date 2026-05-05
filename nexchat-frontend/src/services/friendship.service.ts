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

/** Other side of an ACCEPTED friendship (spec: GET /friendships/requests?status=ACCEPTED). */
export interface FriendSummary {
  id: number;
  username: string;
  avatarUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class FriendshipService {
  private readonly axiosClient = inject(AxiosClientService);

  async sendRequest(addresseeId: number): Promise<FriendRequest> {
    return this.axiosClient.post('/friendships/requests', { addresseeId });
  }

  async getRequests(status?: string, direction = 'RECEIVED', page = 0, size = 20): Promise<PageResponse<FriendRequest>> {
    const params: { direction: string; page: number; size: number; status?: string } = { direction, page, size };
    if (status) params.status = status;
    return this.axiosClient.get('/friendships/requests', { params });
  }

  async acceptRequest(id: number): Promise<{ success: boolean }> {
    return this.axiosClient.post<{ success: boolean }>(`/friendships/requests/${id}/accept`);
  }

  async rejectRequest(id: number): Promise<{ success: boolean }> {
    return this.axiosClient.post<{ success: boolean }>(`/friendships/requests/${id}/reject`);
  }

  async blockUser(userId: number): Promise<{ success: boolean }> {
    return this.axiosClient.post<{ success: boolean }>(`/friendships/${userId}/block`);
  }

  async unfriend(userId: number): Promise<void> {
    return this.axiosClient.delete<void>(`/friendships/${userId}`);
  }

  async countPendingReceived(): Promise<number> {
    const res = await this.getRequests('PENDING', 'RECEIVED', 0, 50);
    return res.totalElements ?? res.content.length;
  }

  /** Accepted friendships (both directions), de-duplicated by friend user id. */
  async listAcceptedFriends(currentUserId: number): Promise<FriendSummary[]> {
    const [recv, sent] = await Promise.all([
      this.getRequests('ACCEPTED', 'RECEIVED', 0, 100),
      this.getRequests('ACCEPTED', 'SENT', 0, 100)
    ]);
    const map = new Map<number, FriendSummary>();
    for (const fr of [...recv.content, ...sent.content]) {
      const friend: FriendSummary =
          fr.requesterId === currentUserId
              ? {
                    id: fr.addresseeId,
                    username: fr.addresseeUsername,
                    avatarUrl: fr.addresseeAvatarUrl ?? undefined
                }
              : {
                    id: fr.requesterId,
                    username: fr.requesterUsername,
                    avatarUrl: fr.requesterAvatarUrl ?? undefined
                };
      map.set(friend.id, friend);
    }
    return [...map.values()].sort((a, b) => a.username.localeCompare(b.username));
  }
}
