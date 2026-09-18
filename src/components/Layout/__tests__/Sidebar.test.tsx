import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import Sidebar from "../Sidebar";
import type { NavigationItem } from "../../../types/navigation";
import { AuthProvider, useAuth } from "../../../auth";

const items: NavigationItem[] = [
    { id: "dashboard", title: "Dashboard", icon: "dashboard", route: "/" },
    {
        id: "reports", title: "Reports", icon: "reports", children: [
            { id: "customer", title: "Customer Report", icon: "report", reportId: "customer" },
            { id: "item", title: "Item Report", icon: "report", reportId: "item" },
        ],
    },
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
                user: { username: "User", isAdmin },
            })}>Authenticate</button>
            <MemoryRouter><Sidebar items={items} /></MemoryRouter>
        </>
    );
}

describe("Sidebar", () => {
    beforeEach(() => localStorage.clear());

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

    it("shows user management only to administrators", () => {
        const { rerender } = render(
            <AuthProvider enabled={false}><AuthenticatedSidebar isAdmin={false} /></AuthProvider>
        );
        fireEvent.click(screen.getByRole("button", { name: "Authenticate" }));
        expect(screen.queryByRole("link", { name: "User Management" })).toBeNull();

        rerender(<AuthProvider enabled={false}><AuthenticatedSidebar isAdmin /></AuthProvider>);
        fireEvent.click(screen.getByRole("button", { name: "Authenticate" }));
        expect(screen.getByRole("link", { name: "User Management" })).toBeTruthy();
    });
});
