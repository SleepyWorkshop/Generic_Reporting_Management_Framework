import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { clearRequestCacheMock } = vi.hoisted(() => ({
    clearRequestCacheMock: vi.fn(),
}));

vi.mock("../../engine/RequestCache", () => ({
    clearRequestCache: clearRequestCacheMock,
}));

import { AuthProvider, useAuth } from "../AuthContext";
import { parseAuthSessionSnapshot } from "../authService";

describe("authentication foundation", () => {
    beforeEach(() => clearRequestCacheMock.mockReset());

    it("starts unresolved and invalidates report data when identity changes", () => {
        const wrapper = ({ children }: { children: ReactNode }) => (
            <AuthProvider enabled={false}>{children}</AuthProvider>
        );
        const { result } = renderHook(() => useAuth(), { wrapper });

        expect(result.current.state).toEqual({ status: "loading", user: null });

        act(() => result.current.applySessionSnapshot({
            authenticated: true,
            user: { username: "admin", backendRole: "system-administrator", frontendAccess: true, frontendRole: "application-administrator" },
        }));
        expect(result.current.state).toEqual({
            status: "authenticated",
            user: { username: "admin", backendRole: "system-administrator", frontendAccess: true, frontendRole: "application-administrator" },
        });
        expect(clearRequestCacheMock).toHaveBeenCalledTimes(1);

        act(() => result.current.applySessionSnapshot({
            authenticated: true,
            user: { username: "admin", backendRole: "system-administrator", frontendAccess: true, frontendRole: "application-administrator" },
        }));
        expect(clearRequestCacheMock).toHaveBeenCalledTimes(1);

        act(() => result.current.applySessionSnapshot({ authenticated: false, user: null }));
        expect(result.current.state).toEqual({ status: "unauthenticated", user: null });
        expect(clearRequestCacheMock).toHaveBeenCalledTimes(2);
    });

    it("accepts only a minimal backend session shape", () => {
        expect(parseAuthSessionSnapshot({
            authenticated: true,
            user: { username: "reporter", backendRole: null, frontendAccess: true, frontendRole: null },
        })).toEqual({
            authenticated: true,
            user: { username: "reporter", backendRole: null, frontendAccess: true, frontendRole: null },
        });
        expect(() => parseAuthSessionSnapshot({
            authenticated: true,
            user: { username: "reporter", backendRole: null, frontendAccess: true, frontendRole: null, passwordHash: "secret" },
        })).toThrow("invalid authentication response");
        expect(parseAuthSessionSnapshot({ authenticated: false, user: null })).toEqual({
            authenticated: false,
            user: null,
        });
    });
});
