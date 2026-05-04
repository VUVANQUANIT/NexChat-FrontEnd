import { Injectable, inject } from '@angular/core';
import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class AxiosClientService {
  private axiosClient: AxiosInstance;
  private readonly toastService = inject(ToastService);

  constructor() {
    this.axiosClient = axios.create({
      baseURL: 'http://localhost:8080/api', // TODO: Make configurable
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor: Add token to headers
    this.axiosClient.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Skip token for auth endpoints
        if (config.url?.startsWith('/auth/')) {
          return config;
        }

        const token = localStorage.getItem('access_token');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: Handle errors and unwrap data
    this.axiosClient.interceptors.response.use(
      (response: AxiosResponse) => {
        // Backend wraps responses in { success, message, data }
        return response.data?.data || response.data;
      },
      (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          // Token expired or invalid
          console.warn('Token expired or invalid, attempting refresh...');
          originalRequest._retry = true;

          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            const refreshUrl = `${originalRequest.baseURL || 'http://localhost:8080/api'}/auth/refresh`;
            return axios.post(refreshUrl, { refresh_token: refreshToken }, {
              headers: { 'Content-Type': 'application/json' }
            }).then((res) => {
              const data = res.data?.data || res.data;
              localStorage.setItem('access_token', data.access_token);
              if (data.refresh_token) {
                localStorage.setItem('refresh_token', data.refresh_token);
              }
              // Update authorization header for the original request
              originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
              return this.axiosClient(originalRequest);
            }).catch((refreshError) => {
              console.error('Refresh token failed', refreshError);
              localStorage.removeItem('access_token');
              localStorage.removeItem('refresh_token');
              // Redirect to login handled by AuthGuard or here
              window.location.href = '/login';
              return Promise.reject(refreshError);
            });
          } else {
             localStorage.removeItem('access_token');
             window.location.href = '/login';
          }
        }

        const backendError = error.response?.data;
        if (backendError) {
          this.toastService.handleBackendError(backendError);
        }

        // Return the error response data directly
        return Promise.reject(backendError || error);
      }
    );
  }

  // Expose axios methods
  get<T = any>(url: string, config?: any): Promise<T> {
    return this.axiosClient.get(url, config);
  }

  post<T = any>(url: string, data?: any, config?: any): Promise<T> {
    return this.axiosClient.post(url, data, config);
  }

  put<T = any>(url: string, data?: any, config?: any): Promise<T> {
    return this.axiosClient.put(url, data, config);
  }

  delete<T = any>(url: string, config?: any): Promise<T> {
    return this.axiosClient.delete(url, config);
  }

  patch<T = any>(url: string, data?: any, config?: any): Promise<T> {
    return this.axiosClient.patch(url, data, config);
  }
}