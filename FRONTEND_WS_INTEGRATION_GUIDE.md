# Spring Chat - Hướng dẫn Tích hợp WebSocket (Realtime) cho Frontend

Tài liệu này cung cấp chi tiết kỹ thuật về cách kết nối và tương tác với hệ thống WebSocket của backend. Mục tiêu là giúp frontend tích hợp mượt mà nhất với cơ chế backend hiện tại (không cần thay đổi backend).

---

## 1. Kết nối và Authentication (Handshake)

Trình duyệt chuẩn (Browser WebSocket API) **không hỗ trợ** gửi custom headers (như `Authorization: Bearer ...`) trong quá trình HTTP Handshake ban đầu.

Do đó, backend đã được cấu hình để đọc **JWT Token từ Query Parameter**.

- **URL Kết nối (SockJS / Native WebSocket):** 
  - `ws://<domain>/ws?token=<access_token>`
  - `wss://<domain>/ws?token=<access_token>` (nếu có HTTPS)
  
> **Chú ý quan trọng cho Frontend:** Bạn bắt buộc phải đính kèm query param `?token=` với giá trị là Access Token khi khởi tạo kết nối. Nếu thiếu hoặc token hết hạn, kết nối sẽ bị từ chối với mã lỗi HTTP 401 Unauthorized.

Ví dụ khởi tạo với `@stomp/stompjs`:
```javascript
import { Client } from '@stomp/stompjs';

const client = new Client({
  brokerURL: `ws://localhost:8080/ws?token=${accessToken}`,
  // Nếu dùng SockJS (fallback): webSocketFactory: () => new SockJS(`http://localhost:8080/ws?token=${accessToken}`)
  reconnectDelay: 5000,
  heartbeatIncoming: 4000,
  heartbeatOutgoing: 4000,
});

client.onConnect = (frame) => {
  console.log('Connected: ' + frame);
  // Thực hiện subscribe các kênh ở đây
};

client.onStompError = (frame) => {
  console.error('Broker reported error: ' + frame.headers['message']);
  console.error('Additional details: ' + frame.body);
};

