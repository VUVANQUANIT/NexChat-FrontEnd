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

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Normalise a single friendship-request row from whatever shape the backend sends. */
function normalizeFriendRequestRow(row: unknown): FriendRequest | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;

  // id may be called: id | friendRequestId | requestId | request_id | friendshipId | friendship_id
  const id =
    num(r['id']) ??
    num(r['friendRequestId']) ??
    num(r['requestId']) ??
    num(r['request_id']) ??
    num(r['friendshipId']) ??
    num(r['friendship_id']);
  if (id == null) return null;

  const requesterId =
    num(r['requesterId']) ?? num(r['requester_id']) ?? num(r['senderId']) ?? 0;
  const addresseeId =
    num(r['addresseeId']) ?? num(r['addressee_id']) ?? num(r['receiverId']) ?? 0;

  // avatar field names vary: requesterAvatarUrl | requestAvatarUrl | requester_avatar_url
  const requesterAvatarUrl =
    str(r['requesterAvatarUrl']) || str(r['requestAvatarUrl']) || str(r['requester_avatar_url']) || undefined;
  // addresseeAvatarUrl | addressAvatarUrl | addressee_avatar_url
  const addresseeAvatarUrl =
    str(r['addresseeAvatarUrl']) || str(r['addressAvatarUrl']) || str(r['addressee_avatar_url']) || undefined;

  return {
    id,
    requesterId,
    requesterUsername: str(r['requesterUsername']) || str(r['requester_username']) || str(r['senderUsername']),
    requesterAvatarUrl: requesterAvatarUrl || undefined,
    addresseeId,
    addresseeUsername: str(r['addresseeUsername']) || str(r['addressee_username']) || str(r['receiverUsername']),
    addresseeAvatarUrl: addresseeAvatarUrl || undefined,
    status: (str(r['status']) as FriendRequest['status']) || 'PENDING',
    createdAt: str(r['createdAt']) || str(r['created_at'])
  };
}

/** Normalise the page wrapper — mirrors normalizeUserSearchPage in user.service.ts. */
function normalizeFriendRequestPage(raw: unknown): PageResponse<FriendRequest> {
  const empty: PageResponse<FriendRequest> = {
    content: [], page: 0, size: 0, totalElements: 0, totalPages: 0, first: true, last: true
  };
  if (raw == null) return empty;

  // Unwrap double-nested { data: { content } } in case interceptor didn't
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const nested = o['data'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = nested as Record<string, unknown>;
      if (Array.isArray(inner['content']) || Array.isArray(inner['items'])) {
        return normalizeFriendRequestPage(nested);
      }
    }
  }

  if (Array.isArray(raw)) {
    const content = raw.map(normalizeFriendRequestRow).filter((r): r is FriendRequest => r != null);
    return { content, page: 0, size: content.length, totalElements: content.length, totalPages: content.length ? 1 : 0, first: true, last: true };
  }

  if (typeof raw !== 'object') return empty;
  const o = raw as Record<string, unknown>;

  let rows: unknown[] = [];
  if (Array.isArray(o['content'])) rows = o['content'] as unknown[];
  else if (Array.isArray(o['items'])) rows = o['items'] as unknown[];
  else if (Array.isArray(o['data'])) rows = o['data'] as unknown[];

  const content = rows.map(normalizeFriendRequestRow).filter((r): r is FriendRequest => r != null);
  return {
    content,
    page: typeof o['page'] === 'number' ? o['page'] : Number(o['page']) || 0,
    size: typeof o['size'] === 'number' ? o['size'] : Number(o['size']) || content.length,
    totalElements: typeof o['totalElements'] === 'number' ? o['totalElements'] : Number(o['totalElements']) || content.length,
    totalPages: typeof o['totalPages'] === 'number' ? o['totalPages'] : Number(o['totalPages']) || 0,
    first: o['first'] !== false,
    last: o['last'] !== false
  };
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
    const raw = await this.axiosClient.get<unknown>('/friendships/requests', { params });
    return normalizeFriendRequestPage(raw);
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
