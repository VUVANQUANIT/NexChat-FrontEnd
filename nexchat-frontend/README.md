<div align="center">
  <h1>💬 NexChat Frontend</h1>
  <p>A modern, real-time chat application built with Angular 21 and Tailwind CSS.</p>

  [![CI](https://github.com/USERNAME/NexChat-Frontend/actions/workflows/ci.yml/badge.svg)](https://github.com/USERNAME/NexChat-Frontend/actions/workflows/ci.yml)
  [![Angular](https://img.shields.io/badge/Angular-21-DD0031?style=flat&logo=angular)](https://angular.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
</div>

---

## 🌟 Features

- **Real-time Messaging**: Powered by WebSockets and STOMP for instant communication.
- **Modern UI**: Clean, responsive, and beautiful interface designed with Tailwind CSS 4.
- **User Authentication**: Secure login and registration flows.
- **Friend Management**: Easily add friends, view friend requests, and start new conversations.
- **State Management**: Built on top of robust state stores, signals, and RxJS.

## 🚀 Tech Stack

- **Framework**: [Angular 21](https://angular.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Real-time**: `@stomp/stompjs` and `sockjs-client`
- **HTTP Client**: `axios`
- **Testing**: [Vitest](https://vitest.dev/)

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 or later recommended)
- [npm](https://www.npmjs.com/) (v10 or later)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/NexChat-Frontend.git
   cd NexChat-Frontend/nexchat-frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy the example environment file and configure it:
   ```bash
   cp .env.example .env
   ```
   *(Ensure you update `.env` with your backend API and WebSocket URLs)*

### Development Server

Run the development server:

```bash
npm start
```
Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## 🧪 Testing

To execute unit tests via Vitest:

```bash
npm run test
```

## 📦 Building for Production

To build the project for production:

```bash
npm run build
```
The build artifacts will be stored in the `dist/` directory, optimized for performance and speed.

## ⚙️ CI/CD

This project uses **GitHub Actions** for Continuous Integration. Every push and pull request to the `main` branch triggers an automated workflow that:
- Installs dependencies securely using `npm ci`.
- Runs unit tests via Vitest.
- Builds the application to ensure it compiles perfectly.

Check out the workflow configuration at [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) for more details.

## 📄 Documentation

For backend integration details and API specifications, please refer to:
- [`FRONTEND_INTEGRATION_GUIDE.md`](../FRONTEND_INTEGRATION_GUIDE.md)
- [`FRONTEND_WS_INTEGRATION_GUIDE.md`](../FRONTEND_WS_INTEGRATION_GUIDE.md)
- [`CHAT_API_SPEC _DETAILED.md`](../CHAT_API_SPEC _DETAILED.md)
