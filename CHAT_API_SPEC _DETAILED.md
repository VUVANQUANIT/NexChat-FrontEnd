# Chat API Spec — Chi tiết Request/Response

> **BA-style document** | Ngày cập nhật: 2026-03-19 | Phiên bản: v0.2

---

## Mục lục

- [0. Quy ước chung](#0-quy-ước-chung)
- [1. Auth API](#1-auth-api)
- [2. User/Profile API](#2-userprofile-api)
- [3. Friendship API](#3-friendship-api)
- [4. Conversation API](#4-conversation-api)
- [5. Message API](#5-message-api)
- [6. Read & Delivery Status API](#6-read--delivery-status-api)
- [7. Upload Image API](#7-upload-image-api)
- [8. WebSocket / STOMP Realtime](#8-websocket--stomp-realtime)
- [9. DB mở rộng cần làm](#9-db-mở-rộng-cần-làm)

---

## 0. Quy ước chung

### 0.1 Base URL

- Tất cả endpoint bắt đầu bằng `/api`.  
  Ví dụ: `POST /api/auth/login`

### 0.2 Content-Type

| Loại request | Header |
|---|---|
| Request có body JSON | `Content-Type: application/json` |
| Upload file | `Content-Type: multipart/form-data` |
| Tất cả response | `Content-Type: application/json` |

### 0.3 Auth header

- Tất cả endpoint **trừ** `/api/auth/**` đều yêu cầu:
  ```
  Authorization: Bearer <access_token>
  ```
- Optional (khuyến khích): `X-Trace-Id: <string>` để trace log/lỗi.
  - Nếu không gửi, backend tự sinh và trả về trong response header `X-Trace-Id`.

### 0.4 Format Response — Thành công

**A) `ApiResponse<T>`** — wrapper chuẩn cho tất cả endpoint (trừ auth)

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "timestamp": "2026-03-19T10:11:12.123Z"
}
```

| Field | Kiểu | Mô tả |
|---|---|---|
| `success` | boolean | Luôn `true` khi thành công |
| `message` | string | Mô tả ngắn |
| `data` | object / array | Payload trả về |
| `timestamp` | ISO-8601 string | Thời điểm server xử lý |

**B) `LoginResponseDTO`** — chỉ dùng cho auth endpoints

```json
{
  "access_token": "eyJ...",
  "refresh_token": "abc...",
  "token_type": "Bearer",
  "expiresIn": "3600"
}
```

> Lưu ý: field `expiresIn` là camelCase, **không** phải `expires_in`.

**C) `PageResponse<T>`** — dùng cho danh sách có phân trang

```json
{
  "content": [],
  "page": 0,
  "size": 20,
  "totalElements": 100,
  "totalPages": 5,
  "first": true,
  "last": false
}
```

### 0.5 Format Response — Lỗi

Tất cả lỗi trả về cấu trúc `ApiErrorResponse`:

```json
{
  "timestamp": "2026-03-19T10:11:12.123Z",
  "status": 400,
  "error": "Bad Request",
  "code": "VALIDATION_FAILED",
  "message": "Dữ liệu không hợp lệ",
  "path": "/api/auth/register",
  "traceId": "ab12cd34ef56gh78",
  "errors": [
    {
      "field": "username",
      "message": "Username is required",
      "rejectedValue": null
    }
  ]
}
```

> `errors` chỉ xuất hiện khi `code = VALIDATION_FAILED`.  
> `traceId` có thể `null` nếu filter chưa chạy.

**Bảng ErrorCode:**

| HTTP | Code | Ý nghĩa |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Lỗi validate request body, có `errors[]` |
| 400 | `INVALID_JSON` | Body không parse được JSON |
| 400 | `MISSING_PARAMETER` | Thiếu tham số bắt buộc |
| 401 | `UNAUTHORIZED` | Chưa đăng nhập / token không hợp lệ |
| 401 | `INVALID_CREDENTIALS` | Sai username/password |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh token không hợp lệ / hết hạn |
| 403 | `FORBIDDEN` | Không có quyền |
| 403 | `ACCOUNT_DISABLED` | Tài khoản chưa kích hoạt |
| 403 | `ACCOUNT_BANNED` | Tài khoản bị cấm |
| 404 | `RESOURCE_NOT_FOUND` | Tài nguyên không tồn tại |
| 409 | `USERNAME_ALREADY_EXISTS` | Username bị trùng |
| 409 | `EMAIL_ALREADY_EXISTS` | Email bị trùng |
| 422 | `BUSINESS_RULE_VIOLATED` | Vi phạm nghiệp vụ (cần thêm vào `ErrorCode`) |
| 500 | `INTERNAL_ERROR` | Lỗi hệ thống |

> **Ghi chú BE:** `BUSINESS_RULE_VIOLATED` chưa có trong `ErrorCode`, cần bổ sung để phân biệt với `VALIDATION_FAILED` (lỗi input) và `FORBIDDEN` (lỗi quyền). Dùng khi logic nghiệp vụ bị vi phạm, ví dụ: "sửa tin nhắn quá 30 phút", "gửi lời mời kết bạn cho chính mình".

---

## 1. Auth API

### 1.1 `POST /api/auth/register`

**Mục tiêu nghiệp vụ:**  
Tạo tài khoản mới. Hash password, issue access token + refresh token ngay sau khi đăng ký thành công.

**Request body:**

```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "Secret@123",
  "confirmPassword": "Secret@123"
}
```

**Validation:**

| Field | Ràng buộc |
|---|---|
| `username` | NotBlank, length 3–50, regex `^[a-zA-Z0-9_.-]+$` |
| `email` | NotBlank, email format, length ≤ 100 |
| `password` | NotBlank, length 8–100, phải có chữ hoa + chữ thường + số + ký tự đặc biệt |
| `confirmPassword` | NotBlank, phải bằng `password` |

**Response: `201 Created`**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "abc...",
  "token_type": "Bearer",
  "expiresIn": "3600"
}
```

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 VALIDATION_FAILED` | Sai format / thiếu field |
| `409 USERNAME_ALREADY_EXISTS` | Username đã tồn tại |
| `409 EMAIL_ALREADY_EXISTS` | Email đã tồn tại |
| `500 INTERNAL_ERROR` | Lỗi DB / system |

---

### 1.2 `POST /api/auth/login`

**Request body:**

```json
{
  "username": "john_doe",
  "password": "Secret@123"
}
```

**Validation:**

| Field | Ràng buộc |
|---|---|
| `username` | NotBlank, length ≤ 50 |
| `password` | NotBlank, length 1–100 |

**Response: `200 OK`**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "abc...",
  "token_type": "Bearer",
  "expiresIn": "3600"
}
```

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 VALIDATION_FAILED` | Request không hợp lệ |
| `401 INVALID_CREDENTIALS` | Username / password sai |
| `403 ACCOUNT_DISABLED` | Tài khoản chưa kích hoạt |
| `403 ACCOUNT_BANNED` | Tài khoản bị cấm |

---

### 1.3 `POST /api/auth/refresh`

**Mục tiêu nghiệp vụ:**  
Rotate refresh token (thu hồi token cũ, issue token mới). Mỗi refresh token chỉ dùng được 1 lần.

**Request body:**

```json
{
  "refresh_token": "abc..."
}
```

**Response: `200 OK`**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "xyz...",
  "token_type": "Bearer",
  "expiresIn": "3600"
}
```

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 VALIDATION_FAILED` | `refresh_token` blank / thiếu |
| `401 INVALID_REFRESH_TOKEN` | Token không hợp lệ / hết hạn / đã dùng rồi |

---

### 1.4 `POST /api/auth/logout`

**Auth:** Bắt buộc `Authorization: Bearer <access_token>`

**Request:** Không body.

**Mục tiêu nghiệp vụ:**  
Thu hồi refresh token của user hiện tại (lấy `userId` từ JWT principal, không nhận từ client).

**Response: `204 No Content`**  
Không có body.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `401 UNAUTHORIZED` | Token không hợp lệ / không đăng nhập |

---

## 2. User/Profile API

> **Ghi chú BA:** `ProfileController` hiện có 2 mapping trùng `GET /{id}` — cần sửa. Contract mục tiêu theo `UserService` interface.

### 2.1 `GET /api/users/me`

**Mục tiêu:** Xem profile của chính mình — lấy `userId` từ JWT, không nhận từ client.

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "username": "john_doe",
    "email": "john@example.com",
    "fullName": "John Doe",
    "avatarUrl": "https://example.com/avatar.jpg"
  },
  "timestamp": "2026-03-19T10:11:12.123Z"
}
```

**Business rules:**
- `userId` lấy từ `AuthenticatedUser.id()` (từ `SecurityContextHolder`).
- Không cho phép client truyền `id` để giả làm người khác.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `401 UNAUTHORIZED` | Token không hợp lệ |
| `404 RESOURCE_NOT_FOUND` | `userId` trong token không còn tồn tại (edge case) |

---

### 2.2 `PATCH /api/users/me`

**Mục tiêu:** Cập nhật profile — partial update, field nào không gửi thì giữ nguyên.

**Request body:**

```json
{
  "fullName": "John Updated",
  "avatarUrl": "https://example.com/new-avatar.jpg"
}
```

**Validation:**

| Field | Ràng buộc |
|---|---|
| `fullName` | Nếu gửi: không được blank, length 1–100 |
| `avatarUrl` | Nếu gửi: bắt đầu `http://` hoặc `https://`, length ≤ 500 |

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "username": "john_doe",
    "email": "john@example.com",
    "fullName": "John Updated",
    "avatarUrl": "https://example.com/new-avatar.jpg"
  },
  "timestamp": "2026-03-19T10:11:12.123Z"
}
```

**Business rules:**
- Service tự động `trim()` `fullName` và `avatarUrl` trước khi lưu.
- Nếu field gửi là `null` (hoặc không gửi) → không đổi giá trị cũ.
- Không được đổi password qua endpoint này.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 VALIDATION_FAILED` | Sai format `fullName` / `avatarUrl` |
| `401 UNAUTHORIZED` | Token không hợp lệ |

---

### 2.3 `GET /api/users/{id}`

**Mục tiêu:** Xem public profile của người khác.

**Path param:** `id` — Long

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "fullName": "Jane Doe",
    "avatarUrl": "https://example.com/avatar2.jpg"
  },
  "timestamp": "2026-03-19T10:11:12.123Z"
}
```

**Business rules:**
- Chỉ trả `fullName`, `avatarUrl` (public fields).
- Không trả `username`, `email`, `lastSeen` để bảo vệ privacy.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `404 RESOURCE_NOT_FOUND` | User không tồn tại |
| `401 UNAUTHORIZED` | Token không hợp lệ |

---

### 2.4 `GET /api/users/search`

**Mục tiêu:** Tìm kiếm user theo username hoặc fullName để kết bạn.

**Query params:**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `q` | string | Có | Từ khóa tìm kiếm (min 2 ký tự) |
| `page` | int | Không | Mặc định 0 |
| `size` | int | Không | Mặc định 20, max 50 |

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "content": [
      {
        "id": 2,
        "username": "jane_doe",
        "fullName": "Jane Doe",
        "avatarUrl": "https://example.com/avatar2.jpg"
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 1,
    "totalPages": 1,
    "first": true,
    "last": true
  },
  "timestamp": "2026-03-19T10:11:12.123Z"
}
```

**Business rules:**
- Không trả user đang đăng nhập trong kết quả.
- Tìm theo `username ILIKE %q%` hoặc `fullName ILIKE %q%`.
- User bị `BANNED`/`INACTIVE` thường ẩn khỏi kết quả (tuỳ policy).

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 MISSING_PARAMETER` | Thiếu `q` |
| `401 UNAUTHORIZED` | Token không hợp lệ |

---

## 3. Friendship API

> Entity: `Friendship` — `requester` (người gửi), `addressee` (người nhận), `status` (`PENDING / ACCEPTED / REJECTED / BLOCKED`).

### 3.1 `POST /api/friendships/requests`

**Mục tiêu:** Gửi lời mời kết bạn.

**Request body:**

```json
{
  "addresseeId": 42
}
```

**Response: `201 Created`**

```json
{
  "success": true,
  "message": "Friend request sent",
  "data": {
    "id": 10,
    "addresseeId": 42,
    "addresseeUsername": "jane_doe",
    "addresseeAvatarUrl": "https://example.com/avatar2.jpg",
    "status": "PENDING",
    "createdAt": "2026-03-19T10:11:12.123Z"
  },
  "timestamp": "2026-03-19T10:11:12.123Z"
}
```

**Business rules:**
- `requesterId` = `userId` từ JWT. Không nhận từ client.
- Không được gửi lời mời cho chính mình → `422 BUSINESS_RULE_VIOLATED`.
- Nếu đã có bản ghi `Friendship(requester=A, addressee=B)` với `status=PENDING` → `409 CONFLICT`.
- Nếu đã là bạn bè (`ACCEPTED`) → `409 CONFLICT`.
- Nếu user đang bị `BLOCKED` bởi `addressee` → trả `404` (ẩn để không lộ thông tin).
- Nếu `addressee` không tồn tại → `404`.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 VALIDATION_FAILED` | Thiếu / sai kiểu `addresseeId` |
| `404 RESOURCE_NOT_FOUND` | Addressee không tồn tại / đang block |
| `409` | Đã gửi rồi / đã là bạn |
| `422 BUSINESS_RULE_VIOLATED` | Gửi cho chính mình |

---

### 3.2 `GET /api/friendships/requests`

**Mục tiêu:** Danh sách lời mời kết bạn (gửi đi + nhận được) theo trạng thái.

**Query params:**

| Param | Kiểu | Mô tả |
|---|---|---|
| `status` | string | `PENDING` / `ACCEPTED` / `REJECTED` / `BLOCKED`. Nếu bỏ trống → tất cả |
| `direction` | string | `SENT` (mình gửi đi) / `RECEIVED` (mình nhận). Mặc định: `RECEIVED` |
| `page` | int | Mặc định 0 |
| `size` | int | Mặc định 20 |

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "content": [
      {
        "id": 10,
        "requesterId": 1,
        "requesterUsername": "john_doe",
        "requesterAvatarUrl": "https://example.com/avatar.jpg",
        "addresseeId": 42,
        "addresseeUsername": "jane_doe",
        "addresseeAvatarUrl": "https://example.com/avatar2.jpg",
        "status": "PENDING",
        "createdAt": "2026-03-19T10:11:12.123Z",
        "updatedAt": "2026-03-19T10:11:12.123Z"
      }
    ],
    "page": 0,
    "size": 20,
    "totalElements": 5,
    "totalPages": 1,
    "first": true,
    "last": true
  },
  "timestamp": "2026-03-19T10:11:12.123Z"
}
```

---

### 3.3 `POST /api/friendships/requests/{id}/accept`

**Mục tiêu:** Chấp nhận lời mời kết bạn.

**Path param:** `id` — Long (ID bản ghi `Friendship`)

**Request:** Không body.

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "Friend request accepted",
  "data": {
    "id": 10,
    "status": "ACCEPTED",
    "updatedAt": "2026-03-19T10:12:00.000Z"
  },
  "timestamp": "2026-03-19T10:12:00.000Z"
}
```

**Business rules:**
- Chỉ `addressee` mới được accept (người nhận lời mời).
- `status` phải đang là `PENDING`.
- Sau khi accept: backend có thể tự tạo `Conversation(type=PRIVATE)` giữa 2 người (tuỳ design).

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `404 RESOURCE_NOT_FOUND` | Friendship ID không tồn tại |
| `403 FORBIDDEN` | Người đăng nhập không phải `addressee` |
| `422 BUSINESS_RULE_VIOLATED` | Status không phải `PENDING` |

---

### 3.4 `POST /api/friendships/requests/{id}/reject`

**Mục tiêu:** Từ chối lời mời kết bạn.

**Path param:** `id` — Long

**Request:** Không body.

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "Friend request rejected",
  "data": {
    "id": 10,
    "status": "REJECTED",
    "updatedAt": "2026-03-19T10:12:00.000Z"
  },
  "timestamp": "2026-03-19T10:12:00.000Z"
}
```

**Business rules:**
- Chỉ `addressee` mới được reject.
- `status` phải đang là `PENDING`.

---

### 3.5 `POST /api/friendships/{userId}/block`

**Mục tiêu:** Chặn một user.

**Path param:** `userId` — Long

**Request:** Không body.

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "User blocked",
  "data": {
    "blockedUserId": 42,
    "status": "BLOCKED"
  },
  "timestamp": "2026-03-19T10:12:00.000Z"
}
```

