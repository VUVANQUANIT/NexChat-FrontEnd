import {
    Component,
    inject,
    OnInit,
    OnDestroy,
    OnChanges,
    SimpleChanges,
    ChangeDetectionStrategy,
    ElementRef,
    ViewChild,
    Input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatService, Message } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { AuthService } from '../../../services/auth.service';
import { UserService } from '../../../services/user.service';
import { WebSocketService } from '../../../services/websocket.service';
import {
    mapWsMessageEditedToPartial,
    mapWsMessageNewToMessage,
    parseWsReadReceipt,
    parseWsStompEnvelope,
    parseWsTypingPayload
} from '../../api/ws-chat.mapper';
import { ENABLE_API_LOGGING } from '../../config/api.config';
import { v4 as uuidv4 } from 'uuid';
import { StompSubscription } from '@stomp/stompjs';

/**
 * Embedded chat UI for the inbox split layout. One instance per open conversation.
 */
@Component({
    selector: 'app-chat-panel',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './chat-panel.component.html',
    styleUrls: ['./chat-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPanelComponent implements OnInit, OnDestroy, OnChanges {
    private readonly router = inject(Router);
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly authService = inject(AuthService);
    private readonly userService = inject(UserService);
    private readonly wsService = inject(WebSocketService);
    private readonly fb = inject(FormBuilder);

    @ViewChild('messagesContainer', { static: false }) messagesContainer!: ElementRef;

    @Input({ required: true }) conversationId!: number;

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
        this.messageForm = this.fb.group({
            content: ['', [Validators.required, Validators.maxLength(1000)]]
        });
        void this.bootstrap();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['conversationId'] && !changes['conversationId'].firstChange) {
            this.cleanupSubscriptions();
            if (this.typingTimeout) {
                clearTimeout(this.typingTimeout);
                this.typingTimeout = null;
            }
            void this.bootstrap();
        }
    }

    ngOnDestroy(): void {
        this.cleanupSubscriptions();
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
    }

    private async bootstrap(): Promise<void> {
        this.messageForm?.reset();
        try {
            const conversation = await this.chatService.getConversation(this.conversationId);
            this.chatStore.setCurrentConversation(conversation);
            await this.loadMessages();
            await this.markAsRead();

            if (!this.wsService.getClient()?.connected) {
                this.wsService.connect(
                    () => this.setupWebSocketSubscriptions(),
                    () => void this.loadMessages()
                );
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

        this.unsubscribeWsChannels();

        this.chatSubscription = this.wsService.subscribe<unknown>(
            `/topic/conversations/${this.conversationId}`,
            (payload) => this.handleConversationWsPayload(payload)
        );

        this.typingSubscription = this.wsService.subscribe<unknown>(
            `/topic/typing/${this.conversationId}`,
            (payload) => this.handleTypingEvent(payload)
        );

        this.presenceSubscription = this.wsService.subscribe<unknown>('/topic/presence', (payload) =>
            this.handlePresenceEvent(payload)
        );
    }

    private unsubscribeWsChannels(): void {
        this.chatSubscription?.unsubscribe();
        this.chatSubscription = null;
        this.typingSubscription?.unsubscribe();
        this.typingSubscription = null;
        this.presenceSubscription?.unsubscribe();
        this.presenceSubscription = null;
    }

    private handleConversationWsPayload(raw: unknown): void {
        const env = parseWsStompEnvelope(raw);
        if (!env) return;

        const { event, data: d } = env;
        const convId = d['conversationId'];
        if (typeof convId === 'number' && convId !== this.conversationId) return;

        switch (event) {
            case 'MESSAGE_NEW': {
                const msg = mapWsMessageNewToMessage(d);
                if (!msg) return;
                const existingByClient = msg.clientMessageId
                    ? this.messages().find(m => m.clientMessageId === msg.clientMessageId)
                    : undefined;
                if (existingByClient) {
                    this.chatStore.updateMessage(msg.clientMessageId!, msg);
                } else if (!this.messages().some(m => m.id === msg.id && msg.id > 0)) {
                    this.chatStore.addMessage(msg);
                }
                this.scrollToBottom();
                void this.markAsRead();
                break;
            }
            case 'MESSAGE_EDITED': {
                const partialFull = mapWsMessageEditedToPartial(d);
                if (!partialFull?.id) return;
                const { id, ...patch } = partialFull;
                this.chatStore.mergeMessage(id, patch);
                break;
            }
            case 'MESSAGE_DELETED': {
                const id = d['id'];
                if (typeof id === 'number') this.chatStore.removeMessage(id);
                break;
            }
            case 'READ_RECEIPT': {
                const r = parseWsReadReceipt(d);
                if (!r || r.conversationId !== this.conversationId) break;
                const selfId = this.currentUser()?.id;
                if (selfId != null && r.userId === selfId) break;
                this.chatStore.recordPeerReadReceipt(r.userId, r.lastReadMessageId);
                break;
            }
            default:
                break;
        }
    }

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

    async addMember(): Promise<void> {
        const username = prompt('Enter username to add:');
        if (!username) return;

        try {
            const res = await this.userService.searchUsers(username);
            const user = res.content.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (user) {
                await this.chatService.addParticipants(this.conversationId, [user.id]);
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

    private handleTypingEvent(raw: unknown): void {
        const payload = parseWsTypingPayload(raw);
        if (!payload) return;

        const isTyping = payload['isTyping'] === true;
        let user: Message['sender'] | undefined = payload['user'] as Message['sender'] | undefined;
        const userId = payload['userId'];
        const username = payload['username'];
        if (!user && typeof userId === 'number') {
            user = {
                id: userId,
                username: typeof username === 'string' ? username : 'user',
                email: ''
            };
        }
        if (!user) return;

        if (isTyping) {
            this.chatStore.addTypingUser(user);
        } else {
            this.chatStore.removeTypingUser(user.id);
        }
    }

    private handlePresenceEvent(data: unknown): void {
        if (ENABLE_API_LOGGING) {
            console.info('Presence update:', data);
        }
    }

    private cleanupSubscriptions(): void {
        this.unsubscribeWsChannels();
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

        const tempMessage: Message = {
            id: 0,
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

        this.chatStore.setSendingMessage(true);
        try {
            const sentMessage = await this.chatService.sendMessage(this.conversationId, content, 'TEXT', tempId);
            this.chatStore.updateMessage(tempId, sentMessage);
        } catch (error) {
            this.chatStore.updateMessage(tempId, { ...tempMessage, status: 'FAILED' });
            console.error('Failed to send message:', error);
        } finally {
            this.chatStore.setSendingMessage(false);
        }
    }

    onTyping(): void {
        if (!this.wsService.getClient()?.connected) return;

        this.wsService.publish('/app/typing', {
            conversationId: this.conversationId,
            isTyping: true
        });

        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }

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

    headerSubtitle(): string {
        const conv = this.currentConversation();
        if (!conv) return '';
        if (conv.type === 'GROUP') {
            return `${conv.participants?.length ?? 0} members`;
        }
        const other = conv.participants.find(p => p.id !== this.currentUser()?.id);
        if (other?.isOnline === true) return 'Online';
        if (other?.isOnline === false) return 'Offline';
        return 'Direct message';
    }

    headerAvatarLetter(): string {
        const name = this.currentConversation()?.name || '?';
        return name.charAt(0).toUpperCase();
    }

    closePanel(): void {
        this.router.navigate(['/inbox']);
    }
}
