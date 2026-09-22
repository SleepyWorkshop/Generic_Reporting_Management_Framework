import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRequestMock, clearRequestCacheMock } = vi.hoisted(() => ({
    executeRequestMock: vi.fn(),
    clearRequestCacheMock: vi.fn(),
}));

vi.mock("../../api/request", async importOriginal => ({
    ...await importOriginal<typeof import("../../api/request")>(),
    executeRequest: executeRequestMock,
}));
vi.mock("../../engine/RequestCache", () => ({
    clearRequestCache: clearRequestCacheMock,
}));

import { AuthProvider, useAuth } from "../AuthContext";

function response(data: Record<string, unknown>) {
    return {
        success: true,
        message: "OK",
        data: [data],
        meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
    };
}

const authenticated = {
    authenticated: true,
    user: { username: "Administrator", backendRole: "system-administrator", frontendAccess: true, frontendRole: "application-administrator" },
};
const anonymous = { authenticated: false, user: null };

describe("login and logout flow", () => {
    beforeEach(() => {
        executeRequestMock.mockReset();
        clearRequestCacheMock.mockReset();
    });

    it("restores an authenticated session on startup", async () => {
        executeRequestMock.mockResolvedValueOnce(response(authenticated));
        const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
        const { result } = renderHook(() => useAuth(), { wrapper });

        await waitFor(() => expect(result.current.state.status).toBe("authenticated"));
        expect(result.current.state).toEqual({
            status: "authenticated",
            user: authenticated.user,
        });
        expect(executeRequestMock).toHaveBeenCalledWith(
            { action: "auth.session" },
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
    });

    it("logs in and logs out without client-side credential persistence", async () => {
        executeRequestMock
            .mockResolvedValueOnce(response(anonymous))
            .mockResolvedValueOnce(response(authenticated))
            .mockResolvedValueOnce(response(anonymous));
        const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
        const { result } = renderHook(() => useAuth(), { wrapper });
        await waitFor(() => expect(result.current.state.status).toBe("unauthenticated"));

        await act(() => result.current.login("Administrator", "private-password"));
        expect(result.current.state.status).toBe("authenticated");
        expect(executeRequestMock.mock.calls[1][0]).toEqual({
            action: "auth.login",
            username: "Administrator",
            password: "private-password",
        });

        await act(() => result.current.logout());
        expect(result.current.state).toEqual({ status: "unauthenticated", user: null });
        expect(executeRequestMock.mock.calls[2][0]).toEqual({ action: "auth.logout" });
        expect(localStorage.length).toBe(0);
        expect(sessionStorage.length).toBe(0);
        expect(clearRequestCacheMock).toHaveBeenCalledTimes(3);
    });
});
