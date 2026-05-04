# Hướng dẫn tích hợp Frontend - Spring Chat App

Tài liệu này là "bí kíp" chi tiết dành riêng cho team Frontend (React, Vue, Angular, Mobile...) để tích hợp mượt mà với hệ thống Backend. Tài liệu bao gồm quy trình chuẩn, cấu trúc dữ liệu và các đoạn code mẫu (TypeScript/JavaScript) để đảm bảo ứng dụng có thể chạy thực tế.

---

## 1. Chuẩn bị Thư viện

Frontend cần cài đặt các thư viện sau để xử lý HTTP Request và Realtime WebSocket:

```bash
npm install axios @stomp/stompjs sockjs-client
# Cài thêm uuid để tự sinh ID tin nhắn tạm thời ở client
npm install uuid
```

---

## 2. Cấu hình HTTP Client (Axios Interceptor)

Tất cả các API (trừ `/api/auth/**`) đều yêu cầu token. Hãy cấu hình Axios tự động gắn token vào header.

```typescript
// src/api/axiosClient.ts
import axios from 'axios';

const axiosClient = axios.create({
  baseURL: 'http://localhost:8080/api', // Thay bằng domain thực tế
  headers: {
    'Content-Type': 'application/json',
  },
});

// Thêm token vào mỗi request
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Xử lý lỗi chung (Ví dụ: token hết hạn -> refresh token)
axiosClient.interceptors.response.use(
  (response) => response.data, // Backend luôn bọc trong ApiResponse { success, message, data }
  (error) => {
    if (error.response?.status === 401) {
      // Xử lý logout hoặc gọi API refresh token ở đây
      console.error("Token hết hạn hoặc không hợp lệ");
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default axiosClient;
```

---

## 3. Cấu hình WebSocket (STOMP Client)

WebSocket dùng để nhận thông báo realtime (tin nhắn mới, ai đó đang gõ phím, trạng thái online). Do STOMP trên trình duyệt không hỗ trợ custom header truyền Token khi handshake, ta phải truyền Token qua Query Parameters.

```typescript
// src/api/wsClient.ts
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

class WebSocketService {
  private client: Client | null = null;

  public connect(onConnected: () => void) {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    this.client = new Client({
      // Truyền token qua query param
      brokerURL: `ws://localhost:8080/ws?token=${token}`,
      // Nếu server hỗ trợ SockJS fallback thì dùng dòng dưới thay cho brokerURL:
      // webSocketFactory: () => new SockJS(`http://localhost:8080/ws?token=${token}`),
      
      reconnectDelay: 5000, // Tự động kết nối lại sau 5s nếu rớt mạng
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.client.onConnect = (frame) => {
      console.log('Đã kết nối WebSocket', frame);
      onConnected();
    };

    this.client.onStompError = (frame) => {
      console.error('Lỗi STOMP: ' + frame.headers['message']);
    };

    this.client.activate();
  }

  public disconnect() {
    if (this.client) {
      this.client.deactivate();
    }
  }

  public getClient() {
    return this.client;
  }
}

export const wsService = new WebSocketService();
```

---

## 4. Các Luồng Nghiệp Vụ Chính (Workflows)

### Luồng 1: Khởi động App & Đăng nhập

**Bước 1:** Đăng nhập lấy token
```typescript
const login = async (username, password) => {
  const res = await axios.post('http://localhost:8080/api/auth/login', { username, password });
  localStorage.setItem('access_token', res.access_token);
  // Khởi động WebSocket sau khi có token
  initWebSocket();
};
```

**Bước 2:** Sau khi WS kết nối, Subscribe các kênh chung (Presence & Global Notifications)
```typescript
const initWebSocket = () => {
  wsService.connect(() => {
    const stomp = wsService.getClient();
    
    // 1. Lắng nghe trạng thái Online/Offline của bạn bè
    stomp?.subscribe('/topic/presence', (message) => {
      const data = JSON.parse(message.body).data;
      console.log(`User ${data.userId} đang ${data.isOnline ? 'Online' : 'Offline'}`);
      // Cập nhật Redux/Context state ở đây
    });

    // 2. Lắng nghe thông báo cá nhân (Có người kết bạn, có người mời vào nhóm...)
    stomp?.subscribe('/user/queue/messages', (message) => {
       console.log("Có thông báo mới:", JSON.parse(message.body));
    });
  });
};
```

---

### Luồng 2: Tải danh sách Hội thoại (Màn hình Inbox)

**Lưu ý quan trọng:** API này dùng `cursor` phân trang, KHÔNG dùng `page/size`.

```typescript
// state lưu trữ
let cursor = null;
let hasMore = true;
let conversations = [];

