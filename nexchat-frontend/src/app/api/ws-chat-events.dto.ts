/**
 * WebSocket STOMP payloads for `/topic/conversations/{id}` (FRONTEND_WS_INTEGRATION_GUIDE.md §3).
 * Server wraps pushes as `{ event, data }`.
 */

export type WsConversationEventName =
    | 'MESSAGE_NEW'
    | 'MESSAGE_EDITED'
    | 'MESSAGE_DELETED'
    | 'READ_RECEIPT';

export interface WsStompEnvelope<T = unknown> {
    event: string;
    data: T;
}

/** §3.4 READ_RECEIPT */
export interface WsReadReceiptData {
    conversationId: number;
    userId: number;
    lastReadMessageId: number;
    readAt: string;
}
