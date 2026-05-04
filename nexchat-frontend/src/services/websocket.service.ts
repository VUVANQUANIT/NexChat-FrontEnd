import { Injectable, inject } from '@angular/core';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { AuthService } from './auth.service';
import { WS_BASE_URL } from '../app/config/api.config';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private client: Client | null = null;
  private readonly authService = inject(AuthService);

  connect(onConnected?: () => void, onDisconnected?: () => void): void {
    const token = this.authService.getAccessToken();
    if (!token) {
      console.error('No access token available for WebSocket connection');
      return;
    }

    this.client = new Client({
      // SockJS + JWT in query (browser handshake cannot set Authorization header)
      // See FRONTEND_WS_INTEGRATION_GUIDE.md
      webSocketFactory: () =>
        new SockJS(`${WS_BASE_URL}?token=${encodeURIComponent(token)}`),

      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.client.onConnect = (frame) => {
      console.log('WebSocket connected:', frame);
      onConnected?.();
    };

    this.client.onDisconnect = () => {
      console.warn('WebSocket disconnected');
      onDisconnected?.();
    };

    this.client.onStompError = (frame) => {
      console.error('STOMP error:', frame.headers['message']);
    };

    this.client.onWebSocketError = (error) => {
      console.error('WebSocket error:', error);
    };

    this.client.activate();
  }

  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }
  }

  getClient(): Client | null {
    return this.client;
  }

  subscribe<T>(destination: string, callback: (message: T) => void): StompSubscription | null {
    if (!this.client?.connected) {
      console.warn('WebSocket not connected, cannot subscribe');
      return null;
    }

    return this.client.subscribe(destination, (message: IMessage) => {
      try {
        const data = JSON.parse(message.body) as T;
        callback(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
  }

  publish(destination: string, body: unknown): void {
    if (!this.client?.connected) {
      console.warn('WebSocket not connected, cannot publish');
      return;
    }

    this.client.publish({
      destination,
      body: JSON.stringify(body),
    });
  }
}