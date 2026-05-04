import { Injectable, inject } from '@angular/core';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ToastService } from './toast.service';
import { Router } from '@angular/router';
import { API_BASE_URL, ENABLE_API_LOGGING } from '../app/config/api.config';

@Injectable({
  providedIn: 'root'
})
export class AxiosClientService {
  private axiosClient: AxiosInstance;
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  constructor() {
    this.axiosClient = axios.create({
      baseURL: API_BASE_URL,
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
        if (ENABLE_API_LOGGING) {
          console.info('[API] request', {
            method: config.method?.toUpperCase(),
            url: `${config.baseURL || API_BASE_URL}${config.url || ''}`,
            params: config.params
          });
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: Handle errors and unwrap data
    this.axiosClient.interceptors.response.use(
      (response: AxiosResponse) => {
        if (ENABLE_API_LOGGING) {
          console.info('[API] response', {
            status: response.status,
            url: `${response.config.baseURL || API_BASE_URL}${response.config.url || ''}`
          });
        }
        // Backend wraps responses in { success, message, data }
        return response.data?.data || response.data;
      },
      (error) => {
        if (ENABLE_API_LOGGING) {
          console.error('[API] error', {
            status: error?.response?.status,
            url: `${error?.config?.baseURL || API_BASE_URL}${error?.config?.url || ''}`,
            message: error?.response?.data?.message || error?.message
          });
        }
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          // Token expired or invalid
          console.warn('Token expired or invalid, attempting refresh...');
          originalRequest._retry = true;

          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            const refreshUrl = `${originalRequest.baseURL || API_BASE_URL}/auth/refresh`;
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
              this.router.navigate(['/login']);
              return Promise.reject(refreshError);
            });
          } else {
             localStorage.removeItem('access_token');
             this.router.navigate(['/login']);
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
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.axiosClient.get(url, config);
  }

  post<T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<T> {
    return this.axiosClient.post(url, data, config);
  }

  put<T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<T> {
    return this.axiosClient.put(url, data, config);
  }

  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.axiosClient.delete(url, config);
  }

  patch<T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<T> {
    return this.axiosClient.patch(url, data, config);
  }
}