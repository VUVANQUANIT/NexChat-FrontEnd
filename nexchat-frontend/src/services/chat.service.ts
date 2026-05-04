import { Injectable, inject } from '@angular/core';
import { AxiosClientService } from './axios-client.service';
import { AuthService } from './auth.service';
import type { ApiConversationCreateRequest, ApiConversationDetail, ApiConversationsPage, ApiMessageRow, ApiMessagesPage, ApiUnreadCountBody } from '../app/api/chat-api.dto';
import {
    mapApiConversationDetailToDomain,
    mapApiConversationsPageToDomain,
    mapApiMessageRowToMessage,
    mapApiMessagesPageToDomain,
    mapApiUnreadCount
} from '../app/api/chat-api.mapper';

export interface User {
    id: number;
    username: string;
    email: string;
    avatar?: string;
    isOnline?: boolean;
    lastSeen?: string;
}

export interface Conversation {
    id: number;
    /** Derived display label (group title or other user in private chat). */
    name: string;
    type: 'PRIVATE' | 'GROUP';
    title?: string | null;
    avatarUrl?: string | null;
    ownerId?: number;
    lastMessage?: Message;
    participants: User[];
    unreadCount: number;
    createdAt: string;
    updatedAt?: string;
}

export interface Message {
    id: number;
    content: string;
    type: 'TEXT' | 'IMAGE' | 'FILE';
    senderId: number;
    sender: User;
    createdAt: string;
    editedAt?: string;
    status: 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    clientMessageId?: string; // For optimistic UI
}

export interface ConversationsResponse {
    items: Conversation[];
    nextCursor?: string;
    hasMore: boolean;
}

export interface MessagesResponse {
    items: Message[];
    nextCursor?: string;
    hasMore: boolean;
}

type PagingParams = {
    limit: number;
    cursor?: string;
    beforeId?: number;
};

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private readonly axiosClient = inject(AxiosClientService);
    private readonly authService = inject(AuthService);

    // Conversations
    async getConversations(cursor?: string, limit: number = 20): Promise<ConversationsResponse> {
        const params: PagingParams = { limit };
        if (cursor) {
            params.cursor = cursor;
        }
        const raw = await this.axiosClient.get<ApiConversationsPage>('/conversations', { params });
        return mapApiConversationsPageToDomain(raw);
    }

    async getConversation(conversationId: number): Promise<Conversation> {
        const raw = await this.axiosClient.get<ApiConversationDetail>(`/conversations/${conversationId}`);
        return mapApiConversationDetailToDomain(raw, this.authService.currentUser()?.id);
    }

    async createDirectConversation(userId: number): Promise<Conversation> {
        const body: ApiConversationCreateRequest = {
            type: 'PRIVATE',
            participantIds: [userId],
            title: null,
            avatarUrl: null
        };
        const raw = await this.axiosClient.post<ApiConversationDetail>('/conversations', body);
        return mapApiConversationDetailToDomain(raw, this.authService.currentUser()?.id);
    }

    async createGroupConversation(name: string, participantIds: number[]): Promise<Conversation> {
        const body: ApiConversationCreateRequest = {
            type: 'GROUP',
            participantIds,
            title: name,
            avatarUrl: null
        };
        const raw = await this.axiosClient.post<ApiConversationDetail>('/conversations', body);
        return mapApiConversationDetailToDomain(raw, this.authService.currentUser()?.id);
    }

    async createConversation(payload: ApiConversationCreateRequest): Promise<Conversation> {
        const raw = await this.axiosClient.post<ApiConversationDetail>('/conversations', payload);
        return mapApiConversationDetailToDomain(raw, this.authService.currentUser()?.id);
    }

    async updateConversation(conversationId: number, payload: { title?: string; avatarUrl?: string }): Promise<Conversation> {
        await this.axiosClient.patch(`/conversations/${conversationId}`, payload);
        return this.getConversation(conversationId);
    }

    // Messages
    async getMessages(conversationId: number, beforeId?: number, limit: number = 30): Promise<MessagesResponse> {
        const params: PagingParams = { limit };
        if (beforeId) {
            params.beforeId = beforeId;
        }
        const raw = await this.axiosClient.get<ApiMessagesPage>(`/conversations/${conversationId}/messages`, { params });
        const mapped = mapApiMessagesPageToDomain(raw);
        return {
            items: mapped.items,
            nextCursor: mapped.nextCursor,
            hasMore: mapped.hasMore
        };
    }

    async sendMessage(
        conversationId: number,
        content: string,
        type: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT',
        clientMessageId?: string,
        replyToId?: number | null
    ): Promise<Message> {
        const body: {
            content: string;
            type: typeof type;
            clientMessageId?: string;
            replyToId?: number | null;
        } = { content, type };
        if (clientMessageId) {
            body.clientMessageId = clientMessageId;
        }
        if (replyToId !== undefined && replyToId !== null) {
            body.replyToId = replyToId;
        }
        const raw = await this.axiosClient.post<ApiMessageRow>(`/conversations/${conversationId}/messages`, body);
        return mapApiMessageRowToMessage(raw);
    }

    async editMessage(conversationId: number, messageId: number, content: string): Promise<Message> {
        const raw = await this.axiosClient.patch<ApiMessageRow>(`/messages/${messageId}`, {
            content
        });
        return mapApiMessageRowToMessage(raw);
    }

    async deleteMessage(conversationId: number, messageId: number): Promise<void> {
        return this.axiosClient.delete(`/messages/${messageId}`);
    }

    // Read receipts
    async markAsRead(conversationId: number, lastReadMessageId: number): Promise<void> {
        return this.axiosClient.post(`/conversations/${conversationId}/read`, {
            lastReadMessageId
        });
    }

    async markDelivered(messageIds: number[]): Promise<void> {
        return this.axiosClient.post('/messages/delivered', { messageIds });
    }

    async getUnreadCount(conversationId: number): Promise<{ unreadCount: number }> {
        const raw = await this.axiosClient.get<ApiUnreadCountBody>(`/conversations/${conversationId}/unread-count`);
        return mapApiUnreadCount(raw);
    }

    async uploadImage(file: File): Promise<{ url: string }> {
        const formData = new FormData();
        formData.append('file', file);
        return this.axiosClient.post<{ url: string }, FormData>('/uploads/images', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    }

    // Group management
    async addParticipants(conversationId: number, userIds: number[]): Promise<void> {
        return this.axiosClient.post(`/conversations/${conversationId}/participants`, {
            userIds
        });
    }

    async removeParticipant(conversationId: number, userId: number): Promise<void> {
        return this.axiosClient.delete(`/conversations/${conversationId}/participants/${userId}`);
    }
}