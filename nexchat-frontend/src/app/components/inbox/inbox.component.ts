import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatService, Conversation } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { AuthService, UserProfile } from '../../../services/auth.service';
import { UserService } from '../../../services/user.service';
import { FriendshipService } from '../../../services/friendship.service';
import { ToastService } from '../../../services/toast.service';
import { signal } from '@angular/core';

@Component({
    selector: 'app-inbox',
    imports: [CommonModule, FormsModule],
    templateUrl: './inbox.component.html',
    styleUrls: ['./inbox.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InboxComponent implements OnInit {
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);
    private readonly userService = inject(UserService);
    private readonly friendshipService = inject(FriendshipService);
    private readonly toastService = inject(ToastService);

    conversations = this.chatStore.conversations;
    isLoading = this.chatStore.conversationsLoading;
    hasMore = this.chatStore.hasMoreConversations;
    currentUser = this.authService.currentUser;
    showFriendSearch = signal(false);
    friendSearchQuery = '';
    friendResults = signal<UserProfile[]>([]);
    isSearchingFriends = signal(false);
    requestingFriendIds = signal<number[]>([]);
    private friendSearchDebounce: ReturnType<typeof setTimeout> | null = null;
    private activeSearchToken = 0;

    async ngOnInit(): Promise<void> {
        await this.loadConversations();
    }

    async loadConversations(): Promise<void> {
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

    async loadMoreConversations(): Promise<void> {
        await this.loadConversations();
    }

    openFriendSearch(): void {
        this.showFriendSearch.set(true);
    }

    closeFriendSearch(): void {
        this.showFriendSearch.set(false);
        this.friendSearchQuery = '';
        this.friendResults.set([]);
        if (this.friendSearchDebounce) {
            clearTimeout(this.friendSearchDebounce);
            this.friendSearchDebounce = null;
        }
    }

    async searchFriends(): Promise<void> {
        const query = this.friendSearchQuery.trim();
        if (query.length === 0) {
            this.friendResults.set([]);
            return;
        }

        const searchToken = ++this.activeSearchToken;
        this.isSearchingFriends.set(true);
        console.info('[FriendSearch] start', { query });
        try {
            const res = await this.userService.searchUsers(query);
            if (searchToken !== this.activeSearchToken) {
                return;
            }
            const currentUserId = this.currentUser()?.id;
            this.friendResults.set(res.content.filter(user => user.id !== currentUserId));
            console.info('[FriendSearch] success', { query, count: res.content.length });
        } catch (error) {
            if (searchToken !== this.activeSearchToken) {
                return;
            }
            console.error('[FriendSearch] failed', { query, error });
            this.toastService.handleBackendError(error);
        } finally {
            if (searchToken === this.activeSearchToken) {
                this.isSearchingFriends.set(false);
            }
        }
    }

    onFriendSearchInput(): void {
        if (this.friendSearchDebounce) {
            clearTimeout(this.friendSearchDebounce);
        }
        this.friendSearchDebounce = setTimeout(() => {
            this.searchFriends();
        }, 300);
    }

    async sendFriendRequest(userId: number): Promise<void> {
        if (this.requestingFriendIds().includes(userId)) return;
        this.requestingFriendIds.update(ids => [...ids, userId]);
        try {
            await this.friendshipService.sendRequest(userId);
            this.friendResults.update(users => users.filter(user => user.id !== userId));
            this.toastService.success('Friend request sent!');
        } catch (error) {
            this.toastService.handleBackendError(error);
        } finally {
            this.requestingFriendIds.update(ids => ids.filter(id => id !== userId));
        }
    }

    openConversation(conversation: Conversation): void {
        this.chatStore.setCurrentConversation(conversation);
        this.router.navigate(['/chat', conversation.id]);
    }

    getConversationDisplayName(conversation: Conversation): string {
        if (conversation.type === 'DIRECT') {
            // Find the other participant
            const otherParticipant = conversation.participants.find(p => p.id !== this.currentUser()?.id);
            return otherParticipant?.username || 'Unknown User';
        } else {
            return conversation.name;
        }
    }

    getLastMessagePreview(conversation: Conversation): string {
        if (!conversation.lastMessage) return 'No messages yet';

        const sender = conversation.lastMessage.senderId === this.currentUser()?.id ? 'You' : conversation.lastMessage.sender.username;
        return `${sender}: ${conversation.lastMessage.content}`;
    }

    formatTime(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffInHours < 168) { // 7 days
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    logout(): void {
        this.authService.logout();
    }
}