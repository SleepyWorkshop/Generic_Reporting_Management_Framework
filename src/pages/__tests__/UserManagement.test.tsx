import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
    listUsers: vi.fn(),
    createUser: vi.fn(),
    enableUser: vi.fn(),
    disableUser: vi.fn(),
    deleteUser: vi.fn(),
    changeUserPassword: vi.fn(),
    updateUsername: vi.fn(),
    assignFrontendAuthorization: vi.fn(),
}));
const authMock = vi.hoisted(() => ({
    user: { username: "Admin", backendRole: "system-administrator" as "system-administrator" | null, frontendAccess: true, frontendRole: "application-administrator" as "application-administrator" | null },
}));

vi.mock("../../auth", async importOriginal => ({
    ...await importOriginal<typeof import("../../auth")>(),
    useAuth: () => ({
        state: { status: "authenticated", user: authMock.user },
        error: null,
    }),
}));
vi.mock("../../auth/authService", async importOriginal => ({
    ...await importOriginal<typeof import("../../auth/authService")>(),
    ...serviceMocks,
}));

import { ApiClientError } from "../../api/client";
import UserManagement from "../UserManagement";

const users = [
    { username: "Admin", enabled: true, backendRole: "system-administrator" as const, frontendAccess: true as const, frontendRole: "application-administrator" as const, backendProtected: true },
    { username: "Operator", enabled: true, backendRole: "data-operator" as const, frontendAccess: true as const, frontendRole: null, backendProtected: false },
    { username: "Disabled.User", enabled: false, backendRole: "read-only" as const, frontendAccess: true as const, frontendRole: null, backendProtected: false },
];

function renderPage() {
    serviceMocks.listUsers.mockResolvedValue(users);
    return render(<MemoryRouter><UserManagement /></MemoryRouter>);
}

function rowFor(username: string) {
    return within(screen.getByRole("row", { name: new RegExp(`^${username}(?: \\(you\\))? `) }));
}

