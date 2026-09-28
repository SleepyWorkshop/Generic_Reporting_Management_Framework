import { describe, expect, it } from "vitest";

import menu from "../../../config/menu.json";
import { getFirstDashboardRoute, getNavigationRoute, loadNavigation } from "..";

describe("NavigationEngine dashboard routing", () => {
    it("builds dashboard routes from configured dashboard IDs", () => {
        const navigation = loadNavigation(menu, {
            dashboardIds: ["item-dashboard", "sales-dashboard", "receipts-dashboard", "purchase-dashboard", "bill-dashboard"],
            reportIds: ["customer", "item"],
        });
        const dashboards = navigation.find(item => item.id === "dashboards")?.children ?? [];
        const item = dashboards.find(item => item.dashboardId === "item-dashboard")!;
        const bill = dashboards.find(item => item.dashboardId === "bill-dashboard")!;

        expect(getNavigationRoute(item)).toBe("/dashboard/item-dashboard");
        expect(getNavigationRoute(bill)).toBe("/dashboard/bill-dashboard");
        expect(getFirstDashboardRoute(navigation)).toBe("/dashboard/item-dashboard");
    });

    it("selects a nested visible dashboard without dashboard-specific conditions", () => {
        const navigation = loadNavigation([
            {
                id: "dashboards",
                title: "Dashboards",
                icon: "dashboard",
                children: [{
                    id: "inventory",
                    title: "Inventory",
                    icon: "dashboard",
                    dashboardId: "inventory-dashboard",
                }],
            },
        ], { dashboardIds: ["inventory-dashboard"] });

        expect(getFirstDashboardRoute(navigation)).toBe("/dashboard/inventory-dashboard");
    });
});