**Business rules:**
- Nếu chưa có bản ghi `Friendship` → tạo mới với `status=BLOCKED`.
- Nếu đã có `status=ACCEPTED` → chuyển sang `BLOCKED`.
- Khi user bị block: không thấy nhau trong search, không gửi tin nhắn được.
- Không thể block chính mình → `422 BUSINESS_RULE_VIOLATED`.

---

### 3.6 `DELETE /api/friendships/{userId}`

**Mục tiêu:** Xóa bạn bè (unfriend).

**Path param:** `userId` — Long

**Request:** Không body.

**Response: `204 No Content`**

**Business rules:**
- Tìm bản ghi `Friendship` theo cặp `(currentUser, userId)` hoặc `(userId, currentUser)`.
- Xóa bản ghi (hoặc set `status=REJECTED` tuỳ thiết kế).
- Nếu không tìm thấy → `404`.

---

## 4. Conversation API

> Entity: `Conversation` — `type` (`PRIVATE / GROUP`), `createdAt`.  
> **Lưu ý:** Cần bổ sung field `title`, `avatarUrl`, `ownerId` vào entity `Conversation` (xem [Section 9](#9-db-mở-rộng-cần-làm)).

### 4.1 `POST /api/conversations`

**Mục tiêu:** Tạo cuộc hội thoại mới (PRIVATE hoặc GROUP).

**Request body:**

```json
{
  "type": "PRIVATE",
  "participantIds": [42],
  "title": null,
  "avatarUrl": null
}
```

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `type` | string | Có | `PRIVATE` hoặc `GROUP` |
| `participantIds` | Long[] | Có | Danh sách userId người tham gia (không tính bản thân) |
| `title` | string | GROUP: có | Tên nhóm. PRIVATE: bỏ qua |
| `avatarUrl` | string | Không | Ảnh nhóm. PRIVATE: bỏ qua |

**Response: `201 Created`**

```json
{
  "success": true,
  "message": "Conversation created",
  "data": {
    "id": 5,
    "type": "PRIVATE",
    "title": null,
    "avatarUrl": null,
    "createdAt": "2026-03-19T10:13:00.000Z",
    "participants": [
      {
        "userId": 1,
        "username": "john_doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "joinedAt": "2026-03-19T10:13:00.000Z"
      },
      {
        "userId": 42,
        "username": "jane_doe",
        "avatarUrl": "https://example.com/avatar2.jpg",
        "joinedAt": "2026-03-19T10:13:00.000Z"
      }
    ]
  },
  "timestamp": "2026-03-19T10:13:00.000Z"
}
```

**Business rules:**
- Backend tự thêm `currentUser` vào `participantIds`.
- `PRIVATE`: chỉ được 1 người trong `participantIds` (tổng = 2 người).
  - Nếu đã tồn tại conversation PRIVATE với 2 người đó → trả về conversation đã có (idempotent).
- `GROUP`: phải có ít nhất 2 người trong `participantIds` (tổng ≥ 3 người).
- `GROUP`: `title` là bắt buộc.
- Người tạo group mặc định là `owner`.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 VALIDATION_FAILED` | `type` không hợp lệ / `participantIds` trống |
| `422 BUSINESS_RULE_VIOLATED` | PRIVATE mà có > 1 participant / GROUP thiếu title |
| `404 RESOURCE_NOT_FOUND` | Một trong các userId không tồn tại |

---

### 4.2 `GET /api/conversations`

**Mục tiêu:** Danh sách cuộc hội thoại của người dùng, sắp xếp theo tin nhắn mới nhất (inbox).

**Query params:**

| Param | Kiểu | Mô tả |
|---|---|---|
| `cursor` | string | Con trỏ phân trang theo thời gian sắp xếp của item cuối trang trước (ISO timestamp), mặc định không truyền = lần đầu |
| `limit` | int | Số lượng, mặc định 20, max 50 |

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "items": [
      {
        "id": 5,
        "type": "PRIVATE",
        "title": null,
        "avatarUrl": null,
        "createdAt": "2026-03-19T10:13:00.000Z",
        "lastMessage": {                  
          "id": 101,
          "content": "Hello!",
          "type": "TEXT",
          "senderId": 1,
          "senderUsername": "john_doe",
          "createdAt": "2026-03-19T10:14:00.000Z",
          "isDeleted": false
        },
        "unreadCount": 3,
        "otherParticipant": {
          "userId": 42,
          "username": "jane_doe",
          "avatarUrl": "https://example.com/avatar2.jpg",
          "isOnline": true
        }
      }
    ],
    "nextCursor": "2026-03-19T10:10:00.000Z",
    "hasMore": true
  },
  "timestamp": "2026-03-19T10:14:00.000Z"
}
```

**Business rules:**
- Chỉ trả conversations mà `currentUser` là participant.
- Nếu participant của `currentUser` có `leftAt = null` thì conversation hoạt động bình thường.
- Nếu participant của `currentUser` có `leftAt != null` thì conversation vẫn được trả về, nhưng chỉ hiển thị dữ liệu tin nhắn có `message.createdAt <= leftAt`.
- `lastMessage` là tin nhắn mới nhất còn nhìn thấy được bởi `currentUser`.
  - Nếu chưa rời conversation: lấy tin nhắn mới nhất hiện tại.
  - Nếu đã rời conversation: lấy tin nhắn mới nhất có `createdAt <= leftAt`.
- Nếu conversation chưa có tin nhắn nào, hoặc không có tin nhắn nào còn nhìn thấy được sau khi áp dụng rule `leftAt`, thì `lastMessage = null`.
- Thứ tự sắp xếp inbox:
  - Ưu tiên `lastMessage.createdAt DESC` nếu `lastMessage != null`.
  - Nếu `lastMessage = null` thì fallback về `conversation.createdAt DESC`.
  - Nếu trùng thời gian thì tie-break bằng `conversation.id DESC`.
- `otherParticipant` chỉ có ý nghĩa với `PRIVATE`. Với `GROUP` trả `null`.
- Với `PRIVATE`, `otherParticipant` được xác định từ `conversation_participant`: lấy participant còn lại trong cùng `conversationId`, khác `currentUser`.
- Với `GROUP`, `title` và `avatarUrl` lấy trực tiếp từ thông tin của `conversation`, không suy ra từ danh sách member.
- `unreadCount` là số tin nhắn chưa đọc của `currentUser` trong conversation, được tính theo trạng thái đọc gần nhất lưu trong bảng `message_status`.
  - Mốc đọc sử dụng `message_status.updated_at` (hoặc trường thời gian tương đương trong thiết kế thực tế).
  - Với conversation mà `currentUser` đã `leftAt`, chỉ tính trên tập message có `createdAt <= leftAt`.
- Cursor-based pagination (không dùng offset để tránh mất tin khi có tin mới).
- `cursor` được hiểu là thời gian sắp xếp của item cuối cùng ở trang trước.
  - Trang đầu: không truyền `cursor`.
  - Trang sau: lấy các conversation có thời gian sắp xếp nhỏ hơn `cursor`.
- `nextCursor` là thời gian sắp xếp của item cuối cùng trong `items`; nếu không còn dữ liệu thì trả `null`.

---

### 4.3 `GET /api/conversations/{id}`

**Mục tiêu:** Chi tiết cuộc hội thoại + danh sách participants.

**Path param:** `id` — Long

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 5,
    "type": "GROUP",
    "title": "Dev Team",
    "avatarUrl": "https://example.com/group.jpg",
    "ownerId": 1,
    "createdAt": "2026-03-19T10:13:00.000Z",
    "participants": [
      {
        "userId": 1,
        "username": "john_doe",
        "fullName": "John Doe",
        "avatarUrl": "https://example.com/avatar.jpg",
        "joinedAt": "2026-03-19T10:13:00.000Z",
        "leftAt": null,
        "isOwner": true
      }
    ]
  },
  "timestamp": "2026-03-19T10:13:00.000Z"
}
```

**Business rules:**
- Chỉ participant của conversation mới xem được → `403` nếu không phải.

---

### 4.4 `PATCH /api/conversations/{id}`

**Mục tiêu:** Đổi tên / ảnh nhóm (chỉ GROUP).

**Request body:**

```json
{
  "title": "New Group Name",
  "avatarUrl": "https://example.com/new-group.jpg"
}
```

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "Conversation updated",
  "data": {
    "id": 5,
    "title": "New Group Name",
    "avatarUrl": "https://example.com/new-group.jpg"
  },
  "timestamp": "2026-03-19T10:15:00.000Z"
}
```

