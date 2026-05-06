import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AuthStore } from '../../stores/auth.store';

@Injectable({
    providedIn: 'root'
})
export class AuthGuard implements CanActivate {
    private readonly authService = inject(AuthService);
    private readonly authStore = inject(AuthStore);
    private readonly router = inject(Router);

    canActivate(): boolean | UrlTree | Promise<boolean | UrlTree> {
        return this.resolve();
    }

    private async resolve(): Promise<boolean | UrlTree> {
        if (this.authStore.isAuthenticated()) {
            return true;
        }

        const token = localStorage.getItem('access_token');
        if (!token) {
            return this.router.parseUrl('/login');
        }

        try {
            await this.authService.hydrateSessionFromStoredToken();
            return true;
        } catch {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            this.authStore.setUnauthenticated();
            return this.router.parseUrl('/login');
        }
    }
}
