import { Injectable, inject } from '@angular/core';
import { AxiosClientService } from './axios-client.service';

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
    name: string;
    type: 'DIRECT' | 'GROUP';
    lastMessage?: Message;
    participants: User[];
    unreadCount: number;
    createdAt: string;
    updatedAt: string;
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

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private readonly axiosClient = inject(AxiosClientService);

    // Conversations
    async getConversations(cursor?: string, limit: number = 20): Promise<ConversationsResponse> {
        const params: any = { limit };
        if (cursor) {
            params.cursor = cursor;
        }
        return this.axiosClient.get<ConversationsResponse>('/conversations', { params });
    }

    async getConversation(conversationId: number): Promise<Conversation> {
        return this.axiosClient.get<Conversation>(`/conversations/${conversationId}`);
    }

    async createDirectConversation(userId: number): Promise<Conversation> {
        return this.axiosClient.post<Conversation>('/conversations/direct', { userId });
    }

    async createGroupConversation(name: string, participantIds: number[]): Promise<Conversation> {
        return this.axiosClient.post<Conversation>('/conversations/group', {
            name,
            participantIds
        });
    }

    // Messages
    async getMessages(conversationId: number, beforeId?: number, limit: number = 30): Promise<MessagesResponse> {
        const params: any = { limit };
        if (beforeId) {
            params.beforeId = beforeId;
        }
        return this.axiosClient.get<MessagesResponse>(`/conversations/${conversationId}/messages`, { params });
    }

    async sendMessage(conversationId: number, content: string, type: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT', clientMessageId?: string): Promise<Message> {
        return this.axiosClient.post<Message>(`/conversations/${conversationId}/messages`, {
            content,
            type,
            clientMessageId
        });
    }

    async editMessage(conversationId: number, messageId: number, content: string): Promise<Message> {
        return this.axiosClient.put<Message>(`/conversations/${conversationId}/messages/${messageId}`, {
            content
        });
    }

    async deleteMessage(conversationId: number, messageId: number): Promise<void> {
        return this.axiosClient.delete(`/conversations/${conversationId}/messages/${messageId}`);
    }

    // Read receipts
    async markAsRead(conversationId: number, lastReadMessageId: number): Promise<void> {
        return this.axiosClient.post(`/conversations/${conversationId}/read`, {
            lastReadMessageId
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

    // Users search
    async searchUsers(query: string): Promise<User[]> {
        return this.axiosClient.get<User[]>('/users/search', {
            params: { q: query }
        });
    }
}