**Business rules:**
- Chỉ `owner` hoặc admin mới được sửa.
- Conversation `PRIVATE` không có title → `422 BUSINESS_RULE_VIOLATED`.

---

### 4.5 `POST /api/conversations/{id}/participants`

**Mục tiêu:** Thêm người vào nhóm (chỉ GROUP).

**Request body:**

```json
{
  "userIds": [99, 100]
}
```

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "Participants added",
  "data": {
    "addedUserIds": [99, 100]
  },
  "timestamp": "2026-03-19T10:15:00.000Z"
}
```

**Business rules:**
- Chỉ `owner` mới được thêm người.
- User đã là participant → bỏ qua (idempotent).
- User bị block bởi owner → từ chối.

---

### 4.6 `DELETE /api/conversations/{id}/participants/{userId}`

**Mục tiêu nghiệp vụ:**  
User chủ động rời khỏi nhóm hoặc chủ nhóm (`owner`) thực hiện xóa thành viên khỏi cuộc hội thoại (`kick`).

**Path params:**

| Param | Kiểu | Mô tả |
|---|---|---|
| `id` | Long | ID của cuộc hội thoại |
| `userId` | Long | ID của người dùng cần xóa hoặc người đang thực hiện rời nhóm |

**Request:** Không body.

**Response: `204 No Content`**

**Business rules:**
1. **Kiểm tra quyền hạn:**
   - Nếu `userId == currentUser`: Đây là hành động **Rời nhóm**. Cho phép mọi thành viên.
   - Nếu `userId != currentUser`: Đây là hành động **Kick**. Chỉ `owner` của cuộc hội thoại mới được phép thực hiện. Nếu không phải owner → trả về `403 FORBIDDEN`.
2. **Loại hội thoại:**
   - Chỉ áp dụng cho cuộc hội thoại `GROUP`. Hội thoại `PRIVATE` không hỗ trợ endpoint này → `422 BUSINESS_RULE_VIOLATED`.
3. **Xử lý logic (Soft Exit):**
   - Không xóa bản ghi trong bảng `conversation_participant`.
   - Cập nhật trường `leftAt = current_timestamp` cho participant tương ứng.
   - Sau khi `leftAt` được set, user này sẽ không còn nhận được tin nhắn mới và không thấy cuộc hội thoại trong danh sách active (trừ khi có logic xem lại archive).
4. **Xử lý khi `owner` rời nhóm:**
   - Nếu người rời nhóm là `owner` hiện tại:
     - Hệ thống tự động tìm thành viên còn lại có thời gian gia nhập (`joinedAt`) sớm nhất để chỉ định làm `owner` mới.
     - Nếu cuộc hội thoại không còn thành viên nào khác → Chuyển trạng thái cuộc hội thoại sang `INACTIVE` hoặc đóng vĩnh viễn.
5. **Tính Idempotent:**
   - Nếu user đã rời nhóm từ trước (`leftAt` đã có giá trị) → trả về `204` ngay lập tức.
6. **Realtime Event:**
   - Push event `PARTICIPANT_LEFT` (nếu tự rời) hoặc `PARTICIPANT_KICKED` (nếu bị kick) đến `/topic/conversations/{id}` để cập nhật danh sách thành viên cho các máy máy khách khác.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `403 FORBIDDEN` | Kick thành viên khác khi không phải là owner |
| `404 RESOURCE_NOT_FOUND` | `id` (Conversation) không tồn tại hoặc `userId` không phải là thành viên nhóm |
| `422 BUSINESS_RULE_VIOLATED` | Thực hiện trên cuộc hội thoại `PRIVATE` |

---

## 5. Message API

> Entity: `Message` — `conversation`, `sender`, `content`, `type`, `replyTo`, `isDeleted`, `createdAt`.  
> **Cần bổ sung:** `isEdited`, `editedAt`, `editedBy`, `deletedAt`, `deletedBy` (xem [Section 9](#9-db-mở-rộng-cần-làm)).

### 5.1 `GET /api/conversations/{id}/messages`

**Mục tiêu:** Tải lịch sử tin nhắn theo cursor (scroll up = load older messages).

**Query params:**

| Param | Kiểu | Mô tả |
|---|---|---|
| `beforeId` | Long | Tải tin nhắn có ID < `beforeId`. Mặc định: load từ mới nhất |
| `limit` | int | Số lượng, mặc định 30, max 100 |

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "items": [
      {
        "id": 101,
        "conversationId": 5,
        "sender": {
          "id": 1,
          "username": "john_doe",
          "avatarUrl": "https://example.com/avatar.jpg"
        },
        "content": "Hello!",
        "type": "TEXT",
        "replyTo": null,
        "isDeleted": false,
        "isEdited": false,
        "editedAt": null,
        "createdAt": "2026-03-19T10:14:00.000Z",
        "myStatus": "SEEN",
        "deliveryStatuses": [
          { "userId": 42, "status": "SEEN", "updatedAt": "2026-03-19T10:14:05.000Z" }
        ]
      }
    ],
    "hasMore": true
  },
  "timestamp": "2026-03-19T10:14:00.000Z"
}
```

