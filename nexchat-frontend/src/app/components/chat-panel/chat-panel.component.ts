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
    Input,
    signal,
    computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatService, Message } from '../../../services/chat.service';
import { ChatStore } from '../../../stores/chat.store';
import { AuthService } from '../../../services/auth.service';
import { WebSocketService } from '../../../services/websocket.service';
import { ToastService } from '../../../services/toast.service';
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
import { AddMemberModalComponent } from '../add-member-modal/add-member-modal.component';
import { ConfirmModalComponent } from '../confirm-modal/confirm-modal.component';
import { EditGroupModalComponent } from '../edit-group-modal/edit-group-modal.component';

@Component({
    selector: 'app-chat-panel',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, AddMemberModalComponent, ConfirmModalComponent, EditGroupModalComponent],
    templateUrl: './chat-panel.component.html',
    styleUrls: ['./chat-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatPanelComponent implements OnInit, OnDestroy, OnChanges {
    private readonly router = inject(Router);
    private readonly chatService = inject(ChatService);
    private readonly chatStore = inject(ChatStore);
    private readonly authService = inject(AuthService);
    private readonly wsService = inject(WebSocketService);
    private readonly toastService = inject(ToastService);
    private readonly fb = inject(FormBuilder);

    @ViewChild('messagesContainer', { static: false }) messagesContainer!: ElementRef;
    @ViewChild('editTextarea') editTextarea!: ElementRef<HTMLTextAreaElement>;

    @Input({ required: true }) conversationId!: number;

    messageForm!: FormGroup;
    currentUser = this.authService.currentUser;

    messages = this.chatStore.messages;
    currentConversation = this.chatStore.currentConversation;
    typingUsers = this.chatStore.typingUsers;
    isSending = this.chatStore.isSendingMessage;

    // Group modals
    showAddMemberModal = signal(false);
    showEditGroupModal = signal(false);

    // Kick / leave confirm
    showKickConfirm = signal(false);
    showLeaveConfirm = signal(false);
    kickTargetId = signal<number | null>(null);
    kickTargetName = signal('');
    isActionLoading = signal(false);

    // Message edit / delete
    editingMessageId = signal<number | null>(null);
    editContent = signal('');
    isSubmittingEdit = signal(false);
    showDeleteConfirm = signal(false);
    deleteTargetId = signal<number | null>(null);
    isDeletingMessage = signal(false);

    // Older messages pagination
    isLoadingOlderMessages = signal(false);
    hasMoreMessages = this.chatStore.hasMoreMessages;

    /** Whether any peer has read up to (or past) the given message id. */
    readonly isReadByPeer = computed(() => {
        const receipts = this.chatStore.peerReadReceipts();
        return (messageId: number): boolean => {
            if (!messageId || messageId <= 0) return false;
            for (const lastRead of receipts.values()) {
                if (lastRead >= messageId) return true;
            }
            return false;
        };
    });

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
            this.cancelEdit();
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

    // ── Group modals ──────────────────────────────────────────────────────────

    openAddMemberModal(): void { this.showAddMemberModal.set(true); }
    closeAddMemberModal(): void { this.showAddMemberModal.set(false); }

    openEditGroupModal(): void { this.showEditGroupModal.set(true); }
    closeEditGroupModal(): void { this.showEditGroupModal.set(false); }

    openKickConfirm(userId: number, username: string): void {
        this.kickTargetId.set(userId);
        this.kickTargetName.set(username);
        this.showKickConfirm.set(true);
    }

    closeKickConfirm(): void {
        this.showKickConfirm.set(false);
        this.kickTargetId.set(null);
        this.kickTargetName.set('');
    }

    async confirmKick(): Promise<void> {
        const userId = this.kickTargetId();
        if (userId == null) return;
        this.isActionLoading.set(true);
        try {
            await this.chatService.removeParticipant(this.conversationId, userId);
            const conversation = await this.chatService.getConversation(this.conversationId);
            this.chatStore.setCurrentConversation(conversation);
            this.toastService.success(`Đã xóa ${this.kickTargetName()} khỏi nhóm.`);
            this.closeKickConfirm();
        } catch (error) {
            this.toastService.handleBackendError(error);
        } finally {
            this.isActionLoading.set(false);
        }
    }

    openLeaveConfirm(): void { this.showLeaveConfirm.set(true); }
    closeLeaveConfirm(): void { this.showLeaveConfirm.set(false); }

    async confirmLeave(): Promise<void> {
        this.isActionLoading.set(true);
        try {
            await this.chatService.removeParticipant(this.conversationId, this.currentUser()!.id);
            this.chatStore.removeConversation(this.conversationId);
            await this.router.navigate(['/inbox']);
        } catch (error) {
            this.toastService.handleBackendError(error);
            this.closeLeaveConfirm();
        } finally {
            this.isActionLoading.set(false);
        }
    }

    // ── Edit message ──────────────────────────────────────────────────────────

    startEdit(message: Message): void {
        this.editingMessageId.set(message.id);
        this.editContent.set(message.content);
        setTimeout(() => this.editTextarea?.nativeElement?.focus());
    }

    cancelEdit(): void {
        this.editingMessageId.set(null);
        this.editContent.set('');
    }

    async submitEdit(): Promise<void> {
        const id = this.editingMessageId();
        const content = this.editContent().trim();
        if (!id || !content || this.isSubmittingEdit()) return;

        this.isSubmittingEdit.set(true);
        try {
            await this.chatService.editMessage(this.conversationId, id, content);
            this.chatStore.mergeMessage(id, { content, isEdited: true });
            this.cancelEdit();
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isSubmittingEdit.set(false);
        }
    }

    onEditKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void this.submitEdit();
        }
        if (event.key === 'Escape') {
            this.cancelEdit();
        }
    }

    // ── Delete message ────────────────────────────────────────────────────────

    openDeleteConfirm(messageId: number): void {
        this.deleteTargetId.set(messageId);
        this.showDeleteConfirm.set(true);
    }

    closeDeleteConfirm(): void {
        this.showDeleteConfirm.set(false);
        this.deleteTargetId.set(null);
    }

    async confirmDeleteMessage(): Promise<void> {
        const id = this.deleteTargetId();
        if (!id) return;
        this.isDeletingMessage.set(true);
        try {
            await this.chatService.deleteMessage(this.conversationId, id);
            this.chatStore.removeMessage(id);
            this.closeDeleteConfirm();
        } catch (e) {
            this.toastService.handleBackendError(e);
        } finally {
            this.isDeletingMessage.set(false);
        }
    }

    // ── Messages ──────────────────────────────────────────────────────────────

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

    async loadOlderMessages(): Promise<void> {
        if (this.isLoadingOlderMessages() || !this.hasMoreMessages()) return;

        const current = this.messages();
        const oldest = current.find(m => m.id > 0);
        if (!oldest) return;

        this.isLoadingOlderMessages.set(true);

        // Save scroll height before prepending so the viewport doesn't jump
        const container = this.messagesContainer?.nativeElement as HTMLElement | undefined;
        const scrollHeightBefore = container?.scrollHeight ?? 0;

        try {
            const response = await this.chatService.getMessages(this.conversationId, oldest.id, 30);
            // Prepend fetched items in front of the existing list
            this.chatStore.setMessages(
                [...response.items, ...current],
                response.nextCursor,
                response.hasMore
            );
            // Restore scroll position after Angular re-renders the list
            setTimeout(() => {
                if (container) {
                    container.scrollTop = container.scrollHeight - scrollHeightBefore;
                }
            });
        } catch (error) {
            console.error('Failed to load older messages:', error);
        } finally {
            this.isLoadingOlderMessages.set(false);
        }
    }

    onMessagesScroll(event: Event): void {
        const el = event.target as HTMLElement;
        if (el.scrollTop < 80) {
            void this.loadOlderMessages();
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
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.wsService.publish('/app/typing', {
                conversationId: this.conversationId,
                isTyping: false
            });
        }, 2000);
    }

    private handleTypingEvent(raw: unknown): void {
        const payload = parseWsTypingPayload(raw);
        if (!payload) return;
        const isTyping = payload['isTyping'] === true;
        let user: Message['sender'] | undefined = payload['user'] as Message['sender'] | undefined;
        const userId = payload['userId'];
        const username = payload['username'];
        if (!user && typeof userId === 'number') {
            user = { id: userId, username: typeof username === 'string' ? username : 'user', email: '' };
        }
        if (!user) return;
        if (isTyping) {
            this.chatStore.addTypingUser(user);
        } else {
            this.chatStore.removeTypingUser(user.id);
        }
    }

    private handlePresenceEvent(data: unknown): void {
        if (ENABLE_API_LOGGING) console.info('Presence update:', data);
    }

    private cleanupSubscriptions(): void {
        this.unsubscribeWsChannels();
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            if (this.messagesContainer) {
                this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
            }
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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
        if (conv.type === 'GROUP') return `${conv.participants?.length ?? 0} thành viên`;
        const other = conv.participants.find(p => p.id !== this.currentUser()?.id);
        if (other?.isOnline === true) return 'Đang hoạt động';
        if (other?.isOnline === false) return 'Ngoại tuyến';
        return 'Tin nhắn riêng';
    }

    headerAvatarLetter(): string {
        const name = this.currentConversation()?.name || '?';
        return name.charAt(0).toUpperCase();
    }

    closePanel(): void {
        this.router.navigate(['/inbox']);
    }
}
