import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
            ? { authenticated: true, user: { username: "admin", isAdmin: true } }
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

async function completeForm(password = "a-secure-password") {
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: " First.Admin " } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: password } });
    fireEvent.click(screen.getByRole("button", { name: "Create Administrator" }));
}

describe("first-time setup flow", () => {
    beforeEach(() => executeRequestMock.mockReset());

    it("routes an uninitialized installation to the setup page", async () => {
        executeRequestMock.mockResolvedValue(setupResponse(false));
        renderFlow("/report/item");
        expect(await screen.findByRole("heading", { name: "Application setup" })).not.toBeNull();
    });

    it.each(["/settings", "/settings/users"])(
        "keeps Settings behind first-time setup: %s",
        async path => {
            executeRequestMock.mockResolvedValue(setupResponse(false));
            renderFlow(path);
            expect(await screen.findByRole("heading", { name: "Application setup" })).not.toBeNull();
        }
    );

    it("does not show setup after initialization", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse());
        renderFlow("/setup");
        expect(await screen.findByRole("heading", { name: "Sign in" })).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "Application setup" })).toBeNull();
    });

    it("submits the first administrator and transitions to login", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(false))
            .mockResolvedValueOnce(setupResponse(true))
            .mockResolvedValueOnce(sessionResponse());
        renderFlow("/setup");
        await screen.findByRole("heading", { name: "Application setup" });
        await completeForm();

        await waitFor(() => expect(executeRequestMock).toHaveBeenCalledTimes(3));
        expect(executeRequestMock.mock.calls[1][0]).toEqual({
            action: "setup.createAdmin",
            username: "First.Admin",
            password: "a-secure-password",
            passwordConfirmation: "a-secure-password",
        });
        expect(await screen.findByRole("heading", { name: "Sign in" })).not.toBeNull();
    });

    it("rejects mismatched confirmation before sending the password", async () => {
        executeRequestMock.mockResolvedValue(setupResponse(false));
        renderFlow("/setup");
        await screen.findByRole("heading", { name: "Application setup" });

        fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-secure-password" } });
        fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "different-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Create Administrator" }));

        expect((await screen.findByRole("alert")).textContent).toContain("Password confirmation does not match.");
        expect(executeRequestMock).toHaveBeenCalledTimes(1);
    });

    it("shows a safe setup submission error", async () => {
        executeRequestMock
            .mockResolvedValueOnce(setupResponse(false))
            .mockRejectedValueOnce(new ApiClientError("Invalid setup request.", 400, {
                code: "INVALID_SETUP_REQUEST",
                details: [{ path: "username", message: "Username is invalid." }],
            }));
        renderFlow("/setup");
        await screen.findByRole("heading", { name: "Application setup" });
        await completeForm();
        expect((await screen.findByRole("alert")).textContent).toContain("Username is invalid.");
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
});
