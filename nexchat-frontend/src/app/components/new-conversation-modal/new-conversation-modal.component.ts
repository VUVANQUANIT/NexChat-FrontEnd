import {
    Component,
    OnInit,
    ChangeDetectionStrategy,
    inject,
    signal,
    output,
    computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FriendshipService, FriendSummary } from '../../../services/friendship.service';
import { ChatService } from '../../../services/chat.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-new-conversation-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './new-conversation-modal.component.html',
    styleUrls: ['./new-conversation-modal.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NewConversationModalComponent implements OnInit {
    private readonly friendshipService = inject(FriendshipService);
    private readonly chatService = inject(ChatService);
    private readonly authService = inject(AuthService);
    private readonly toastService = inject(ToastService);

    closed = output<void>();
    /** New or existing conversation id to open. */
    started = output<number>();

    friends = signal<FriendSummary[]>([]);
    isLoading = signal(true);
    selectedIds = signal<Set<number>>(new Set());
    groupTitle = '';
    isSubmitting = signal(false);

    readonly selectedCount = computed(() => this.selectedIds().size);
    readonly isGroup = computed(() => this.selectedCount() > 1);

    async ngOnInit(): Promise<void> {
        const uid = this.authService.currentUser()?.id;
        if (uid == null) {
            this.isLoading.set(false);
            return;
        }
        try {
            const list = await this.friendshipService.listAcceptedFriends(uid);
            this.friends.set(list);
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isLoading.set(false);
        }
    }

    close(): void {
        this.closed.emit();
    }

    toggle(friendId: number): void {
        this.selectedIds.update(s => {
            const n = new Set(s);
            if (n.has(friendId)) n.delete(friendId);
            else n.add(friendId);
            return n;
        });
    }

    isSelected(friendId: number): boolean {
        return this.selectedIds().has(friendId);
    }

    async start(): Promise<void> {
        const ids = [...this.selectedIds()];
        if (ids.length === 0) {
            this.toastService.error('Hãy chọn ít nhất một người bạn.');
            return;
        }
        this.isSubmitting.set(true);
        try {
            if (ids.length === 1) {
                const conv = await this.chatService.createDirectConversation(ids[0]);
                this.started.emit(conv.id);
            } else {
                const title = this.groupTitle.trim();
                if (!title) {
                    this.toastService.error('Nhập tên nhóm khi chọn nhiều người.');
                    return;
                }
                const conv = await this.chatService.createGroupConversation(title, ids);
                this.started.emit(conv.id);
            }
            this.close();
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isSubmitting.set(false);
        }
    }
}