**Business rules:**
- Chỉ participant mới xem được.
- Tin nhắn bị xóa (`isDeleted=true`) vẫn trả về nhưng `content = null` và có flag `isDeleted: true`.
- Tin nhắn bị ẩn với user này (`MessageHidden`) không được trả về.
- `deliveryStatuses` có thể tắt để giảm payload (optional field).
- Sắp xếp theo `createdAt` DESC.

---

### 5.2 `POST /api/conversations/{id}/messages`

**Mục tiêu:** Gửi tin nhắn vào conversation.

**Request body:**

```json
{
  "content": "Hello World!",
  "type": "TEXT",
  "replyToId": null,
  "clientMessageId": "uuid-v4-client-generated"
}
```

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `content` | string | Có | Nội dung tin nhắn. Với `IMAGE`: URL ảnh đã upload |
| `type` | string | Không | `TEXT` (mặc định) / `IMAGE` |
| `replyToId` | Long | Không | ID tin nhắn đang reply |
| `clientMessageId` | string | Không | UUID do client tự sinh, giúp deduplicate khi retry |

**Response: `201 Created`**

```json
{
  "success": true,
  "message": "Message sent",
  "data": {
    "id": 102,
    "conversationId": 5,
    "sender": {
      "id": 1,
      "username": "john_doe",
      "avatarUrl": "https://example.com/avatar.jpg"
    },
    "content": "Hello World!",
    "type": "TEXT",
    "replyTo": null,
    "isDeleted": false,
    "isEdited": false,
    "createdAt": "2026-03-19T10:15:00.000Z",
    "clientMessageId": "uuid-v4-client-generated"
  },
  "timestamp": "2026-03-19T10:15:00.000Z"
}
```

