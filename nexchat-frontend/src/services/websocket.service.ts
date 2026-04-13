import { Injectable, inject } from '@angular/core';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private client: Client | null = null;
  private readonly authService = inject(AuthService);

  connect(onConnected?: () => void): void {
    const token = this.authService.getAccessToken();
    if (!token) {
      console.error('No access token available for WebSocket connection');
      return;
    }

    this.client = new Client({
      // Use SockJS for fallback support
      webSocketFactory: () => new SockJS(`http://localhost:8080/ws?token=${token}`),

      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.client.onConnect = (frame) => {
      console.log('WebSocket connected:', frame);
      onConnected?.();
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

  subscribe(destination: string, callback: (message: any) => void) {
    if (!this.client?.connected) {
      console.warn('WebSocket not connected, cannot subscribe');
      return null;
    }

    return this.client.subscribe(destination, (message) => {
      try {
        const data = JSON.parse(message.body);
        callback(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        callback(message.body);
      }
    });
  }

  publish(destination: string, body: any): void {
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