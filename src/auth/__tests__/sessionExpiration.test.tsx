import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clearRequestCacheMock } = vi.hoisted(() => ({ clearRequestCacheMock: vi.fn() }));

vi.mock("../../engine/RequestCache", () => ({
    clearRequestCache: clearRequestCacheMock,
}));

import { apiClient, ApiClientError } from "../../api/client";
import { AuthProvider, useAuth } from "../AuthContext";

function apiResponse(data: Record<string, unknown>) {
    return new Response(JSON.stringify({
        success: true,
        message: "OK",
        data: [data],
        meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("expired authentication session", () => {
    beforeEach(() => clearRequestCacheMock.mockReset());
    afterEach(() => vi.unstubAllGlobals());

    it("turns a protected API 401 into one unauthenticated transition", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(apiResponse({
                authenticated: true,
                user: { username: "Administrator", isAdmin: true },
            }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                success: false,
                message: "Authentication required.",
                error: { code: "AUTHENTICATION_REQUIRED", details: [] },
                data: [],
            }), { status: 401, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.state.status).toBe("authenticated"));

        let caught: unknown;
        await act(async () => {
            caught = await apiClient({ action: "select" }).catch(error => error);
        });

        expect(caught).toBeInstanceOf(ApiClientError);
        expect(caught).toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
        expect(result.current.state).toEqual({ status: "unauthenticated", user: null });
        expect(clearRequestCacheMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
