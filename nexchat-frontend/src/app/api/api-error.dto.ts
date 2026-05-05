/**
 * Error envelope per CHAT_API_SPEC _DETAILED.md §0.5 (ApiErrorResponse).
 */

export interface ApiFieldError {
    field: string;
    message: string;
    rejectedValue?: unknown;
}

export interface ApiErrorResponse {
    timestamp?: string;
    status?: number;
    error?: string;
    code?: string;
    message?: string;
    path?: string;
    traceId?: string | null;
    errors?: ApiFieldError[];
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
    return (
        typeof value === 'object' &&
        value !== null &&
        ('code' in value || 'message' in value || 'errors' in value)
    );
}
