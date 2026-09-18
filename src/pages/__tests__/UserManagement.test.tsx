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
}));

vi.mock("../../auth", async importOriginal => ({
    ...await importOriginal<typeof import("../../auth")>(),
    useAuth: () => ({
        state: { status: "authenticated", user: { username: "Admin", isAdmin: true } },
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
    { username: "Admin", enabled: true, isAdmin: true },
    { username: "Operator", enabled: true, isAdmin: false },
    { username: "Disabled.User", enabled: false, isAdmin: false },
];

function renderPage() {
    serviceMocks.listUsers.mockResolvedValue(users);
    return render(<MemoryRouter><UserManagement /></MemoryRouter>);
}

function rowFor(username: string) {
    return within(screen.getByRole("row", { name: new RegExp(`^${username}(?: \\(you\\))? `) }));
}

describe("User Management", () => {
    beforeEach(() => Object.values(serviceMocks).forEach(mock => mock.mockReset()));

    it("renders only safe user details and prevents current-user deletion", async () => {
        renderPage();
        await screen.findByText("Operator");
        expect(screen.getByRole("heading", { name: "User Management" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
        expect((rowFor("Admin").getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByText(/passwordHash|sessionId/i)).toBeNull();
    });

    it("validates and creates a user, then refreshes the list", async () => {
        renderPage();
        await screen.findByText("Operator");
        fireEvent.click(screen.getByRole("button", { name: "Create user" }));
        expect(screen.getByRole("alert").textContent).toBe("Username is required.");
        expect(serviceMocks.createUser).not.toHaveBeenCalled();

        serviceMocks.createUser.mockResolvedValue({ username: "New.User", enabled: true, isAdmin: false });
        fireEvent.change(screen.getByLabelText("Username"), { target: { value: " New.User " } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "new-user-password" } });
        fireEvent.click(screen.getByRole("button", { name: "Create user" }));

        await waitFor(() => expect(serviceMocks.createUser).toHaveBeenCalledWith({
            username: "New.User",
            password: "new-user-password",
            isAdmin: false,
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

    it("changes a user password without rendering it", async () => {
        serviceMocks.changeUserPassword.mockResolvedValue(users[1]);
        renderPage();
        await screen.findByText("Operator");
        fireEvent.click(rowFor("Operator").getByRole("button", { name: "Change password" }));

        const card = screen.getByRole("heading", { name: "Change password for Operator" }).closest("section")!;
        fireEvent.change(within(card).getByLabelText("New password"), {
            target: { value: "replacement-password" },
        });
        fireEvent.click(within(card).getByRole("button", { name: "Change password" }));
        await waitFor(() => expect(serviceMocks.changeUserPassword)
            .toHaveBeenCalledWith("Operator", "replacement-password"));
        expect(screen.queryByText("replacement-password")).toBeNull();
    });
});