const loadConversations = async () => {
  if (!hasMore) return;
  
  const params = cursor ? { limit: 20, cursor } : { limit: 20 };
  const res = await axiosClient.get('/conversations', { params });
  
  // Nối data mới vào list cũ
  conversations = [...conversations, ...res.data.items];
  
  // Cập nhật con trỏ cho lần load tiếp theo
  cursor = res.data.nextCursor;
  hasMore = res.data.hasMore;
};
```

---

### Luồng 3: Mở 1 phòng Chat cụ thể

Khi người dùng click vào 1 phòng chat có ID là `5`:

**Bước 1:** Tải chi tiết và lịch sử tin nhắn
```typescript
// 1. Lấy chi tiết phòng (tên nhóm, danh sách thành viên)
const detail = await axiosClient.get(`/conversations/5`);

// 2. Load tin nhắn cũ nhất (tương tự như load Inbox, truyền beforeId nếu cuộn lên trên)
const messages = await axiosClient.get(`/conversations/5/messages?limit=30`);
```

**Bước 2:** Đăng ký nhận tin nhắn realtime CỦA PHÒNG NÀY
```typescript
let chatSub = null;
let typingSub = null;

const joinChatRoom = (conversationId) => {
  const stomp = wsService.getClient();
  
  // Lắng nghe tin nhắn, edit, delete, read receipt
  chatSub = stomp?.subscribe(`/topic/conversations/${conversationId}`, (msg) => {
    const payload = JSON.parse(msg.body);
    
    switch (payload.event) {
      case 'MESSAGE_NEW':
        // Cập nhật UI: Thêm tin nhắn mới vào danh sách
        // Xóa tin nhắn tạm thời (dựa vào clientMessageId)
        break;
      case 'MESSAGE_EDITED':
        // Tìm tin nhắn trong state và cập nhật nội dung
        break;
      case 'MESSAGE_DELETED':
        // Cập nhật content = "Tin nhắn đã bị thu hồi"
        break;
      case 'READ_RECEIPT':
        // Đánh dấu tick xanh cho tin nhắn
        break;
    }
  });

  // Lắng nghe hiệu ứng "Ai đó đang gõ phím..."
  typingSub = stomp?.subscribe(`/topic/typing/${conversationId}`, (msg) => {
     const data = JSON.parse(msg.body).data;
     if (data.isTyping) {
        showTypingIndicator(data.username);
     } else {
        hideTypingIndicator(data.username);
     }
  });
};

// Đừng quên unsubscribe khi thoát khỏi màn hình chat đó!
const leaveChatRoom = () => {
  chatSub?.unsubscribe();
  typingSub?.unsubscribe();
};
```

---

### Luồng 4: Gửi tin nhắn (Trải nghiệm siêu mượt - Optimistic UI)

Để app mượt như Messenger, khi user ấn "Gửi", FE phải hiện tin nhắn lên màn hình ngay lập tức (màu nhạt), rồi mới gọi API.

```typescript
import { v4 as uuidv4 } from 'uuid';

const sendMessage = async (conversationId, text) => {
  const tempId = uuidv4(); // Tạo ID tạm
  
  // 1. Hiển thị ngay lên màn hình (Optimistic Update)
  const tempMsg = {
     id: tempId, // Dùng tạm làm key render
     content: text,
     senderId: myUserId,
     status: 'SENDING', // Hiển thị màu nhạt hoặc icon xoay tròn
     createdAt: new Date().toISOString()
  };
  appendMessageToUI(tempMsg);

  // 2. Bắn API lên Server
  try {
    const res = await axiosClient.post(`/conversations/${conversationId}/messages`, {
      content: text,
      type: "TEXT",
      clientMessageId: tempId // Bắt buộc gửi lên để server biết
    });
    
    // Server trả về thành công -> Đổi status thành 'SENT'
    updateMessageStatusInUI(tempId, 'SENT');
    
  } catch (error) {
    // Nếu lỗi mạng -> Hiển thị nút "Thử lại"
    updateMessageStatusInUI(tempId, 'FAILED');
  }
};
```

---

### Luồng 5: Xử lý Gõ phím (Typing Indicator)

Đừng gửi event mỗi khi user gõ 1 ký tự, hãy dùng "Debounce" (giãn cách).

```typescript
let typingTimeout = null;

