import {
    Component,
    ChangeDetectionStrategy,
    inject,
    signal,
    output,
    input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { ChatService } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { ToastService } from '../../../services/toast.service';
import { UserProfile } from '../../../services/auth.service';
import { AuthService } from '../../../services/auth.service';

@Component({
    selector: 'app-add-member-modal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './add-member-modal.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddMemberModalComponent {
    private readonly userService = inject(UserService);
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly toastService = inject(ToastService);
    private readonly authService = inject(AuthService);

    conversationId = input.required<number>();
    closed = output<void>();
    memberAdded = output<void>();

    searchControl = new FormControl('');

    isSearching = signal(false);
    isAdding = signal<number | null>(null);
    searchResults = signal<UserProfile[]>([]);
    hasSearched = signal(false);

    close(): void {
        this.closed.emit();
    }

    async search(): Promise<void> {
        const query = (this.searchControl.value ?? '').trim();
        if (!query) return;

        this.isSearching.set(true);
        this.hasSearched.set(true);
        try {
            const res = await this.userService.searchUsers(query);
            const currentParticipants = this.chatStore.currentConversation()?.participants ?? [];
            const participantIds = new Set(currentParticipants.map(p => p.id));
            const currentUserId = this.authService.currentUser()?.id;
            this.searchResults.set(
                res.content.filter(u => !participantIds.has(u.id) && u.id !== currentUserId)
            );
        } catch (e) {
            this.toastService.handleBackendError(e);
            this.searchResults.set([]);
        } finally {
            this.isSearching.set(false);
        }
    }

    async addUser(user: UserProfile): Promise<void> {
        this.isAdding.set(user.id);
        try {
            await this.chatService.addParticipants(this.conversationId(), [user.id]);
            const conversation = await this.chatService.getConversation(this.conversationId());
            this.chatStore.setCurrentConversation(conversation);
            this.toastService.success(`Đã thêm ${user.username} vào nhóm!`);
            this.searchResults.update(r => r.filter(u => u.id !== user.id));
            this.memberAdded.emit();
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isAdding.set(null);
        }
    }

    avatarLetter(username: string): string {
        return username.charAt(0).toUpperCase();
    }

    onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            void this.search();
        }
    }
}