**Business rules:**
- `senderId` = `currentUser.id` từ JWT.
- Kiểm tra `currentUser` là participant và chưa rời (`leftAt == null`).
- Sau khi lưu: tạo `MessageStatus(SENT)` cho tất cả participant.
  - Nếu participant đang online (có WS connection): tạo `DELIVERED` ngay.
- Push realtime event đến `/topic/conversations/{id}`.
- `clientMessageId`: nếu trùng với tin nhắn đã gửi trong 30 giây → trả về tin cũ (idempotent, tránh gửi 2 lần khi mất mạng retry).
- `content` không được blank nếu `type=TEXT`.
- `type=IMAGE`: `content` phải là URL hợp lệ (đã được upload trước qua `/api/uploads/images`).

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `403 FORBIDDEN` | Không phải participant / đã rời nhóm |
| `404 RESOURCE_NOT_FOUND` | `conversationId` hoặc `replyToId` không tồn tại |
| `422 BUSINESS_RULE_VIOLATED` | Content blank / type không hợp lệ |

---

### 5.3 `PATCH /api/messages/{id}`

**Mục tiêu:** Sửa nội dung tin nhắn văn bản do chính người gửi tạo, trong cửa sổ **30 phút** kể từ `createdAt` (UTC, so sánh bằng `Instant` trên server).

