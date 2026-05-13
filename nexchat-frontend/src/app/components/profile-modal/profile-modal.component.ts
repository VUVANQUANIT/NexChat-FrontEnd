import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    output,
    OnInit,
    computed
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { AuthService } from '../../../services/auth.service';
import { AuthStore } from '../../../stores/auth.store';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-profile-modal',
    standalone: true,
    imports: [ReactiveFormsModule],
    templateUrl: './profile-modal.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileModalComponent implements OnInit {
    private readonly userService = inject(UserService);
    private readonly authService = inject(AuthService);
    private readonly authStore = inject(AuthStore);
    private readonly toastService = inject(ToastService);
    private readonly fb = inject(FormBuilder);

    closed = output<void>();

    currentUser = this.authService.currentUser;

    readonly avatarLetter = computed(() => {
        const name = this.currentUser()?.fullName || this.currentUser()?.username || '?';
        return name.charAt(0).toUpperCase();
    });

    readonly avatarPreview = signal<string | null>(null);

    isSaving = signal(false);

    form = this.fb.group({
        fullName: ['', [Validators.maxLength(100)]],
        avatarUrl: ['', [Validators.maxLength(500)]]
    });

    ngOnInit(): void {
        const user = this.currentUser();
        this.form.patchValue({
            fullName: user?.fullName ?? '',
            avatarUrl: user?.avatarUrl ?? ''
        });
        this.avatarPreview.set(user?.avatarUrl ?? null);
    }

    close(): void {
        this.closed.emit();
    }

    onAvatarUrlInput(): void {
        const url = (this.form.value.avatarUrl ?? '').trim();
        this.avatarPreview.set(url || null);
    }

    onAvatarError(): void {
        this.avatarPreview.set(null);
    }

    async save(): Promise<void> {
        if (this.form.invalid || this.isSaving()) return;

        this.isSaving.set(true);
        try {
            const updated = await this.userService.updateMe({
                fullName: (this.form.value.fullName ?? '').trim() || undefined,
                avatarUrl: (this.form.value.avatarUrl ?? '').trim() || undefined
            });
            this.authStore.setAuthenticated(updated);
            this.toastService.success('Cập nhật hồ sơ thành công!');
            this.close();
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isSaving.set(false);
        }
    }
}
