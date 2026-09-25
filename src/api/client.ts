import type { ApiError, ApiResponse } from "../types/api";

const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL || "/api");
const API_CREDENTIALS: RequestCredentials = "include";
const authenticationRequiredListeners = new Set<() => void>();
const csrfProtectedActions = new Set([
    "auth.login",
    "auth.logout",
    "auth.users.create",
    "auth.users.enable",
    "auth.users.disable",
    "auth.users.delete",
    "auth.users.changePassword",
    "auth.users.update",
    "auth.users.assignAuthorization",
    "auth.frontendUsers.create",
    "auth.frontendUsers.update",
    "auth.frontendUsers.enable",
    "auth.frontendUsers.disable",
    "auth.frontendUsers.delete",
    "auth.frontendUsers.changePassword",
    "auth.frontendUsers.assignRole",
    "insert",
    "update",
    "delete",
    "upsert",
]);
let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;

/**
 * Keep local browser and API traffic on the same loopback site. Browsers do
 * not send a SameSite=Lax session cookie between localhost and 127.0.0.1,
 * even when CORS and credentials are configured correctly.
 */
export function resolveApiUrl(configuredUrl: string, pageUrl = globalThis.location?.href): string {
    if (!pageUrl || configuredUrl.startsWith("/")) return configuredUrl;

    try {
        const apiUrl = new URL(configuredUrl);
        const browserUrl = new URL(pageUrl);
        if (isLoopbackHost(apiUrl.hostname)
            && isLoopbackHost(browserUrl.hostname)
            && apiUrl.hostname !== browserUrl.hostname) {
            apiUrl.hostname = browserUrl.hostname;
            return apiUrl.toString();
        }
    } catch {
        // Fetch reports malformed deployment URLs with its normal error path.
    }

    return configuredUrl;
}

function isLoopbackHost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

export function subscribeToAuthenticationRequired(listener: () => void): () => void {
    authenticationRequiredListeners.add(listener);
    return () => authenticationRequiredListeners.delete(listener);
}

export function clearCsrfToken(): void {
    csrfToken = null;
    csrfRequest = null;
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
    options: RequestInit = {},
    csrfRetry = false
): Promise<ApiResponse> {
    const action = getAction(body);
    const requestToken = action && csrfProtectedActions.has(action)
        ? await getCsrfToken()
        : null;
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    if (requestToken) headers.set("X-CSRF-Token", requestToken);

    const response = await fetch(API_URL, {
        credentials: API_CREDENTIALS,
        ...options,
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    const rotatedToken = response.headers.get("X-CSRF-Token");
    if (rotatedToken && /^[a-f0-9]{64}$/.test(rotatedToken)
        && csrfToken === requestToken) csrfToken = rotatedToken;

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
            clearCsrfToken();
            authenticationRequiredListeners.forEach(listener => listener());
        }
        if (response.status === 403 && apiError?.code === "CSRF_VALIDATION_FAILED") {
            // An older concurrent request may fail after a newer response has
            // already rotated the shared token. Never discard that newer token.
            if (csrfToken === requestToken) clearCsrfToken();
            if (!csrfRetry && action && csrfProtectedActions.has(action)) {
                return apiClient(body, options, true);
            }
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

    if (action === "auth.logout") clearCsrfToken();
    return payload as ApiResponse;
}

async function getCsrfToken(): Promise<string> {
    if (csrfToken) return csrfToken;
    if (!csrfRequest) {
        csrfRequest = fetch(API_URL, {
            method: "POST",
            credentials: API_CREDENTIALS,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "auth.csrf" }),
        }).then(async response => {
            const payload: unknown = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error("Unable to establish a secure request. Refresh the page and try again.");
            }
            const token = parseCsrfToken(payload);
            csrfToken = token;
            return token;
        }).finally(() => {
            csrfRequest = null;
        });
    }
    return csrfRequest;
}

function parseCsrfToken(payload: unknown): string {
    if (typeof payload !== "object" || payload === null || !("data" in payload)
        || !Array.isArray(payload.data) || payload.data.length !== 1
        || typeof payload.data[0] !== "object" || payload.data[0] === null
        || !("csrfToken" in payload.data[0]) || typeof payload.data[0].csrfToken !== "string"
        || !/^[a-f0-9]{64}$/.test(payload.data[0].csrfToken)) {
        throw new Error("The API returned an invalid security token.");
    }
    return payload.data[0].csrfToken;
}

function getAction(body: object): string | null {
    if (!("action" in body)) return null;
    const action = (body as { action?: unknown }).action;
    return typeof action === "string" ? action : null;
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