client.activate();
```

---

## 2. Các Kênh Đăng ký (Subscribe Destinations)

Hệ thống STOMP broker của backend sử dụng các prefix sau:
- `/topic/` cho các kênh broadcast chung (public/group events).
- `/queue/` hoặc `/user/queue/` cho các kênh cá nhân (private events).

Frontend cần subscribe vào các kênh tương ứng để nhận realtime event.

| Kênh (Destination) | Mục đích | Ghi chú |
|---|---|---|
| `/topic/conversations/{conversationId}` | Nhận sự kiện của một cuộc hội thoại cụ thể. | Cần subscribe ngay khi user mở cửa sổ chat hoặc lúc load inbox list để có realtime message. |
| `/topic/typing/{conversationId}` | Nhận sự kiện ai đó đang gõ phím. | Nhận event TYPING. |
| `/topic/presence` | Trạng thái Online / Offline của các user. | (Tham khảo, phụ thuộc trạng thái triển khai ở BE). |
| `/user/queue/messages` | Kênh riêng tư để nhận thông báo / tin nhắn riêng tư toàn hệ thống. | (Tùy chọn, dùng để bắn noti chung nếu không đang mở conversation). |

Ví dụ Subscribe:
```javascript
const subscription = client.subscribe(`/topic/conversations/${conversationId}`, (message) => {
  const payload = JSON.parse(message.body);
  console.log('Nhận event:', payload);
});
```

---

## 3. Cấu trúc Payload trả về (Event Format)

Mọi message đẩy từ server xuống (ví dụ trong kênh `/topic/conversations/{id}`) đều được bọc trong một chuẩn chung như sau:

```json
{
  "event": "TÊN_SỰ_KIỆN",
  "data": { ... }
}
```

Các loại event (`event` field) và payload (`data` field) tương ứng:

### 3.1 `MESSAGE_NEW`
Phát ra khi có tin nhắn mới được gửi trong conversation.
```json
{
  "event": "MESSAGE_NEW",
  "data": {
    "id": 103,
    "conversationId": 5,
    "sender": {
      "id": 1,
      "username": "john_doe",
      "avatarUrl": "..."
    },
    "content": "Hello!",
    "type": "TEXT",
    "replyTo": null,
    "isEdited": false,
    "createdAt": "2026-03-19T10:15:00.000Z",
    "clientMessageId": "uuid-v4"
  }
}
```

### 3.2 `MESSAGE_EDITED`
Phát ra khi tin nhắn được sửa.
```json
{
  "event": "MESSAGE_EDITED",
  "data": {
    "id": 102,
    "conversationId": 5,
    "content": "Edited content",
    "isEdited": true,
    "editedAt": "2026-03-19T10:30:00.000Z",
    "editedBy": {
      "id": 1,
      "username": "john_doe"
    }
  }
}
```

### 3.3 `MESSAGE_DELETED`
Phát ra khi tin nhắn bị xóa cho mọi người (scope = ALL).
```json
{
  "event": "MESSAGE_DELETED",
  "data": {
    "id": 102,
    "conversationId": 5,
    "deletedAt": "2026-03-19T10:35:00.000Z"
  }
}
```

### 3.4 `READ_RECEIPT`
Phát ra khi một user khác trong conversation đã đọc tới tin nhắn nào đó.
```json
{
  "event": "READ_RECEIPT",
  "data": {
    "conversationId": 5,
    "userId": 42,
    "lastReadMessageId": 102,
    "readAt": "2026-03-19T10:14:10.000Z"
  }
}
```

---

## 4. Gửi Event từ Client (Publish via STOMP)

Frontend có thể đẩy event qua kết nối STOMP. Destination prefix cho ứng dụng nhận là `/app`.
> **Ghi chú:** Đảm bảo data gửi đi phải stringify sang JSON.

### 4.1 Gửi tin nhắn (`/app/messages.send`)
Gửi tin nhắn thay vì dùng REST API `POST`.
```javascript
client.publish({
  destination: '/app/messages.send',
  body: JSON.stringify({
    conversationId: 5,
    content: "Hello from WS!",
    type: "TEXT",
    replyToId: null,
    clientMessageId: "unique-id-123"
  })
});
```

### 4.2 Đánh dấu đã đọc (`/app/messages.read`)
```javascript
client.publish({
  destination: '/app/messages.read',
  body: JSON.stringify({
    conversationId: 5,
    lastReadMessageId: 102
  })
});
```

### 4.3 Sửa / Xóa tin nhắn (Tuỳ chọn dùng qua WS)
- **Edit:** `/app/messages.edit`
- **Delete:** `/app/messages.delete`
*(Payload tham khảo tại API Spec mục 8.3).*

### 4.4 Báo trạng thái Typing (`/app/typing`)
```javascript
client.publish({
  destination: '/app/typing',
  body: JSON.stringify({
    conversationId: 5,
    isTyping: true
  })
});
// Nhớ gửi lại với isTyping: false khi debounce hết thời gian gõ.
```

---

## 5. Lưu ý cho luồng tích hợp (Best Practices)
1. **Quản lý Token:** Access Token có thể hết hạn. Nếu kết nối bị rớt do lỗi 401, FE cần bắt lỗi, gọi REST `/api/auth/refresh` để lấy Token mới, sau đó khởi tạo lại `Client` của `@stomp/stompjs` với Token mới.
2. **Tránh mất tin (Missed Messages):** Khi rớt mạng và reconnect thành công, FE nên trigger gọi lại REST API `GET /api/conversations/{id}/messages` để fetch các tin nhắn đã bị miss trong lúc đứt kết nối.
3. **Idempotency:** Backend có cơ chế chặn trùng tin dựa vào `clientMessageId`. FE luôn phải tự sinh UUID khi gửi và kèm vào payload `messages.send` hoặc qua REST POST để khi retry gửi không bị thành 2 tin nhắn trùng.
4. **Tránh logic nằm rải rác:** Nên tạo 1 service Facade (hoặc Zustand/Redux store) quản lý kết nối STOMP, chỉ expose các callback ra cho UI Component để tránh side-effect.