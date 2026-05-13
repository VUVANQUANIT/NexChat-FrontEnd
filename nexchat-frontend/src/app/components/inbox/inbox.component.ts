import {
    Component,
    inject,
    OnInit,
    ChangeDetectionStrategy,
    signal,
    computed
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { ChatService, Conversation } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { AuthService } from '../../../services/auth.service';
import { FriendshipService } from '../../../services/friendship.service';
import { ChatPanelComponent } from '../chat-panel/chat-panel.component';
import { FriendsModalComponent } from '../friends-modal/friends-modal.component';
import { NewConversationModalComponent } from '../new-conversation-modal/new-conversation-modal.component';
import { ProfileModalComponent } from '../profile-modal/profile-modal.component';
import { WebSocketService } from '../../../services/websocket.service';

@Component({
    selector: 'app-inbox',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ChatPanelComponent,
        FriendsModalComponent,
        NewConversationModalComponent,
        ProfileModalComponent
    ],
    templateUrl: './inbox.component.html',
    styleUrls: ['./inbox.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InboxComponent implements OnInit {
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly friendshipService = inject(FriendshipService);
    private readonly wsService = inject(WebSocketService);

    conversations = this.chatStore.conversations;
    isLoading = this.chatStore.conversationsLoading;
    hasMore = this.chatStore.hasMoreConversations;
    currentUser = this.authService.currentUser;

    /** Synced with route `/inbox/:conversationId` */
    readonly activeConversationId = toSignal(
        this.route.paramMap.pipe(
            map(p => {
                const raw = p.get('conversationId');
                const n = raw ? Number(raw) : NaN;
                return Number.isFinite(n) && n > 0 ? n : null;
            })
        ),
        { initialValue: null as number | null }
    );

    inboxSearch = signal('');
    readonly filteredConversations = computed(() => {
        const q = this.inboxSearch().trim().toLowerCase();
        const list = this.conversations();
        if (!q) return list;
        return list.filter(c => {
            const name = this.displayName(c).toLowerCase();
            const preview = (c.lastMessage?.content ?? '').toLowerCase();
            return name.includes(q) || preview.includes(q);
        });
    });

    showFriendsModal = signal(false);
    showNewChatModal = signal(false);
    showProfileModal = signal(false);
    pendingInviteCount = signal(0);

    async ngOnInit(): Promise<void> {
        await this.loadInitialConversations();
        await this.refreshPendingBadge();
    }

    private async loadInitialConversations(): Promise<void> {
        this.chatStore.setConversationsLoading(true);
        try {
            const response = await this.chatService.getConversations(undefined, 20);
            this.chatStore.setConversations(response.items, response.nextCursor, response.hasMore);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            this.chatStore.setConversationsLoading(false);
        }
    }

    async loadMoreConversations(): Promise<void> {
        if (!this.hasMore()) return;
        this.chatStore.setConversationsLoading(true);
        try {
            const response = await this.chatService.getConversations(
                this.chatStore.conversationsCursor(),
                20
            );
            if (this.conversations().length === 0) {
                this.chatStore.setConversations(response.items, response.nextCursor, response.hasMore);
            } else {
                this.chatStore.addConversations(response.items, response.nextCursor, response.hasMore);
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            this.chatStore.setConversationsLoading(false);
        }
    }

    /** After creating a conversation — refresh list and open thread. */
    async reloadFeedAndNavigate(conversationId: number): Promise<void> {
        await this.loadInitialConversations();
        await this.router.navigate(['/inbox', conversationId]);
    }

    openFriendsModal(): void {
        this.showFriendsModal.set(true);
    }

    closeFriendsModal(): void {
        this.showFriendsModal.set(false);
        void this.refreshPendingBadge();
    }

    openNewChatModal(): void {
        this.showNewChatModal.set(true);
    }

    closeNewChatModal(): void {
        this.showNewChatModal.set(false);
    }

    openProfileModal(): void {
        this.showProfileModal.set(true);
    }

    closeProfileModal(): void {
        this.showProfileModal.set(false);
    }

    async refreshPendingBadge(): Promise<void> {
        try {
            const n = await this.friendshipService.countPendingReceived();
            this.pendingInviteCount.set(n);
        } catch {
            this.pendingInviteCount.set(0);
        }
    }

    async onNewConversationStarted(id: number): Promise<void> {
        this.closeNewChatModal();
        await this.reloadFeedAndNavigate(id);
    }

    async onFriendModalOpenChat(id: number): Promise<void> {
        await this.reloadFeedAndNavigate(id);
    }

    selectConversation(conversation: Conversation): void {
        void this.router.navigate(['/inbox', conversation.id]);
    }

    isConversationActive(c: Conversation): boolean {
        return this.activeConversationId() === c.id;
    }

    displayName(conversation: Conversation): string {
        if (conversation.type === 'PRIVATE') {
            const other = conversation.participants.find(p => p.id !== this.currentUser()?.id);
            return other?.username || conversation.name || 'Unknown';
        }
        return conversation.name;
    }

    getLastMessagePreview(conversation: Conversation): string {
        if (!conversation.lastMessage) return 'Chưa có tin nhắn';
        const sender =
            conversation.lastMessage.senderId === this.currentUser()?.id
                ? 'Bạn'
                : conversation.lastMessage.sender.username;
        return `${sender}: ${conversation.lastMessage.content}`;
    }

    formatTime(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (diffInHours < 168) {
            return date.toLocaleDateString([], { weekday: 'short' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    logout(): void {
        this.wsService.disconnect();
        void this.authService.logout();
    }

    onInboxSearchInput(ev: Event): void {
        const v = (ev.target as HTMLInputElement).value;
        this.inboxSearch.set(v);
    }
}
