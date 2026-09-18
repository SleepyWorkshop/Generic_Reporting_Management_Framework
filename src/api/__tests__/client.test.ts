import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, apiClient, clearCsrfToken } from "../client";

describe("apiClient", () => {
    afterEach(() => {
        clearCsrfToken();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("accepts the backend standard query response", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            success: true,
            message: "Data Loaded Successfully",
            data: [{ Item_Code: "A1" }],
            meta: { page: 1, pageSize: 10, totalRows: 1, rowsReturned: 1, executionTime: 2.4 },
        }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(apiClient({ action: "sql", resource: "reports/item" })).resolves.toMatchObject({ success: true });
        expect(fetchMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            credentials: "include",
        }));
        expect(fetchMock.mock.calls[0][0]).toBe(import.meta.env.VITE_API_URL || "/api");
    });

    it("preserves backend error code, details, and status", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            success: false,
            message: "Invalid request.",
            error: { code: "INVALID_REQUEST", details: [{ path: "pagination.page", message: "Must be positive." }] },
            data: [],
        }), { status: 400, headers: { "Content-Type": "application/json" } })));

        const error = await apiClient({ action: "select" }).catch(caught => caught);
        expect(error).toBeInstanceOf(ApiClientError);
        expect(error).toMatchObject({ status: 400, code: "INVALID_REQUEST" });
        expect((error as ApiClientError).details[0]).toMatchObject({ path: "pagination.page" });
    });

    it("obtains an in-memory CSRF token for state-changing requests", async () => {
        const token = "a".repeat(64);
        const rotatedToken = "b".repeat(64);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                success: true,
                message: "Security token loaded.",
                data: [{ csrfToken: token }],
                meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
            }), { status: 200, headers: { "Content-Type": "application/json" } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                success: true,
                message: "Login successful.",
                data: [{ authenticated: true, user: { username: "Admin", isAdmin: true } }],
                meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", "X-CSRF-Token": rotatedToken },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                success: true,
                message: "User created.",
                data: [{ username: "Operator", enabled: true, isAdmin: false }],
                meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
            }), { status: 201, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await apiClient({ action: "auth.login", username: "Admin", password: "not-persisted" });
        await apiClient({
            action: "auth.users.create",
            username: "Operator",
            password: "also-not-persisted",
            isAdmin: false,
        });

        expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ action: "auth.csrf" });
        const protectedHeaders = fetchMock.mock.calls[1][1].headers as Headers;
        expect(protectedHeaders.get("X-CSRF-Token")).toBe(token);
        const postLoginHeaders = fetchMock.mock.calls[2][1].headers as Headers;
        expect(postLoginHeaders.get("X-CSRF-Token")).toBe(rotatedToken);
        expect(localStorage.length).toBe(0);
        expect(sessionStorage.length).toBe(0);
    });

    it("handles an invalid CSRF bootstrap response without sending credentials", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            success: true,
            message: "Security token loaded.",
            data: [{}],
        }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(apiClient({
            action: "auth.login",
            username: "Admin",
            password: "not-sent",
        })).rejects.toThrow("invalid security token");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].body).not.toContain("not-sent");
    });

    it("uses a deployment API URL without exposing backend environment variables", async () => {
        vi.stubEnv("VITE_API_URL", "/production-api");
        vi.resetModules();
        const { apiClient: configuredClient } = await import("../client");
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            success: true,
            message: "Session state loaded.",
            data: [{ authenticated: false, user: null }],
            meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
        }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await configuredClient({ action: "auth.session" });

        expect(fetchMock.mock.calls[0][0]).toBe("/production-api");
        expect((import.meta.env as Record<string, unknown>).GENERIC_SQL_API_ENCRYPTION_KEY).toBeUndefined();
    });
});
