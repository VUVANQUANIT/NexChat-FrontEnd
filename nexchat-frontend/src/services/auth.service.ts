import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AxiosClientService } from './axios-client.service';
import { AuthStore } from '../stores/auth.store';

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    access_token: string;
    refresh_token?: string;
    user: {
        id: number;
        username: string;
        email: string;
        isOnline?: boolean;
    };
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

    async login(credentials: LoginRequest): Promise<void> {
        this.authStore.setLoading(true);
        this.authStore.setError(null);

        try {
            const response = await this.axiosClient.post<LoginResponse>('/auth/login', credentials);

            // Store tokens
            localStorage.setItem('access_token', response.access_token);
            if (response.refresh_token) {
                localStorage.setItem('refresh_token', response.refresh_token);
            }

            // Update state
            this.authStore.setAuthenticated(response.user);

            // Navigate to inbox
            this.router.navigate(['/inbox']);
        } catch (error: any) {
            this.authStore.setError(error.message || 'Login failed');
            throw error;
        } finally {
            this.authStore.setLoading(false);
        }
    }

    logout(): void {
        // Clear tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        // Clear state
        this.authStore.setUnauthenticated();

        // Navigate to login
        this.router.navigate(['/login']);
    }

    private checkAuthStatus(): void {
        const token = localStorage.getItem('access_token');
        if (token) {
            // TODO: Validate token with backend or decode JWT
            // For now, assume valid if exists
            // TODO: Load user info if needed
            this.authStore.isAuthenticated.set(true);
        }
    }

    getAccessToken(): string | null {
        return localStorage.getItem('access_token');
    }

    getRefreshToken(): string | null {
        return localStorage.getItem('refresh_token');
    }
}