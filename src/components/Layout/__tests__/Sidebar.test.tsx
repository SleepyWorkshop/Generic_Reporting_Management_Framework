import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import Sidebar from "../Sidebar";
import type { NavigationItem } from "../../../types/navigation";
import { AuthProvider, useAuth } from "../../../auth";

const { logoutMock } = vi.hoisted(() => ({ logoutMock: vi.fn() }));

vi.mock("../../../auth/authService", async importOriginal => ({
    ...await importOriginal<typeof import("../../../auth/authService")>(),
    logout: logoutMock,
}));

const items: NavigationItem[] = [
    { id: "dashboard", title: "Dashboard", icon: "dashboard", route: "/" },
    {
        id: "reports", title: "Reports", icon: "reports", children: [
            { id: "customer", title: "Customer Report", icon: "report", reportId: "customer" },
            { id: "item", title: "Item Report", icon: "report", reportId: "item" },
        ],
    },
    { id: "settings", title: "Settings", icon: "settings", route: "/settings" },
];

function renderSidebar() {
    return render(
        <AuthProvider enabled={false}>
            <MemoryRouter><Sidebar items={items} /></MemoryRouter>
        </AuthProvider>
    );
}

function AuthenticatedSidebar({ isAdmin }: { isAdmin: boolean }) {
    const { applySessionSnapshot } = useAuth();
    return (
        <>
            <button type="button" onClick={() => applySessionSnapshot({
                authenticated: true,
                user: { username: "User", backendRole: isAdmin ? "system-administrator" : null, frontendAccess: true, frontendRole: isAdmin ? "application-administrator" : null },
            })}>Authenticate</button>
            <MemoryRouter><Sidebar items={items} /></MemoryRouter>
        </>
    );
}

describe("Sidebar", () => {
    beforeEach(() => {
        localStorage.clear();
        logoutMock.mockReset();
        logoutMock.mockResolvedValue({ authenticated: false, user: null });
    });

    it("renders branding and nested report navigation", () => {
        renderSidebar();
        expect(screen.getAllByText("Generic Reporting Framework")).toHaveLength(2);
        fireEvent.click(screen.getByRole("button", { name: "Reports" }));
        expect(screen.getByRole("link", { name: "Customer Report" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Item Report" })).toBeTruthy();
    });

    it("keeps labels mounted while collapsing the navigation", () => {
        const { container } = renderSidebar();
        fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
        expect(container.querySelector("nav")?.getAttribute("data-collapsed")).toBe("true");
        expect(screen.getByText("Dashboard")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Expand navigation" })).toBeTruthy();
    });

    it("closes mobile navigation after selecting a destination", () => {
        const { container } = renderSidebar();
        fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
        expect(container.querySelector("nav")?.getAttribute("data-mobile-open")).toBe("true");

        fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
        expect(container.querySelector("nav")?.getAttribute("data-mobile-open")).toBe("false");
    });

    it("closes mobile navigation from the backdrop and Escape key", () => {
        const { container } = renderSidebar();
        const open = screen.getByRole("button", { name: "Open navigation" });

        fireEvent.click(open);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(container.querySelector("nav")?.getAttribute("data-mobile-open")).toBe("false");

        fireEvent.click(open);
        fireEvent.click(container.querySelector(".app-sidebar-backdrop") as HTMLElement);
        expect(container.querySelector("nav")?.getAttribute("data-mobile-open")).toBe("false");
    });

    it("shows Settings to every user without exposing User Management directly", () => {
        const { rerender } = render(
            <AuthProvider enabled={false}><AuthenticatedSidebar isAdmin={false} /></AuthProvider>
        );
        fireEvent.click(screen.getByRole("button", { name: "Authenticate" }));
        expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "User Management" })).toBeNull();
        expect(screen.getByText("Application User")).toBeTruthy();

        rerender(<AuthProvider enabled={false}><AuthenticatedSidebar isAdmin /></AuthProvider>);
        fireEvent.click(screen.getByRole("button", { name: "Authenticate" }));
        expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
        expect(screen.queryByRole("link", { name: "User Management" })).toBeNull();
        expect(screen.getByText("Super Admin")).toBeTruthy();
    });

    it("logs out from the authenticated user area", async () => {
        render(<AuthProvider enabled={false}><AuthenticatedSidebar isAdmin /></AuthProvider>);
        fireEvent.click(screen.getByRole("button", { name: "Authenticate" }));
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

        await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull());
    });
});
