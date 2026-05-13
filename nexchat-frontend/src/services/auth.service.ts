import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AxiosClientService } from './axios-client.service';
import { AuthStore } from '../stores/auth.store';

export interface RegisterRequest {
    fullName: string;
    username: string;
    email: string;
    password: string;
    confirmPassword?: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    access_token?: string;
    accessToken?: string;
    refresh_token?: string;
    refreshToken?: string;
    expiresIn?: string;
    token_type?: string;
}

/** Axios interceptor may unwrap `{ data: ... }` or return nested shapes — normalize tokens. */
function pickTokens(body: unknown): { access: string | null; refresh: string | null } {
    if (!body || typeof body !== 'object') {
        return { access: null, refresh: null };
    }
    const root = body as Record<string, unknown>;
    const inner = root['data'];
    const bucket =
        inner && typeof inner === 'object'
            ? (inner as Record<string, unknown>)
            : root;
    const access =
        asNonEmptyString(bucket['access_token']) ??
        asNonEmptyString(bucket['accessToken']) ??
        asNonEmptyString(root['access_token']) ??
        asNonEmptyString(root['accessToken']);
    const refresh =
        asNonEmptyString(bucket['refresh_token']) ??
        asNonEmptyString(bucket['refreshToken']) ??
        asNonEmptyString(root['refresh_token']) ??
        asNonEmptyString(root['refreshToken']);
    return { access, refresh };
}

function asNonEmptyString(v: unknown): string | null {
    return typeof v === 'string' && v.length > 0 ? v : null;
}

export interface UserProfile {
    id: number;
    username: string;
    email: string;
    fullName?: string;
    avatarUrl?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly router = inject(Router);
    private readonly axiosClient = inject(AxiosClientService);
    private readonly authStore = inject(AuthStore);

    // Auth state using signals - delegate to store
    readonly isAuthenticated = this.authStore.isAuthenticated;
    readonly currentUser = this.authStore.currentUser;

    constructor() {
        // Check if user is already logged in on service initialization
        this.checkAuthStatus();
    }

    async register(data: RegisterRequest): Promise<void> {
        this.authStore.setLoading(true);
        this.authStore.setError(null);

        try {
            const response = await this.axiosClient.post<LoginResponse>('/auth/register', data);
            const { access, refresh } = pickTokens(response);
            if (!access) {
                throw new Error('Invalid auth response: missing access token');
            }
            localStorage.setItem('access_token', access);
            if (refresh) {
                localStorage.setItem('refresh_token', refresh);
            }

            try {
                await this.loadUserProfile();
            } catch (e) {
                console.error('Profile fetch failed after register', e);
            }

            await this.router.navigateByUrl('/inbox', { replaceUrl: true });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Registration failed';
            this.authStore.setError(message);
            throw error;
        } finally {
            this.authStore.setLoading(false);
        }
    }

    async login(credentials: LoginRequest): Promise<void> {
        this.authStore.setLoading(true);
        this.authStore.setError(null);

        try {
            const response = await this.axiosClient.post<LoginResponse>('/auth/login', credentials);
            const { access, refresh } = pickTokens(response);
            if (!access) {
                throw new Error('Invalid auth response: missing access token');
            }
            localStorage.setItem('access_token', access);
            if (refresh) {
                localStorage.setItem('refresh_token', refresh);
            }

            try {
                await this.loadUserProfile();
            } catch (e) {
                console.error('Profile fetch failed after login', e);
            }

            await this.router.navigateByUrl('/inbox', { replaceUrl: true });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Login failed';
            this.authStore.setError(message);
            throw error;
        } finally {
            this.authStore.setLoading(false);
        }
    }

    async logout(): Promise<void> {
        try {
            await this.axiosClient.post('/auth/logout');
        } catch (e) {
            console.error('Logout API failed', e);
        } finally {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            this.authStore.setUnauthenticated();
            this.router.navigate(['/login']);
        }
    }

    private async checkAuthStatus(): Promise<void> {
        const token = localStorage.getItem('access_token');
        if (token) {
             try {
                 await this.loadUserProfile();
             } catch (e) {
                 // Token might be expired or invalid. Error will be caught and interceptor might clear it
             }
        }
    }

    private async loadUserProfile(): Promise<void> {
        const userProfile = await this.axiosClient.get<UserProfile>('/users/me');
        this.authStore.setAuthenticated(userProfile);
    }

    /** Used when a route opens with a stored token but the store is not hydrated yet. */
    async hydrateSessionFromStoredToken(): Promise<void> {
        await this.loadUserProfile();
    }

    getAccessToken(): string | null {
        return localStorage.getItem('access_token');
    }

    getRefreshToken(): string | null {
        return localStorage.getItem('refresh_token');
    }
}