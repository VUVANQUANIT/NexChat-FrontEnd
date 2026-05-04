import { Injectable, signal } from '@angular/core';
import { Conversation, Message, User } from '../services/chat.service';

@Injectable({
    providedIn: 'root'
})
export class ChatStore {
    // Conversations
    readonly conversations = signal<Conversation[]>([]);
    readonly conversationsCursor = signal<string | undefined>(undefined);
    readonly hasMoreConversations = signal(true);
    readonly conversationsLoading = signal(false);

    // Current conversation
    readonly currentConversation = signal<Conversation | null>(null);
    readonly currentConversationId = signal<number | null>(null);

    // Messages
    readonly messages = signal<Message[]>([]);
    readonly messagesCursor = signal<string | undefined>(undefined);
    readonly hasMoreMessages = signal(true);
    readonly messagesLoading = signal(false);

    // Typing indicators
    readonly typingUsers = signal<User[]>([]);

    // UI state
    readonly isSendingMessage = signal(false);

    // Actions
    setConversations(conversations: Conversation[], cursor: string | undefined, hasMore: boolean): void {
        this.conversations.set(conversations);
        this.conversationsCursor.set(cursor);
        this.hasMoreConversations.set(hasMore);
    }

    addConversations(newConversations: Conversation[], cursor: string | undefined, hasMore: boolean): void {
        this.conversations.update(current => [...current, ...newConversations]);
        this.conversationsCursor.set(cursor);
        this.hasMoreConversations.set(hasMore);
    }

    setCurrentConversation(conversation: Conversation | null): void {
        this.currentConversation.set(conversation);
        this.currentConversationId.set(conversation?.id || null);
    }

    setMessages(messages: Message[], cursor: string | undefined, hasMore: boolean): void {
        this.messages.set(messages);
        this.messagesCursor.set(cursor);
        this.hasMoreMessages.set(hasMore);
    }

    addMessages(newMessages: Message[]): void {
        this.messages.update(current => [...newMessages, ...current]); // Prepend for chronological order
    }

    addMessage(message: Message): void {
        this.messages.update(current => [...current, message]);
    }

    updateMessage(identifier: string | number, updatedMessage: Message): void {
        this.messages.update(current =>
            current.map(msg =>
                msg.id === identifier || msg.clientMessageId === identifier ? updatedMessage : msg
            )
        );
    }

    mergeMessage(identifier: string | number, partial: Partial<Message>): void {
        this.messages.update(current =>
            current.map(msg =>
                msg.id === identifier || msg.clientMessageId === identifier ? { ...msg, ...partial } : msg
            )
        );
    }

    removeMessage(messageId: number): void {
        this.messages.update(current =>
            current.filter(msg => msg.id !== messageId)
        );
    }

    setTypingUsers(users: User[]): void {
        this.typingUsers.set(users);
    }

    addTypingUser(user: User): void {
        this.typingUsers.update(current => {
            if (!current.find(u => u.id === user.id)) {
                return [...current, user];
            }
            return current;
        });
    }

    removeTypingUser(userId: number): void {
        this.typingUsers.update(current =>
            current.filter(u => u.id !== userId)
        );
    }

    setConversationsLoading(loading: boolean): void {
        this.conversationsLoading.set(loading);
    }

    setMessagesLoading(loading: boolean): void {
        this.messagesLoading.set(loading);
    }

    setSendingMessage(sending: boolean): void {
        this.isSendingMessage.set(sending);
    }
}