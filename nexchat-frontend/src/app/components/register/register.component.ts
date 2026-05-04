import { Component, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, RegisterRequest } from '../../../services/auth.service';
import { AuthStore } from '../../../stores/auth.store';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink],
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent {
    private readonly fb = inject(FormBuilder);
    private readonly authService = inject(AuthService);
    private readonly authStore = inject(AuthStore);
    private readonly router = inject(Router);

    registerForm: FormGroup;
    isLoading = this.authStore.isLoading;
    error = this.authStore.error;

    showPassword = signal(false);
    showConfirmPassword = signal(false);

    constructor() {
        this.registerForm = this.fb.group({
            fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
            username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50), Validators.pattern('^[a-zA-Z0-9_.-]+$')]],
            email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
            password: ['', [
                Validators.required, 
                Validators.minLength(8), 
                Validators.maxLength(100),
                // Require at least one uppercase, lowercase, number, and special character
                Validators.pattern('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$')
            ]],
            confirmPassword: ['', [Validators.required]]
        }, { validators: this.passwordMatchValidator });

        if (this.authService.isAuthenticated()) {
            this.router.navigate(['/inbox']);
        }
    }

    togglePassword(): void {
        this.showPassword.update(v => !v);
    }

    toggleConfirmPassword(): void {
        this.showConfirmPassword.update(v => !v);
    }

    private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
        const password = group.get('password')?.value;
        const confirmPassword = group.get('confirmPassword')?.value;
        return password === confirmPassword ? null : { mismatch: true };
    }

    async onSubmit(): Promise<void> {
        if (this.registerForm.invalid) {
            this.markFormGroupTouched(this.registerForm);
            return;
        }

        const formValue = this.registerForm.value;
        const data: RegisterRequest = {
            fullName: formValue.fullName,
            username: formValue.username,
            email: formValue.email,
            password: formValue.password,
            confirmPassword: formValue.confirmPassword
        };

        try {
            await this.authService.register(data);
            // Navigation handled by auth service
        } catch (error) {
            // Error handled by store
        }
    }

    private markFormGroupTouched(formGroup: FormGroup): void {
        Object.values(formGroup.controls).forEach(control => {
            control.markAsTouched();
            if (control instanceof FormGroup) {
                this.markFormGroupTouched(control as FormGroup);
            } else if (control instanceof FormArray) {
                control.controls.forEach(nestedControl => nestedControl.markAsTouched());
            }
        });
    }

    getFieldError(fieldName: string): string | null {
        const control = this.registerForm.get(fieldName);
        
        // Special case for password mismatch on confirmPassword
        if (fieldName === 'confirmPassword' && this.registerForm.errors?.['mismatch'] && control?.touched) {
             return 'Passwords do not match';
        }

        if (control?.errors && control.touched) {
            if (control.errors['required']) return 'This field is required';
            if (control.errors['minlength']) return `Minimum ${control.errors['minlength'].requiredLength} characters`;
            if (control.errors['maxlength']) return `Maximum ${control.errors['maxlength'].requiredLength} characters`;
            if (control.errors['email']) return 'Invalid email address';
            if (control.errors['pattern']) {
                if (fieldName === 'username') return 'Only letters, numbers, dot, dash, underscore';
                if (fieldName === 'password') return 'Must contain uppercase, lowercase, number, and special character';
            }
        }
        return null;
    }
}
