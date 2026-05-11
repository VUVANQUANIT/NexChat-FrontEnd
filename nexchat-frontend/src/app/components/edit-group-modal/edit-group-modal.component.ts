import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    output,
    input,
    OnInit,
    computed
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ChatService } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-edit-group-modal',
    standalone: true,
    imports: [ReactiveFormsModule],
    templateUrl: './edit-group-modal.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditGroupModalComponent implements OnInit {
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly toastService = inject(ToastService);
    private readonly fb = inject(FormBuilder);

    conversationId = input.required<number>();
    closed = output<void>();

    readonly conversation = this.chatStore.currentConversation;

    readonly avatarLetter = computed(() => {
        const name = this.conversation()?.name || '?';
        return name.charAt(0).toUpperCase();
    });

    avatarPreview = signal<string | null>(null);
    isSaving = signal(false);

    form = this.fb.group({
        title: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(100)]],
        avatarUrl: ['', [Validators.maxLength(500)]]
    });

    ngOnInit(): void {
        const conv = this.conversation();
        this.form.patchValue({
            title: conv?.title || conv?.name || '',
            avatarUrl: conv?.avatarUrl || ''
        });
        this.avatarPreview.set(conv?.avatarUrl || null);
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
            const updated = await this.chatService.updateConversation(this.conversationId(), {
                title: (this.form.value.title ?? '').trim(),
                avatarUrl: (this.form.value.avatarUrl ?? '').trim() || undefined
            });
            this.chatStore.setCurrentConversation(updated);
            this.chatStore.updateConversationInList(updated);
            this.toastService.success('Đã cập nhật thông tin nhóm!');
            this.close();
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isSaving.set(false);
        }
    }
}
