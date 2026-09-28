import { fireEvent, render, screen, within } from "@testing-library/react";
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
vi.mock("../../pages/Dashboard", () => ({ default: () => <div>Dashboard application</div> }));
vi.mock("../../pages/DashboardViewer", () => ({ default: () => <div>Dashboard application</div> }));
vi.mock("../../pages/ReportViewer", () => ({ default: () => <div>Report application</div> }));

import { ApplicationRoutes } from "../../router/AppRouter";
import { ApiClientError } from "../../api/client";
import { SetupProvider, useSetup } from "../SetupContext";
import { AuthProvider } from "../../auth";

function setupResponse(initialized: boolean) {
    return {
        success: true,
        message: "OK",
        data: [{ initialized }],
        meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
    };
}

function sessionResponse(authenticated = false) {
    return {
        success: true,
        message: "OK",
        data: [authenticated
            ? { authenticated: true, user: { username: "admin", backendRole: "system-administrator", frontendAccess: true, frontendRole: "application-administrator" } }
            : { authenticated: false, user: null }],
        meta: { page: null, pageSize: null, totalRows: 1, rowsReturned: 1, executionTime: null },
    };
}

function SetupAwareAuth({ children }: { children: React.ReactNode }) {
    const { state } = useSetup();
    return <AuthProvider enabled={state.status === "complete"}>{children}</AuthProvider>;
}

function renderFlow(path = "/") {
    return render(
        <SetupProvider>
            <SetupAwareAuth>
                <MemoryRouter initialEntries={[path]}>
                    <ApplicationRoutes />
                </MemoryRouter>
            </SetupAwareAuth>
        </SetupProvider>
    );
}

describe("first-time setup flow", () => {
    beforeEach(() => executeRequestMock.mockReset());

    it("routes an uninitialized installation to the setup page", async () => {
        executeRequestMock.mockResolvedValue(setupResponse(false));
        renderFlow("/report/item");
        expect(await screen.findByRole("heading", { name: "User setup is required." })).not.toBeNull();
        expect(screen.getByText("Please complete user setup in the Backend Admin Console.")).not.toBeNull();
        expect(screen.queryByRole("form")).toBeNull();
        expect(executeRequestMock).toHaveBeenCalledTimes(1);
        expect(executeRequestMock).not.toHaveBeenCalledWith(expect.objectContaining({ action: "setup.createAdmin" }), expect.anything());
    });

    it.each(["/settings", "/settings/users"])(
        "keeps Settings behind first-time setup: %s",
        async path => {
            executeRequestMock.mockResolvedValue(setupResponse(false));
            renderFlow(path);
            expect(await screen.findByRole("heading", { name: "User setup is required." })).not.toBeNull();
        }
    );

    it("does not show setup after initialization", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse());
        renderFlow("/setup");
        expect(await screen.findByRole("heading", { name: "Sign in" })).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "User setup is required." })).toBeNull();
    });

    it("validates empty login credentials without sending them", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse());
        renderFlow("/login");
        await screen.findByRole("heading", { name: "Sign in" });

        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        expect((await screen.findByRole("alert")).textContent).toBe("Username and password are required.");
        expect(executeRequestMock).toHaveBeenCalledTimes(2);
    });

    it("logs in and enters the application", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse())
            .mockResolvedValueOnce(sessionResponse(true));
        renderFlow("/login");
        await screen.findByRole("heading", { name: "Sign in" });

        fireEvent.change(screen.getByLabelText("Username"), { target: { value: " Administrator " } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "private-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByText("Dashboard application")).not.toBeNull();
        expect(executeRequestMock.mock.calls[2][0]).toEqual({
            action: "auth.login",
            username: "Administrator",
            password: "private-password",
        });
    });

    it("shows the generic backend error when login fails", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse())
            .mockRejectedValueOnce(new ApiClientError("Invalid username or password.", 401, {
                code: "INVALID_CREDENTIALS",
                details: [],
            }));
        renderFlow("/login");
        await screen.findByRole("heading", { name: "Sign in" });

        fireEvent.change(screen.getByLabelText("Username"), { target: { value: "Administrator" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

        expect((await screen.findByRole("alert")).textContent).toBe("Invalid username or password.");
    });

    it("shows safe attempt and lockout feedback supplied by the backend", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse())
            .mockRejectedValueOnce(new ApiClientError("Invalid username or password.", 401, {
                code: "INVALID_CREDENTIALS",
                details: [{ attemptsRemaining: 3, locked: false }],
            }))
            .mockRejectedValueOnce(new ApiClientError("Too many unsuccessful login attempts.", 429, {
                code: "LOGIN_RATE_LIMITED",
                details: [{ locked: true, retryAfterSeconds: 840 }],
            }));
        renderFlow("/login");
        await screen.findByRole("heading", { name: "Sign in" });
        fireEvent.change(screen.getByLabelText("Username"), { target: { value: "Administrator" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        expect((await screen.findByRole("alert")).textContent).toBe("Invalid username or password. Attempts remaining: 3.");
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        expect((await screen.findByRole("alert")).textContent).toBe("Too many unsuccessful login attempts. Please try again in 14 minutes.");
    });

    it("opens accessible forgot-credentials help and restores the login page", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse());
        renderFlow("/login");
        await screen.findByRole("heading", { name: "Sign in" });
        fireEvent.click(screen.getByRole("button", { name: "Forgot username or password?" }));
        const dialog = screen.getByRole("dialog", { name: "Forgot Username or Password?" });
        expect(within(dialog).getByText(/contact your system administrator/i)).not.toBeNull();
        expect(document.body.style.overflow).toBe("hidden");
        fireEvent.click(dialog.querySelector(".login-help-dialog__footer button") as HTMLButtonElement);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.body.style.overflow).toBe("");
    });
});
