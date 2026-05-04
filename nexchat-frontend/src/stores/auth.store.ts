import { Injectable, signal } from '@angular/core';

export interface User {
    id: number;
    username: string;
    email: string;
    fullName?: string;
    avatarUrl?: string;
    isOnline?: boolean;
    lastSeen?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthStore {
    readonly isAuthenticated = signal(false);
    readonly currentUser = signal<User | null>(null);
    readonly isLoading = signal(false);
    readonly error = signal<string | null>(null);

    setAuthenticated(user: User): void {
        this.isAuthenticated.set(true);
        this.currentUser.set(user);
        this.error.set(null);
    }

    setUnauthenticated(): void {
        this.isAuthenticated.set(false);
        this.currentUser.set(null);
        this.error.set(null);
    }

    setLoading(loading: boolean): void {
        this.isLoading.set(loading);
    }

    setError(error: string | null): void {
        this.error.set(error);
    }
}