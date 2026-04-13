import { Injectable, signal } from '@angular/core';

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

    handleBackendError(error: any): void {
        if (error.code === 'VALIDATION_FAILED' && error.errors) {
            error.errors.forEach((e: any) => this.error(`${e.field}: ${e.message}`));
        } else if (error.code === 'CANNOT_INVATE_BLOCK') {
            this.error('Cannot invite this user due to block relationship.');
        } else if (error.code === 'FORBIDDEN') {
            this.error('You do not have permission to perform this action.');
        } else {
            this.error(error.message || 'An unexpected error occurred. Please try again.');
        }
    }
}