import type { ApiError, ApiResponse } from "../types/api";

const API_URL = import.meta.env.VITE_API_URL;
const API_CREDENTIALS: RequestCredentials = "include";
const authenticationRequiredListeners = new Set<() => void>();

export function subscribeToAuthenticationRequired(listener: () => void): () => void {
    authenticationRequiredListeners.add(listener);
    return () => authenticationRequiredListeners.delete(listener);
}

export class ApiClientError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly details: ApiError["details"];

    constructor(message: string, status: number, error?: ApiError) {
        super(message);
        this.name = "ApiClientError";
        this.status = status;
        this.code = error?.code;
        this.details = error?.details ?? [];
    }
}

export async function apiClient(
    body: object,
    options: RequestInit = {}
): Promise<ApiResponse> {
    const response = await fetch(API_URL, {
        credentials: API_CREDENTIALS,
        ...options,
        method: "POST",
        headers: {
            ...options.headers,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    let payload: unknown;

    try {
        payload = await response.json();
    } catch {
        throw new Error(
            response.ok
                ? "The API returned an invalid JSON response."
                : `The API returned HTTP ${response.status}.`
        );
    }

    if (!response.ok) {
        const apiError = getApiError(payload);
        const message =
            typeof payload === "object"
            && payload !== null
            && "message" in payload
            && typeof payload.message === "string"
                ? payload.message
                : `The API returned HTTP ${response.status}.`;

        if (response.status === 401 && apiError?.code === "AUTHENTICATION_REQUIRED") {
            authenticationRequiredListeners.forEach(listener => listener());
        }

        throw new ApiClientError(message, response.status, apiError);
    }

    if (
        typeof payload !== "object"
        || payload === null
        || !("success" in payload)
        || typeof payload.success !== "boolean"
        || !("message" in payload)
        || typeof payload.message !== "string"
        || !("data" in payload)
        || !Array.isArray(payload.data)
    ) {
        throw new Error("The API returned an unexpected response format.");
    }

    if (
        payload.success
        && (
            !payload.data.every(
                row => typeof row === "object" && row !== null && !Array.isArray(row)
            )
            || !("meta" in payload)
            || !isApiMeta(payload.meta)
        )
    ) {
        throw new Error("The API returned an unexpected data format.");
    }

    if (!payload.success) {
        throw new ApiClientError(payload.message, response.status, getApiError(payload));
    }

    return payload as ApiResponse;
}

function getApiError(payload: unknown): ApiError | undefined {
    if (typeof payload !== "object" || payload === null || !("error" in payload)) return undefined;
    const error = payload.error;
    if (typeof error !== "object" || error === null) return undefined;
    const value = error as Record<string, unknown>;
    if (typeof value.code !== "string" || !Array.isArray(value.details)) return undefined;
    return { code: value.code, details: value.details as ApiError["details"] };
}

function isApiMeta(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const meta = value as Record<string, unknown>;
    return (meta.page === null || isNonNegativeNumber(meta.page))
        && (meta.pageSize === null || isNonNegativeNumber(meta.pageSize))
        && isNonNegativeNumber(meta.totalRows)
        && isNonNegativeNumber(meta.rowsReturned)
        && (meta.executionTime === null || isNonNegativeNumber(meta.executionTime));
}

function isNonNegativeNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
