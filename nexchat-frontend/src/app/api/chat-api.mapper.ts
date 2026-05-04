import type { Conversation, Message, User } from '../../services/chat.service';
import type {
    ApiConversationDetail,
    ApiConversationListItem,
    ApiConversationsPage,
    ApiLastMessageSnippet,
    ApiMessageRow,
    ApiMessagesPage,
    ApiParticipantRow,
    ApiUnreadCountBody
} from './chat-api.dto';

export function normalizeMessageType(type: string): Message['type'] {
    if (type === 'IMAGE') return 'IMAGE';
    if (type === 'FILE') return 'FILE';
    return 'TEXT';
}

function mapParticipantRowToUser(p: ApiParticipantRow): User {
    return {
        id: p.userId,
        username: p.username,
        email: '',
        avatar: p.avatarUrl ?? undefined
    };
}

export function mapLastSnippetToMessage(s: ApiLastMessageSnippet): Message {
    return {
        id: s.id,
        content: s.isDeleted ? '' : s.content,
        type: normalizeMessageType(s.type),
        senderId: s.senderId,
        sender: {
            id: s.senderId,
            username: s.senderUsername,
            email: ''
        },
        createdAt: s.createdAt,
        status: 'SENT'
    };
}

export function mapApiMessageRowToMessage(row: ApiMessageRow): Message {
    return {
        id: row.id,
        content: row.isDeleted ? '' : (row.content ?? ''),
        type: normalizeMessageType(row.type),
        senderId: row.sender.id,
        sender: {
            id: row.sender.id,
            username: row.sender.username,
            email: '',
            avatar: row.sender.avatarUrl ?? undefined
        },
        createdAt: row.createdAt,
        editedAt: row.editedAt ?? undefined,
        status: 'SENT',
        clientMessageId: row.clientMessageId ?? undefined
    };
}

export function mapApiConversationListItemToConversation(item: ApiConversationListItem): Conversation {
    const name =
        item.type === 'GROUP'
            ? item.title || 'Group'
            : item.otherParticipant?.username || 'Chat';

    const participants: User[] =
        item.type === 'PRIVATE' && item.otherParticipant
            ? [
                  {
                      id: item.otherParticipant.userId,
                      username: item.otherParticipant.username,
                      email: '',
                      avatar: item.otherParticipant.avatarUrl ?? undefined,
                      isOnline: item.otherParticipant.isOnline
                  }
              ]
            : [];

    return {
        id: item.id,
        name,
        type: item.type,
        title: item.title,
        avatarUrl: item.avatarUrl,
        lastMessage: item.lastMessage ? mapLastSnippetToMessage(item.lastMessage) : undefined,
        participants,
        unreadCount: item.unreadCount,
        createdAt: item.createdAt,
        updatedAt: item.lastMessage?.createdAt ?? item.createdAt
    };
}

export function mapApiConversationsPageToDomain(page: ApiConversationsPage): {
    items: Conversation[];
    nextCursor?: string;
    hasMore: boolean;
} {
    return {
        items: page.items.map(mapApiConversationListItemToConversation),
        nextCursor: page.nextCursor ?? undefined,
        hasMore: page.hasMore
    };
}

export function mapApiConversationDetailToDomain(
    d: ApiConversationDetail,
    currentUserId?: number
): Conversation {
    const participants = d.participants.filter(p => p.leftAt == null).map(mapParticipantRowToUser);

    let name: string;
    if (d.type === 'GROUP') {
        name = d.title || 'Group';
    } else {
        const other =
            currentUserId != null ? participants.find(u => u.id !== currentUserId) : participants[0];
        name = other?.username || 'Chat';
    }

    return {
        id: d.id,
        name,
        type: d.type,
        title: d.title,
        avatarUrl: d.avatarUrl ?? null,
        ownerId: d.ownerId,
        participants,
        unreadCount: 0,
        createdAt: d.createdAt,
        updatedAt: d.createdAt
    };
}

export function mapApiMessagesPageToDomain(page: ApiMessagesPage): {
    items: Message[];
    hasMore: boolean;
    nextCursor?: string;
} {
    const items = [...page.items].reverse().map(mapApiMessageRowToMessage);
    return {
        items,
        hasMore: page.hasMore,
        nextCursor: undefined
    };
}

export function mapApiUnreadCount(body: ApiUnreadCountBody): { unreadCount: number } {
    return { unreadCount: body.unreadCount };
}