**Auth:** Bắt buộc JWT — xem [§0.3](#03-auth-header).

**Path params:**

| Param | Kiểu | Mô tả |
|---|---|---|
| `id` | Long | ID tin nhắn (`Message.id`) |

**Request body:**

```json
{
  "content": "Hello World! (edited)"
}
```

**Validation:**

| Field | Ràng buộc |
|---|---|
| `content` | Bắt buộc (NotBlank sau trim), độ dài tối đa **4000** ký tự (đồng nhất với [5.2](#52-post-apiconversationsidmessages)) |

**Response: `200 OK`** — `ApiResponse<…>`; `data` trả về đủ thông tin để client cập nhật cache / UI mà không cần gọi lại [5.1](#51-get-apiconversationsidmessages).

```json
{
  "success": true,
  "message": "Message updated",
  "data": {
    "id": 102,
    "conversationId": 5,
    "sender": {
      "id": 1,
      "username": "john_doe",
      "avatarUrl": "https://example.com/avatar.jpg"
    },
    "content": "Hello World! (edited)",
    "type": "TEXT",
    "replyTo": null,
    "isDeleted": false,
    "isEdited": true,
    "editedAt": "2026-03-19T10:30:00.000Z",
    "editedBy": {
      "id": 1,
      "username": "john_doe"
    },
    "createdAt": "2026-03-19T10:15:00.000Z",
    "clientMessageId": "uuid-v4-client-generated"
  },
  "timestamp": "2026-03-19T10:30:00.000Z"
}
```

| Field trong `data` | Ghi chú |
|---|---|
| `editedAt` | Thời điểm sửa **lần này** (UTC) |
| `editedBy` | User thực hiện sửa; thông thường trùng `sender`, nhưng field vẫn có để mở rộng policy sau này |
| `clientMessageId` | Giữ nguyên như lúc gửi (nếu có); `null` nếu tin cũ không có |

**Business rules:**
- `editorId` = `currentUser.id` từ JWT (không nhận user id từ body) — xem `CurrentUserProvider` / GEMINI §8.
- `currentUser` phải là **participant** của `message.conversation` và **chưa rời** (`leftAt == null`), giống [5.2](#52-post-apiconversationsidmessages).
- Chỉ **`sender`** của tin nhắn được phép sửa → nếu không: `403 FORBIDDEN`.
- Cửa sổ thời gian: `Instant.now() <= message.createdAt + 30 minutes` — hết hạn: `422 BUSINESS_RULE_VIOLATED`.
- Chỉ sửa tin loại **`TEXT`**. Tin **`IMAGE`**, **`SYSTEM`**, hoặc loại khác không được sửa → `422 BUSINESS_RULE_VIOLATED`.
- Tin đã **xóa mềm** (`isDeleted = true`, nội dung ẩn với mọi người) **không** được sửa → `422 BUSINESS_RULE_VIOLATED`.
- Nội dung mới **không** được trùng hệt nội dung hiện tại sau trim (tránh no-op spam) → `422 BUSINESS_RULE_VIOLATED` hoặc `200` idempotent tùy policy BE; khuyến nghị: **422** với message rõ ràng để FE không bắn WS thừa.
- Sau khi lưu: `isEdited = true`, `editedAt = now`, `editedBy = currentUser`.
- **Realtime:** broadcast event `MESSAGE_EDITED` tới `/topic/conversations/{conversationId}` — cấu trúc payload xem [§8.4 MESSAGE_EDITED](#84-event-payload-từ-server--client); các field trong `data` nên khớp với REST `data` ở trên (gồm `editedBy`).
- **STOMP:** Client có thể dùng `/app/messages.edit` ([§8.3](#83-gửi-events-từ-client-stomp-send)) thay cho REST; server xử lý một luồng nghiệp vụ để tránh lệch rule.
- **Concurrency:** hai request sửa cùng một tin gần như đồng thời — kết quả cuối phụ thuộc transaction (last commit wins); không yêu cầu optimistic lock trừ khi sau này bổ sung `@Version`.

**Lỗi:**

| Code | HTTP | Trường hợp |
|---|---|---|
| `VALIDATION_FAILED` | 400 | `content` blank / chỉ khoảng trắng / vượt quá 4000 ký tự |
| `UNAUTHORIZED` | 401 | Thiếu hoặc sai JWT |
| `FORBIDDEN` | 403 | Không phải participant / đã rời nhóm, hoặc không phải `sender` |
| `RESOURCE_NOT_FOUND` | 404 | `id` không tồn tại |
| `BUSINESS_RULE_VIOLATED` | 422 | Quá 30 phút; tin đã `isDeleted`; `type` không phải `TEXT`; nội dung mới trùng nội dung cũ (nếu BE chọn rule này) |

> Chi tiết format lỗi (`traceId`, `errors[]`, …): [§0.5](#05-format-response--lỗi) và `API_ERROR_SPEC.md`.

---

### 5.4 `DELETE /api/messages/{id}`

**Mục tiêu:** Xóa tin nhắn với 2 scope: chỉ xóa cho tôi hoặc xóa cho tất cả.

**Query param:**

| Param | Giá trị | Mô tả |
|---|---|---|
| `scope` | `ME` | Ẩn tin với chỉ user này (lưu `MessageHidden`) |
| `scope` | `ALL` | Xóa cho tất cả (set `isDeleted=true`) |

**Response: `204 No Content`**

**Business rules — `scope=ME`:**
- Lưu bản ghi `MessageHidden(userId, messageId)`.
- Tin nhắn vẫn còn với người khác, chỉ ẩn với user này.
- Không có giới hạn thời gian.

**Business rules — `scope=ALL`:**
- Chỉ `sender` được xóa trong vòng 30 phút.
- Moderator/Admin có thể xóa bất kỳ lúc nào (nếu có policy override).
- Set `isDeleted=true`, `deletedAt=now`, `deletedBy=currentUserId`.
- Sau khi xóa: `content` sẽ trả về `null` khi load lịch sử.
- Push realtime event `MESSAGE_DELETED` đến `/topic/conversations/{conversationId}`.

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 MISSING_PARAMETER` | Thiếu `scope` query param |
| `403 FORBIDDEN` | scope=ALL mà không phải sender |
| `404 RESOURCE_NOT_FOUND` | Message không tồn tại |
| `422 BUSINESS_RULE_VIOLATED` | scope=ALL quá 30 phút |

---

## 6. Read & Delivery Status API

### 6.1 `POST /api/conversations/{id}/read`

**Mục tiêu:** Đánh dấu đã đọc tới tin nhắn cuối cùng.

**Request body:**

```json
{
  "lastReadMessageId": 102
}
```

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "Read receipt updated",
  "data": {
    "conversationId": 5,
    "lastReadMessageId": 102,
    "unreadCount": 0
  },
  "timestamp": "2026-03-19T10:14:10.000Z"
}
```

**Business rules:**
- Cập nhật `ConversationParticipant.lastReadMessage = message(lastReadMessageId)`.
- Cập nhật `MessageStatus.status = SEEN` cho tất cả message có `id <= lastReadMessageId` của `currentUser`.
- Push realtime event `READ_RECEIPT` đến `/topic/conversations/{id}`.
- Nếu `lastReadMessageId` không thuộc conversation này → `422`.

---

### 6.2 `POST /api/messages/delivered`

**Mục tiêu:** Client thông báo đã nhận được tin nhắn (DELIVERED), thường gọi ngay sau khi kết nối WS.

**Request body:**

```json
{
  "messageIds": [100, 101, 102]
}
```

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "Delivery status updated",
  "data": {
    "updatedCount": 3
  },
  "timestamp": "2026-03-19T10:14:00.000Z"
}
```

**Business rules:**
- Chỉ update các `MessageStatus` của `currentUser` còn ở `SENT` → chuyển sang `DELIVERED`.
- Các message đã `SEEN` → không đổi (không downgrade).
- Push realtime event `DELIVERED_RECEIPT` nếu cần.

---

### 6.3 `GET /api/conversations/{id}/unread-count`

**Mục tiêu:** Lấy số tin nhắn chưa đọc trong conversation.

**Response: `200 OK`**

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "conversationId": 5,
    "unreadCount": 7
  },
  "timestamp": "2026-03-19T10:14:00.000Z"
}
```

**Business rules:**
- `unreadCount` = số message có `id > lastReadMessage.id` và `currentUser` chưa SEEN.

---

## 7. Upload Image API

### 7.1 `POST /api/uploads/images`

**Mục tiêu:** Upload ảnh trước khi gửi tin nhắn. Client upload trước, lấy URL, rồi mới gọi gửi tin.

**Request:** `Content-Type: multipart/form-data`

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `file` | binary | Có | File ảnh |

**Validation:**
- Định dạng cho phép: `jpg`, `jpeg`, `png`, `gif`, `webp`
- Max size: 5MB
- MIME type phải là `image/*`

**Response: `201 Created`**

```json
{
  "success": true,
  "message": "Image uploaded",
  "data": {
    "url": "https://cdn.example.com/images/uuid.jpg",
    "width": 1920,
    "height": 1080,
    "size": 204800,
    "mimeType": "image/jpeg"
  },
  "timestamp": "2026-03-19T10:13:00.000Z"
}
```

**Business rules:**
- URL trả về là CDN URL / storage URL để gửi vào field `content` của message type `IMAGE`.
- File được lưu theo tên `uuid + extension` để tránh trùng.
- Virus scan (tuỳ giai đoạn sau).

**Lỗi:**

| Code | Trường hợp |
|---|---|
| `400 VALIDATION_FAILED` | Thiếu file / sai định dạng / quá dung lượng |
| `422 BUSINESS_RULE_VIOLATED` | MIME type không phải ảnh |
| `500 INTERNAL_ERROR` | Upload lên storage thất bại |

---

## 8. WebSocket / STOMP Realtime

### 8.1 Kết nối

- **Endpoint:** `ws://host/ws` (hoặc `wss://` nếu HTTPS)
- **Auth:** Gửi JWT trong query param:  
  `ws://host/ws?token=<access_token>`  
  (STOMP không hỗ trợ custom header khi handshake, nên truyền qua query param)
- **Reconnect:** Client nên tự reconnect với exponential backoff khi mất kết nối.

---

### 8.2 Subscribe channels

| Destination | Kiểu | Mô tả |
|---|---|---|
| `/topic/conversations/{id}` | Public | Nhận event trong conversation (tin mới, sửa, xóa, read) |
| `/user/queue/messages` | Private | Nhận tin riêng tư (mention, notification) |
| `/topic/typing/{conversationId}` | Public | Typing indicator |
| `/topic/presence` | Public | Online/Offline của bạn bè |

---

### 8.3 Gửi events từ Client (STOMP send)

#### `/app/messages.send`

```json
{
  "conversationId": 5,
  "content": "Hello!",
  "type": "TEXT",
  "replyToId": null,
  "clientMessageId": "uuid-v4"
}
```

#### `/app/messages.read`

```json
{
  "conversationId": 5,
  "lastReadMessageId": 102
}
```

#### `/app/messages.edit`

```json
{
  "messageId": 102,
  "content": "Edited content"
}
```

#### `/app/messages.delete`

```json
{
  "messageId": 102,
  "scope": "ALL"
}
```

#### `/app/typing`

```json
{
  "conversationId": 5,
  "isTyping": true
}
```

---

### 8.4 Event payload từ Server → Client

#### `MESSAGE_NEW`

Gửi đến `/topic/conversations/{id}` khi có tin nhắn mới.

```json
{
  "event": "MESSAGE_NEW",
  "data": {
    "id": 103,
    "conversationId": 5,
    "sender": { "id": 1, "username": "john_doe", "avatarUrl": "..." },
    "content": "Hello!",
    "type": "TEXT",
    "replyTo": null,
    "isEdited": false,
    "createdAt": "2026-03-19T10:15:00.000Z",
    "clientMessageId": "uuid-v4"
  }
}
```

#### `MESSAGE_EDITED`

Gửi đến `/topic/conversations/{id}` sau khi sửa tin thành công (REST [§5.3](#53-patch-apimessagesid) hoặc STOMP `/app/messages.edit`).

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

#### `MESSAGE_DELETED`

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

#### `READ_RECEIPT`

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

#### `TYPING`

```json
{
  "event": "TYPING",
  "data": {
    "conversationId": 5,
    "userId": 42,
    "username": "jane_doe",
    "isTyping": true
  }
}
```

#### `PRESENCE`

```json
{
  "event": "PRESENCE",
  "data": {
    "userId": 42,
    "isOnline": false,
    "lastSeen": "2026-03-19T10:20:00.000Z"
  }
}
```

---

### 8.5 Luồng nghiệp vụ Realtime

#### Gửi tin nhắn
1. Client emit `/app/messages.send` **hoặc** gọi REST `POST /api/conversations/{id}/messages`.
2. Backend lưu `Message` + tạo `MessageStatus(SENT)` cho tất cả participant.
3. Backend broadcast `MESSAGE_NEW` đến `/topic/conversations/{id}`.
4. Participant đang online nhận được → emit `/app/messages.read` hoặc server tự update `DELIVERED`.

#### Typing indicator
1. Client gõ → emit `/app/typing` với `isTyping: true`.
2. Backend relay ngay đến `/topic/typing/{conversationId}`.
3. Client dừng gõ 2 giây → emit `isTyping: false`.
4. Backend cũng nên set timeout 5 giây tự động tắt typing nếu không nhận `false`.

#### Presence (Online/Offline)
1. Client kết nối WS thành công → backend mark `user.online = true`.
2. Client ngắt kết nối (disconnect) → backend update `user.lastSeen = now`, push `PRESENCE` event.
3. FE subscribe `/topic/presence` để nhận cập nhật online status của bạn bè.

---

## 9. DB mở rộng cần làm

Các field/bảng cần bổ sung vào model hiện tại trước khi implement:

### Entity `Message`

| Field | Kiểu | Mô tả |
|---|---|---|
| `isEdited` | boolean (default false) | Đã được sửa chưa |
| `editedAt` | Instant (nullable) | Thời điểm sửa lần cuối |
| `editedBy` | FK → User (nullable) | Người sửa (thường = sender) |
| `deletedAt` | Instant (nullable) | Thời điểm xóa |
| `deletedBy` | FK → User (nullable) | Người xóa |

### Entity `Conversation`

| Field | Kiểu | Mô tả |
|---|---|---|
| `title` | varchar(100) (nullable) | Tên nhóm — chỉ có ý nghĩa với GROUP |
| `avatarUrl` | varchar(500) (nullable) | Ảnh nhóm |
| `ownerId` | FK → User (nullable) | Người tạo/chủ nhóm |

### Bảng mới: `MessageHidden`

| Column | Kiểu | Mô tả |
|---|---|---|
| `id` | Long PK | |
| `messageId` | FK → Message | |
| `userId` | FK → User | Người ẩn tin nhắn này |
| `hiddenAt` | Instant | Thời điểm ẩn |

> Unique constraint: `(messageId, userId)`

---

## 10. Thứ tự triển khai đề xuất

| Giai đoạn | Việc cần làm |
|---|---|
| **Sprint 1** | Bổ sung DB (Section 9) + Migration |
| **Sprint 1** | Hoàn thiện `ProfileController` (fix dup mapping, đổi sang `@RestController`) |
| **Sprint 1** | User search API (2.4) |
| **Sprint 2** | Friendship API toàn bộ (Section 3) |
| **Sprint 2** | Conversation API — tạo + xem (4.1, 4.2, 4.3) |
| **Sprint 3** | Message API — gửi + lịch sử (5.1, 5.2) |
| **Sprint 3** | Read/Delivery Status (Section 6) |
| **Sprint 4** | WebSocket/STOMP: `MESSAGE_NEW` + `READ_RECEIPT` |
| **Sprint 4** | Message edit + delete (5.3, 5.4) + WS events tương ứng |
| **Sprint 5** | Upload Image (Section 7) |
| **Sprint 5** | Typing indicator + Presence (WS) |
| **Sprint 5** | Conversation: thêm người, kick, rời nhóm (4.4–4.6) |
