import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatService, Message } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { AuthService } from '../../../services/auth.service';
import { WebSocketService } from '../../../services/websocket.service';
import { v4 as uuidv4 } from 'uuid';
import { StompSubscription } from '@stomp/stompjs';

@Component({
    selector: 'app-chat',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponent implements OnInit, OnDestroy {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly authService = inject(AuthService);
    private readonly wsService = inject(WebSocketService);
    private readonly fb = inject(FormBuilder);

    @ViewChild('messagesContainer', { static: false }) messagesContainer!: ElementRef;

    conversationId!: number;
    messageForm!: FormGroup;
    currentUser = this.authService.currentUser;

    messages = this.chatStore.messages;
    currentConversation = this.chatStore.currentConversation;
    typingUsers = this.chatStore.typingUsers;
    isSending = this.chatStore.isSendingMessage;

    private chatSubscription: StompSubscription | null = null;
    private typingSubscription: StompSubscription | null = null;
    private presenceSubscription: StompSubscription | null = null;
    private typingTimeout: ReturnType<typeof setTimeout> | null = null;

    ngOnInit(): void {
        this.conversationId = Number(this.route.snapshot.paramMap.get('id'));
        if (!this.conversationId) {
            this.router.navigate(['/inbox']);
            return;
        }

        this.messageForm = this.fb.group({
            content: ['', [Validators.required, Validators.maxLength(1000)]]
        });

        this.initializeChat();
    }

    ngOnDestroy(): void {
        this.cleanupSubscriptions();
    }

    private async initializeChat(): Promise<void> {
        try {
            // Load conversation details
            const conversation = await this.chatService.getConversation(this.conversationId);
            this.chatStore.setCurrentConversation(conversation);

            // Load messages
            await this.loadMessages();

            // Mark as read after loading messages
            await this.markAsRead();

            // Connect WebSocket if not connected
            if (!this.wsService.getClient()?.connected) {
                this.wsService.connect(() => {
                    this.setupWebSocketSubscriptions();
                });
            } else {
                this.setupWebSocketSubscriptions();
            }
        } catch (error) {
            console.error('Failed to initialize chat:', error);
            this.router.navigate(['/inbox']);
        }
    }

    private setupWebSocketSubscriptions(): void {
        const stomp = this.wsService.getClient();
        if (!stomp) return;

        type MessageEventPayload = { event?: string; message?: Message };
        type TypingEventPayload = { isTyping?: boolean; user?: Message['sender'] };

        // Subscribe to conversation messages
        this.chatSubscription = this.wsService.subscribe<MessageEventPayload>(
            `/topic/conversations/${this.conversationId}`,
            (message) => this.handleMessageEvent(message)
        );

        // Subscribe to typing indicators
        this.typingSubscription = this.wsService.subscribe<TypingEventPayload>(
            `/topic/typing/${this.conversationId}`,
            (message) => this.handleTypingEvent(message)
        );

        // Subscribe to presence updates
        this.presenceSubscription = this.wsService.subscribe(
            '/topic/presence',
            (message) => this.handlePresenceEvent(message)
        );
    }

    private handleMessageEvent(data: { event?: string; message?: Message }): void {
        if (!data.message || !data.event) return;

        switch (data.event) {
            case 'MESSAGE_NEW':
                this.chatStore.addMessage(data.message);
                this.scrollToBottom();
                this.markAsRead(); // Mark as read if user is in the room
                break;
            case 'MESSAGE_EDITED':
                this.chatStore.updateMessage(data.message.id, data.message);
                break;
            case 'MESSAGE_DELETED':
                this.chatStore.removeMessage(data.message.id);
                break;
            case 'READ_RECEIPT':
                // Update message status if needed
                break;
        }
    }

    // Read Receipts
    private async markAsRead(): Promise<void> {
        const messages = this.messages();
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.id && lastMessage.senderId !== this.currentUser()?.id) {
                try {
                    await this.chatService.markAsRead(this.conversationId, lastMessage.id);
                } catch (error) {
                    console.error('Failed to mark as read:', error);
                }
            }
        }
    }

    // Group Management
    async addMember(): Promise<void> {
        const username = prompt('Enter username to add:');
        if (!username) return;

        try {
            const users = await this.chatService.searchUsers(username);
            const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (user) {
                await this.chatService.addParticipants(this.conversationId, [user.id]);
                // Reload conversation details to update participant list
                const conversation = await this.chatService.getConversation(this.conversationId);
                this.chatStore.setCurrentConversation(conversation);
            } else {
                alert('User not found');
            }
        } catch (error) {
            console.error('Failed to add member:', error);
        }
    }

    async kickMember(userId: number): Promise<void> {
        if (!confirm('Are you sure you want to kick this member?')) return;

        try {
            await this.chatService.removeParticipant(this.conversationId, userId);
            // Reload conversation details
            const conversation = await this.chatService.getConversation(this.conversationId);
            this.chatStore.setCurrentConversation(conversation);
        } catch (error) {
            console.error('Failed to kick member:', error);
        }
    }

    async leaveGroup(): Promise<void> {
        if (!confirm('Are you sure you want to leave this group?')) return;

        try {
            await this.chatService.removeParticipant(this.conversationId, this.currentUser()!.id);
            this.router.navigate(['/inbox']);
        } catch (error) {
            console.error('Failed to leave group:', error);
        }
    }

    private handleTypingEvent(data: { isTyping?: boolean; user?: Message['sender'] }): void {
        if (!data.user) return;
        if (data.isTyping) {
            this.chatStore.addTypingUser(data.user);
        } else {
            this.chatStore.removeTypingUser(data.user.id);
        }
    }

    private handlePresenceEvent(data: unknown): void {
        // Handle presence updates if needed
        console.log('Presence update:', data);
    }

    private cleanupSubscriptions(): void {
        this.chatSubscription?.unsubscribe();
        this.typingSubscription?.unsubscribe();
        this.presenceSubscription?.unsubscribe();
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    async loadMessages(): Promise<void> {
        this.chatStore.setMessagesLoading(true);
        try {
            const response = await this.chatService.getMessages(this.conversationId, undefined, 30);
            this.chatStore.setMessages(response.items, response.nextCursor, response.hasMore);
            this.scrollToBottom();
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            this.chatStore.setMessagesLoading(false);
        }
    }

    async sendMessage(): Promise<void> {
        if (this.messageForm.invalid || this.isSending()) return;

        const content = this.messageForm.value.content.trim();
        const tempId = uuidv4();

        // Optimistic UI: Add temporary message
        const tempMessage: Message = {
            id: 0, // Temporary ID
            content,
            type: 'TEXT',
            senderId: this.currentUser()!.id,
            sender: this.currentUser()!,
            createdAt: new Date().toISOString(),
            status: 'SENDING',
            clientMessageId: tempId
        };

        this.chatStore.addMessage(tempMessage);
        this.messageForm.reset();
        this.scrollToBottom();

        try {
            const sentMessage = await this.chatService.sendMessage(this.conversationId, content, 'TEXT', tempId);
            // Update with real message
            this.chatStore.updateMessage(tempId, sentMessage);
        } catch (error) {
            // Mark as failed
            this.chatStore.updateMessage(tempId, { ...tempMessage, status: 'FAILED' });
            console.error('Failed to send message:', error);
        }
    }

    onTyping(): void {
        const stomp = this.wsService.getClient();
        if (!stomp) return;

        // Send typing start
        this.wsService.publish('/app/typing', {
            conversationId: this.conversationId,
            isTyping: true
        });

        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

        // Set timeout to stop typing
        this.typingTimeout = setTimeout(() => {
            this.wsService.publish('/app/typing', {
                conversationId: this.conversationId,
                isTyping: false
            });
        }, 2000);
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            if (this.messagesContainer) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        });
    }

    isMessageFromCurrentUser(message: Message): boolean {
        return message.senderId === this.currentUser()?.id;
    }

    formatMessageTime(dateString: string): string {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    goBack(): void {
        this.router.navigate(['/inbox']);
    }
}