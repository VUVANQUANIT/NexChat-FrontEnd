import type { Message } from '../../services/chat.service';
import { normalizeMessageType } from './chat-api.mapper';

/**
 * Parse `{ event, data }` envelope from a STOMP body (spec §3).
 */
export function parseWsStompEnvelope(
    raw: unknown
): { event: string; data: Record<string, unknown> } | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o['event'] !== 'string') return null;
    const data = o['data'];
    if (data == null || typeof data !== 'object') return null;
    return { event: o['event'], data: data as Record<string, unknown> };
}

/** Same envelope helper for `/topic/typing/{id}` when server uses the same wrapper. */
export function parseWsTypingPayload(raw: unknown): Record<string, unknown> | null {
    const env = parseWsStompEnvelope(raw);
    if (env) return env.data;
    if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
    return null;
}

export function mapWsMessageNewToMessage(d: Record<string, unknown>): Message | null {
    const id = d['id'];
    const content = d['content'];
    const typeRaw = d['type'];
    const createdAt = d['createdAt'];
    const sender = d['sender'] as Record<string, unknown> | undefined;
    if (typeof id !== 'number' || typeof content !== 'string' || typeof createdAt !== 'string' || !sender) {
        return null;
    }
    const senderId = sender['id'];
    const username = sender['username'];
    if (typeof senderId !== 'number' || typeof username !== 'string') return null;

    const clientMessageId =
        typeof d['clientMessageId'] === 'string' ? d['clientMessageId'] : undefined;

    return {
        id,
        content,
        type: normalizeMessageType(typeof typeRaw === 'string' ? typeRaw : 'TEXT'),
        senderId,
        sender: {
            id: senderId,
            username,
            email: typeof sender['email'] === 'string' ? sender['email'] : '',
            avatar: typeof sender['avatarUrl'] === 'string' ? sender['avatarUrl'] : undefined
        },
        createdAt,
        editedAt: typeof d['editedAt'] === 'string' ? d['editedAt'] : undefined,
        status: 'SENT',
        clientMessageId,
        isEdited: d['isEdited'] === true
    };
}

export function mapWsMessageEditedToPartial(
    d: Record<string, unknown>
): (Partial<Omit<Message, 'id'>> & { id: number }) | null {
    const id = d['id'];
    if (typeof id !== 'number') return null;

    const partial: Partial<Omit<Message, 'id'>> & { id: number } = { id };
    if (typeof d['content'] === 'string') partial.content = d['content'];
    if (typeof d['editedAt'] === 'string') partial.editedAt = d['editedAt'];
    if (d['isEdited'] === true) partial.isEdited = true;

    return partial;
}

export function parseWsReadReceipt(
    d: Record<string, unknown>
): { conversationId: number; userId: number; lastReadMessageId: number } | null {
    const conversationId = d['conversationId'];
    const userId = d['userId'];
    const lastReadMessageId = d['lastReadMessageId'];
    if (
        typeof conversationId !== 'number' ||
        typeof userId !== 'number' ||
        typeof lastReadMessageId !== 'number'
    ) {
        return null;
    }
    return { conversationId, userId, lastReadMessageId };
}
