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

function normalizeSearchUserRow(row: unknown): UserProfile | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const idRaw = r['id'] ?? r['userId'];
  const id = typeof idRaw === 'number' ? idRaw : typeof idRaw === 'string' ? Number(idRaw) : NaN;
  if (!Number.isFinite(id) || id <= 0) return null;
  let username = typeof r['username'] === 'string' ? r['username'].trim() : '';
  const fullFromApi =
      typeof r['fullName'] === 'string'
          ? r['fullName'].trim()
          : typeof r['full_name'] === 'string'
            ? (r['full_name'] as string).trim()
            : '';
  if (!username && fullFromApi) {
    username = fullFromApi.split(/\s+/)[0] ?? fullFromApi;
  }
  if (!username) return null;
  const email = typeof r['email'] === 'string' ? r['email'] : '';
  const fullName = fullFromApi || undefined;
  const avatarUrl =
      typeof r['avatarUrl'] === 'string'
          ? r['avatarUrl']
          : typeof r['avatar_url'] === 'string'
            ? r['avatar_url']
            : undefined;
  return { id, username, email, fullName, avatarUrl };
}

/** Chuẩn hoá nhiều kiểu JSON BE có thể trả (Page `content`, `items`, mảng thẳng…). */
function normalizeUserSearchPage(raw: unknown): PageResponse<UserProfile> {
  const empty: PageResponse<UserProfile> = {
    content: [],
    page: 0,
    size: 0,
    totalElements: 0,
    totalPages: 0,
    first: true,
    last: true
  };

  if (raw == null) return empty;

  // Phòng khi interceptor trả cả envelope `{ data: { content } }` thay vì đã unwrap.
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const nested = o['data'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = nested as Record<string, unknown>;
      if (
        Array.isArray(inner['content']) ||
        Array.isArray(inner['items']) ||
        Array.isArray(inner['users']) ||
        Array.isArray(inner['results'])
      ) {
        return normalizeUserSearchPage(nested);
      }
    }
  }

  if (Array.isArray(raw)) {
    const content = raw.map(normalizeSearchUserRow).filter((u): u is UserProfile => u != null);
    const n = content.length;
    return {
      content,
      page: 0,
      size: n,
      totalElements: n,
      totalPages: n ? 1 : 0,
      first: true,
      last: true
    };
  }

  if (typeof raw !== 'object') return empty;
  const o = raw as Record<string, unknown>;

  let rows: unknown[] = [];
  if (Array.isArray(o['content'])) rows = o['content'] as unknown[];
  else if (Array.isArray(o['items'])) rows = o['items'] as unknown[];
  else if (Array.isArray(o['users'])) rows = o['users'] as unknown[];
  else if (Array.isArray(o['results'])) rows = o['results'] as unknown[];
  else if (Array.isArray(o['data'])) rows = o['data'] as unknown[];

  const content = rows.map(normalizeSearchUserRow).filter((u): u is UserProfile => u != null);

  return {
    content,
    page: typeof o['page'] === 'number' ? o['page'] : Number(o['page']) || 0,
    size: typeof o['size'] === 'number' ? o['size'] : Number(o['size']) || content.length,
    totalElements:
        typeof o['totalElements'] === 'number'
            ? o['totalElements']
            : Number(o['totalElements']) || content.length,
    totalPages:
        typeof o['totalPages'] === 'number' ? o['totalPages'] : Number(o['totalPages']) || 0,
    first: o['first'] !== false,
    last: o['last'] !== false
  };
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly axiosClient = inject(AxiosClientService);

  async searchUsers(query: string, page = 0, size = 20): Promise<PageResponse<UserProfile>> {
    const q = query.trim();
    const raw = await this.axiosClient.get<unknown>(`/users/search`, {
      params: { q, page, size }
    });
    return normalizeUserSearchPage(raw);
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