const onUserTyping = (conversationId) => {
  const stomp = wsService.getClient();
  
  // Gửi sự kiện Đang gõ
  stomp?.publish({
    destination: '/app/typing',
    body: JSON.stringify({ conversationId, isTyping: true })
  });

  // Xóa timeout cũ nếu user vẫn đang gõ
  if (typingTimeout) clearTimeout(typingTimeout);

  // Nếu sau 2s user không gõ nữa -> Báo ngừng gõ
  typingTimeout = setTimeout(() => {
    stomp?.publish({
      destination: '/app/typing',
      body: JSON.stringify({ conversationId, isTyping: false })
    });
  }, 2000);
};
```

---

### Luồng 6: Thông báo "Đã đọc" (Read Receipt)

Khi user mở phòng chat, cuộn xuống tin nhắn cuối cùng -> Báo cho server biết mình đã xem.

```typescript
import { useIntersectionObserver } from '...'; // Dùng thư viện check scroll

const markAsRead = async (conversationId, lastMessageId) => {
  try {
    await axiosClient.post(`/conversations/${conversationId}/read`, {
       lastReadMessageId: lastMessageId
    });
    
    // Server sẽ tự động publish event READ_RECEIPT tới mọi người trong phòng
  } catch(e) {
     console.error(e);
  }
};
```

---

### Luồng 7: Quản lý nhóm (Thêm, Kick, Rời nhóm)

**1. Thêm thành viên vào nhóm:**
```typescript
// Chỉ Owner mới được gọi
const addMembers = async (conversationId, userIdsArray) => {
  await axiosClient.post(`/conversations/${conversationId}/participants`, {
    userIds: userIdsArray // Ví dụ: [99, 100]
  });
  alert("Đã thêm thành công!");
};
```

**2. Kick thành viên (Chủ nhóm làm):**
```typescript
const kickMember = async (conversationId, targetUserId) => {
  await axiosClient.delete(`/conversations/${conversationId}/participants/${targetUserId}`);
  // Dòng người đó sẽ biến mất khỏi UI
};
```

**3. Tự rời nhóm:**
```typescript
const leaveGroup = async (conversationId, myUserId) => {
  // Gửi request xóa CHÍNH MÌNH
  await axiosClient.delete(`/conversations/${conversationId}/participants/${myUserId}`);
  
  // Điều hướng user về màn hình Inbox
  navigation.navigate("Inbox");
};
```

---

## 5. Xử lý Lỗi chuẩn (Error Handling)

Khi gọi REST API, nếu bắt được lỗi từ `.catch()`, Backend sẽ trả về format này:

```json
{
  "timestamp": "2026-03-19T10:11:12.123Z",
  "status": 422,
  "code": "CANNOT_INVATE_BLOCK",
  "message": "Không thể mời do tồn tại quan hệ block giữa hai người",
  "errors": null
}
```

**Frontend nên viết hàm helper để hiển thị Toast/Alert:**
```typescript
const handleError = (error) => {
   if (error.code === 'VALIDATION_FAILED') {
      // Báo lỗi đỏ từng field trong Form
      error.errors.forEach(e => showFieldError(e.field, e.message));
   } else if (error.code === 'CANNOT_INVATE_BLOCK') {
      alert("Bạn không thể thêm người này vì họ đã chặn bạn (hoặc ngược lại).");
   } else if (error.code === 'FORBIDDEN') {
      alert("Bạn không có quyền thực hiện hành động này!");
   } else {
      alert(error.message || "Có lỗi xảy ra, vui lòng thử lại.");
   }
}
```
