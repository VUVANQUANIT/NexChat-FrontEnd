import { Injectable, signal } from '@angular/core';
import { ApiFieldError, isApiErrorResponse } from '../app/api/api-error.dto';

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
}

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    readonly toasts = signal<Toast[]>([]);

    show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 3000): void {
        const id = Math.random().toString(36).substring(2, 9);
        const toast: Toast = { id, message, type, duration };

        this.toasts.update(current => [...current, toast]);

        if (duration > 0) {
            setTimeout(() => {
                this.remove(id);
            }, duration);
        }
    }

    success(message: string, duration?: number): void {
        this.show(message, 'success', duration);
    }

    error(message: string, duration?: number): void {
        this.show(message, 'error', duration);
    }

    remove(id: string): void {
        this.toasts.update(current => current.filter(t => t.id !== id));
    }

    handleBackendError(error: unknown): void {
        if (!isApiErrorResponse(error)) {
            const msg =
                error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';
            this.error(msg);
            return;
        }

        if (error.code === 'VALIDATION_FAILED' && Array.isArray(error.errors)) {
            error.errors.forEach((fieldErr: ApiFieldError) =>
                this.error(`${fieldErr.field}: ${fieldErr.message}`)
            );
            return;
        }

        if (error.code === 'CANNOT_INVITE_BLOCK' || error.code === 'CANNOT_INVATE_BLOCK') {
            this.error('Cannot invite this user due to block relationship.');
            return;
        }

        if (error.code === 'FORBIDDEN') {
            this.error('You do not have permission to perform this action.');
            return;
        }

        if (error.code === 'UNAUTHORIZED' || error.code === 'INVALID_CREDENTIALS') {
            this.error(error.message || 'Authentication failed.');
            return;
        }

        if (error.code === 'RESOURCE_NOT_FOUND') {
            this.error(error.message || 'Resource not found.');
            return;
        }

        this.error(error.message || 'An unexpected error occurred. Please try again.');
    }
}