import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRequestMock } = vi.hoisted(() => ({ executeRequestMock: vi.fn() }));

vi.mock("../../api/request", async importOriginal => ({
    ...await importOriginal<typeof import("../../api/request")>(),
    executeRequest: executeRequestMock,
}));
vi.mock("../../pages/Dashboard", () => ({ default: () => <div>Dashboard</div> }));
vi.mock("../../pages/DashboardViewer", () => ({ default: () => <div>Dashboard</div> }));
vi.mock("../../pages/ReportViewer", () => ({ default: () => <div>Report</div> }));

import { AuthProvider } from "../../auth";
import { ApplicationRoutes } from "../../router/AppRouter";
import { SetupProvider, useSetup } from "../../setup";

function response(data: Record<string, unknown>) {
    return {
        success: true,
        message: "OK",
        data: [data],
        meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
    };
}

function Providers({ children }: { children: ReactNode }) {
    const { state } = useSetup();
    return <AuthProvider enabled={state.status === "complete"}>{children}</AuthProvider>;
}

describe("Settings application integration", () => {
    beforeEach(() => {
        executeRequestMock.mockReset();
        localStorage.clear();
        sessionStorage.clear();
    });

    it("restores Settings and returns to login after sidebar logout", async () => {
        executeRequestMock
            .mockResolvedValueOnce(response({ initialized: true }))
            .mockResolvedValueOnce(response({
                authenticated: true,
                user: { username: "Administrator", backendRole: "system-administrator", frontendAccess: true, frontendRole: "application-administrator" },
            }))
            .mockResolvedValueOnce(response({ authenticated: false, user: null }));

        render(
            <SetupProvider>
                <Providers>
                    <MemoryRouter initialEntries={["/settings"]}>
                        <ApplicationRoutes />
                    </MemoryRouter>
                </Providers>
            </SetupProvider>
        );

        expect(await screen.findByRole("heading", { name: "Settings" })).not.toBeNull();
        expect(screen.getByRole("link", { name: "Settings" })).not.toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect(await screen.findByRole("heading", { name: "Sign in" })).not.toBeNull();
        expect(executeRequestMock.mock.calls[2][0]).toEqual({ action: "auth.logout" });
        expect(localStorage.getItem("authenticated")).toBeNull();
        expect(sessionStorage.length).toBe(0);
        expect(document.body.textContent).not.toMatch(/passwordHash|sessionId/i);
    });
});
