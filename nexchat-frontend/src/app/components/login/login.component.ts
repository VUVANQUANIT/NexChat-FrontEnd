import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, LoginRequest } from '../../../services/auth.service';
import { AuthStore } from '../../../stores/auth.store';

@Component({
    selector: 'app-login',
    imports: [CommonModule, ReactiveFormsModule, RouterLink],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
    private readonly fb = inject(FormBuilder);
    private readonly authService = inject(AuthService);
    private readonly authStore = inject(AuthStore);
    private readonly router = inject(Router);

    loginForm: FormGroup;
    isLoading = this.authStore.isLoading;
    error = this.authStore.error;

    showPassword = signal(false);

    constructor() {
        this.loginForm = this.fb.group({
            username: ['', [Validators.required, Validators.minLength(3)]],
            password: ['', [Validators.required, Validators.minLength(6)]]
        });

        // Redirect if already authenticated
        if (this.authService.isAuthenticated()) {
            this.router.navigate(['/inbox']);
        }
    }

    togglePassword(): void {
        this.showPassword.update(v => !v);
    }

    async onSubmit(): Promise<void> {
        if (this.loginForm.invalid) {
            this.markFormGroupTouched();
            return;
        }

        const credentials: LoginRequest = this.loginForm.value;

        try {
            await this.authService.login(credentials);
            await this.router.navigateByUrl('/inbox', { replaceUrl: true });
        } catch {
            // Error handled in AuthService → authStore.error
        }
    }

    private markFormGroupTouched(): void {
        Object.keys(this.loginForm.controls).forEach(key => {
            const control = this.loginForm.get(key);
            control?.markAsTouched();
        });
    }

    getFieldError(fieldName: string): string | null {
        const control = this.loginForm.get(fieldName);
        if (control?.errors && control.touched) {
            if (control.errors['required']) {
                return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`;
            }
            if (control.errors['minlength']) {
                return `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} must be at least ${control.errors['minlength'].requiredLength} characters`;
            }
        }
        return null;
    }
}