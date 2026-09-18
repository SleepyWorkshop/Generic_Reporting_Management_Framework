import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRequestMock } = vi.hoisted(() => ({ executeRequestMock: vi.fn() }));

vi.mock("../../api/request", async importOriginal => ({
    ...await importOriginal<typeof import("../../api/request")>(),
    executeRequest: executeRequestMock,
}));
vi.mock("../../components/Layout/Layout", () => ({
    default: () => <div data-testid="application-layout"><Outlet /></div>,
}));
vi.mock("../../pages/Dashboard", () => ({ default: () => <div>Dashboard route</div> }));
vi.mock("../../pages/DashboardViewer", () => ({ default: () => <div>Dashboard route</div> }));
vi.mock("../../pages/ReportViewer", () => ({ default: () => <div>Report route</div> }));

import { ApplicationRoutes } from "../../router/AppRouter";
import { SetupProvider, useSetup } from "../../setup";
import { AuthProvider } from "../AuthContext";

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

function renderRoute(path: string) {
    return render(
        <SetupProvider>
            <Providers>
                <MemoryRouter initialEntries={[path]}>
                    <ApplicationRoutes />
                </MemoryRouter>
            </Providers>
        </SetupProvider>
    );
}

function prepareSession(authenticated: boolean) {
    executeRequestMock
        .mockResolvedValueOnce(response({ initialized: true }))
        .mockResolvedValueOnce(response(authenticated
            ? { authenticated: true, user: { username: "Administrator", isAdmin: true } }
            : { authenticated: false, user: null }));
}

describe("protected application routes", () => {
    beforeEach(() => executeRequestMock.mockReset());

    it.each(["/", "/dashboard/item-dashboard", "/report/item"])(
        "redirects unauthenticated direct navigation to login: %s",
        async path => {
            prepareSession(false);
            renderRoute(path);
            expect(await screen.findByRole("heading", { name: "Sign in" })).not.toBeNull();
            expect(screen.queryByTestId("application-layout")).toBeNull();
        }
    );

    it("waits for session restoration without rendering login", async () => {
        executeRequestMock
            .mockResolvedValueOnce(response({ initialized: true }))
            .mockImplementationOnce(() => new Promise(() => undefined));
        renderRoute("/report/item");

        expect(await screen.findByText("Restoring your session…")).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    });

    it("allows authenticated users to open application routes", async () => {
        prepareSession(true);
        renderRoute("/report/item");
        expect(await screen.findByText("Report route")).not.toBeNull();
    });

    it("redirects an authenticated login visit into the application", async () => {
        prepareSession(true);
        renderRoute("/login");
        expect(await screen.findByTestId("application-layout")).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    });
});