describe("User Management", () => {
    beforeEach(() => {
        Object.values(serviceMocks).forEach(mock => mock.mockReset());
        authMock.user = { username: "Admin", backendRole: "system-administrator", frontendAccess: true, frontendRole: "application-administrator" };
    });

    it("renders only safe user details and prevents current-user deletion", async () => {
        renderPage();
        await screen.findByText("Operator");
        expect(screen.getByRole("heading", { name: "Frontend User Management" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
        const superAdminRow = rowFor("Admin");
        expect(superAdminRow.getAllByText("Backend Managed").length).toBeGreaterThan(0);
        expect(superAdminRow.queryByRole("button")).toBeNull();
        expect(screen.queryByText(/passwordHash|sessionId/i)).toBeNull();
    });

    it("offers every allowed create role and never offers a Super Admin role", async () => {
        renderPage();
        await screen.findByText("Operator");
        const role = screen.getByLabelText("Role") as HTMLSelectElement;
        expect(Array.from(role.options).map(option => option.text)).toEqual(["Admin", "Data Operator", "Read Only"]);
        expect(screen.queryByRole("option", { name: "Super Admin" })).toBeNull();
        expect(screen.queryByRole("option", { name: "System Administrator" })).toBeNull();
    });

    it("does not expose frontend management actions for a Super Admin row", async () => {
        renderPage();
        await screen.findByText("Operator");
        const row = rowFor("Admin");
        for (const action of ["Remove Admin", "Remove access", "Disable", "Delete", "Demote"]) {
            expect(row.queryByRole("button", { name: action })).toBeNull();
        }
        expect(row.getByText("Super Admin")).toBeTruthy();
        expect(row.getAllByText("Backend Managed").length).toBeGreaterThan(0);
    });

    it("hides self-management actions from an application Admin", async () => {
        authMock.user = { username: "Application.Admin", backendRole: null, frontendAccess: true, frontendRole: "application-administrator" };
        serviceMocks.listUsers.mockResolvedValue([
            { username: "Application.Admin", enabled: true, backendRole: null, frontendAccess: true, frontendRole: "application-administrator", backendProtected: false },
        ]);
        render(<MemoryRouter><UserManagement /></MemoryRouter>);
        await screen.findByText("Application.Admin (you)");
        const row = rowFor("Application.Admin");
        expect(row.getByText("Protected Admin")).toBeTruthy();
        expect(row.queryByRole("button")).toBeNull();
    });

    it("validates and creates a user, then refreshes the list", async () => {
        renderPage();
        await screen.findByText("Operator");
        fireEvent.click(screen.getByRole("button", { name: "Create user" }));
        expect(screen.getByRole("alert").textContent).toBe("Username is required.");
        expect(serviceMocks.createUser).not.toHaveBeenCalled();

        serviceMocks.createUser.mockResolvedValue({ username: "New.User", enabled: true, backendRole: "read-only", frontendAccess: true, frontendRole: null, backendProtected: false });
        fireEvent.change(screen.getByLabelText("Username"), { target: { value: " New.User " } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "new-user-password" } });
        fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "new-user-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Create user" }));

        await waitFor(() => expect(serviceMocks.createUser).toHaveBeenCalledWith({
            username: "New.User",
            password: "new-user-password",
            passwordConfirmation: "new-user-password",
            role: "read-only",
        }));
        await waitFor(() => expect(serviceMocks.listUsers).toHaveBeenCalledTimes(2));
    });

    it("shows a safe duplicate-user error", async () => {
        serviceMocks.createUser.mockRejectedValue(new ApiClientError("User already exists.", 409, {
            code: "USER_ALREADY_EXISTS",
            details: [],
        }));
        renderPage();
        await screen.findByText("Operator");
        fireEvent.change(screen.getByLabelText("Username"), { target: { value: "Operator" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "another-password" } });
        fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "another-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Create user" }));
        expect((await screen.findByRole("alert")).textContent).toBe("User already exists.");
    });

    it("enables, disables, and deletes users through the auth service", async () => {
        serviceMocks.enableUser.mockResolvedValue(users[2]);
        serviceMocks.disableUser.mockResolvedValue(users[1]);
        serviceMocks.deleteUser.mockResolvedValue(users[1]);
        renderPage();
        await screen.findByText("Operator");

        fireEvent.click(rowFor("Operator").getByRole("button", { name: "Disable" }));
        await waitFor(() => expect(serviceMocks.disableUser).toHaveBeenCalledWith("Operator"));
        fireEvent.click(rowFor("Disabled.User").getByRole("button", { name: "Enable" }));
        await waitFor(() => expect(serviceMocks.enableUser).toHaveBeenCalledWith("Disabled.User"));
        fireEvent.click(rowFor("Operator").getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(serviceMocks.deleteUser).toHaveBeenCalledWith("Operator"));
    });

    it("grants and removes frontend access through the server contract", async () => {
        serviceMocks.assignFrontendAuthorization.mockResolvedValue(users[1]);
        renderPage();
        await screen.findByText("Operator");

        fireEvent.click(rowFor("Operator").getByRole("button", { name: "Remove access" }));
        await waitFor(() => expect(serviceMocks.assignFrontendAuthorization).toHaveBeenCalledWith("Operator", false, null));
    });

    it("changes a user password without rendering it", async () => {
        serviceMocks.changeUserPassword.mockResolvedValue(users[1]);
        renderPage();
        await screen.findByText("Operator");
        fireEvent.click(rowFor("Operator").getByRole("button", { name: "Change password" }));

        const card = screen.getByRole("heading", { name: "Change password for Operator" }).closest("section")!;
        fireEvent.change(within(card).getByLabelText("New password"), {
            target: { value: "replacement-password" },
        });
        fireEvent.change(within(card).getByLabelText("Confirm password"), {
            target: { value: "replacement-password" },
        });
        fireEvent.click(within(card).getByRole("button", { name: "Change password" }));
        await waitFor(() => expect(serviceMocks.changeUserPassword)
            .toHaveBeenCalledWith("Operator", "replacement-password", "replacement-password"));
        expect(screen.queryByText("replacement-password")).toBeNull();
    });
});
