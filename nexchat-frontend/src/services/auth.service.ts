import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AxiosClientService } from './axios-client.service';
import { AuthStore } from '../stores/auth.store';

export interface RegisterRequest {
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
    access_token: string;
    refresh_token?: string;
    expiresIn?: string;
    token_type?: string;
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
            
            // Store tokens
            localStorage.setItem('access_token', response.access_token);
            if (response.refresh_token) {
                localStorage.setItem('refresh_token', response.refresh_token);
            }

            // Immediately load user profile
            await this.loadUserProfile();
            
            // Navigate to inbox
            this.router.navigate(['/inbox']);
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

            // Store tokens
            localStorage.setItem('access_token', response.access_token);
            if (response.refresh_token) {
                localStorage.setItem('refresh_token', response.refresh_token);
            }

            // Load user profile
            await this.loadUserProfile();

            // Navigate to inbox
            this.router.navigate(['/inbox']);
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
             console.error("Logout API failed", e);
        } finally {
             // Clear tokens
             localStorage.removeItem('access_token');
             localStorage.removeItem('refresh_token');
     
             // Clear state
             this.authStore.setUnauthenticated();
     
             // Navigate to login
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
         try {
             const userProfile = await this.axiosClient.get<UserProfile>('/users/me');
             this.authStore.setAuthenticated(userProfile);
         } catch (e) {
             throw e;
         }
    }

    getAccessToken(): string | null {
        return localStorage.getItem('access_token');
    }

    getRefreshToken(): string | null {
        return localStorage.getItem('refresh_token');
    }
}