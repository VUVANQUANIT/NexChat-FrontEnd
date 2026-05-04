/**
 * DTOs aligned with CHAT_API_SPEC _DETAILED.md (conversation + message sections).
 * Used as the wire shape returned by AxiosClientService (already unwraps `data`).
 */

export type ApiConversationType = 'PRIVATE' | 'GROUP';

export interface ApiOtherParticipant {
    userId: number;
    username: string;
    avatarUrl?: string | null;
    isOnline?: boolean;
}

export interface ApiLastMessageSnippet {
    id: number;
    content: string;
    type: string;
    senderId: number;
    senderUsername: string;
    createdAt: string;
    isDeleted: boolean;
}

export interface ApiConversationListItem {
    id: number;
    type: ApiConversationType;
    title: string | null;
    avatarUrl: string | null;
    createdAt: string;
    lastMessage: ApiLastMessageSnippet | null;
    unreadCount: number;
    otherParticipant: ApiOtherParticipant | null;
}

export interface ApiConversationsPage {
    items: ApiConversationListItem[];
    nextCursor: string | null;
    hasMore: boolean;
}

export interface ApiParticipantRow {
    userId: number;
    username: string;
    fullName?: string;
    avatarUrl?: string | null;
    joinedAt: string;
    leftAt?: string | null;
    isOwner?: boolean;
}

export interface ApiConversationDetail {
    id: number;
    type: ApiConversationType;
    title: string | null;
    avatarUrl?: string | null;
    ownerId?: number;
    createdAt: string;
    participants: ApiParticipantRow[];
}

export interface ApiMessageSender {
    id: number;
    username: string;
    avatarUrl?: string | null;
}

export interface ApiMessageRow {
    id: number;
    conversationId: number;
    sender: ApiMessageSender;
    content: string | null;
    type: string;
    replyTo: unknown;
    isDeleted: boolean;
    isEdited: boolean;
    editedAt: string | null;
    createdAt: string;
    clientMessageId?: string | null;
    myStatus?: string;
}

export interface ApiMessagesPage {
    items: ApiMessageRow[];
    hasMore: boolean;
}

export interface ApiUnreadCountBody {
    conversationId: number;
    unreadCount: number;
}

export interface ApiConversationCreateRequest {
    type: ApiConversationType;
    participantIds: number[];
    title?: string | null;
    avatarUrl?: string | null;
}
