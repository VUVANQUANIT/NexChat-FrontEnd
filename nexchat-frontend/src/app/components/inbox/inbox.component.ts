import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChatService, Conversation } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { AuthService } from '../../../services/auth.service';

@Component({
    selector: 'app-inbox',
    imports: [CommonModule],
    templateUrl: './inbox.component.html',
    styleUrls: ['./inbox.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InboxComponent implements OnInit {
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);

    conversations = this.chatStore.conversations;
    isLoading = this.chatStore.conversationsLoading;
    hasMore = this.chatStore.hasMoreConversations;
    currentUser = this.authService.currentUser;

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