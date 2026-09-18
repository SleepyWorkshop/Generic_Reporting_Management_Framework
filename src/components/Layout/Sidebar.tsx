import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileBarChart, FolderKanban, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, UserRound, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import menu from "../../config/menu.json";
import { getNavigationRoute, loadNavigation } from "../../engine/NavigationEngine";
import { getReportIds } from "../../engine/ReportEngine/reportLoader";
import { getDashboardIds } from "../../engine/DashboardEngine";
import type { NavigationIcon, NavigationItem } from "../../types/navigation";
import { useAuth } from "../../auth";

const SIDEBAR_STORAGE_KEY = "generic-report-sidebar-collapsed";
const REPORTS_STORAGE_KEY = "generic-report-sidebar-reports-expanded";
const configuredItems = loadNavigation(menu, {
    reportIds: getReportIds(),
    dashboardIds: getDashboardIds(),
});
const userManagementItem: NavigationItem = {
    id: "user-management",
    title: "User Management",
    icon: "settings",
    route: "/settings/users",
};
const icons: Record<NavigationIcon, typeof LayoutDashboard> = {
    dashboard: LayoutDashboard,
    reports: FolderKanban,
    report: FileBarChart,
    settings: Settings,
    user: UserRound,
};

export default function Sidebar({ items = configuredItems }: { items?: NavigationItem[] }) {
    const location = useLocation();
    const { state: authentication, logout } = useAuth();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [logoutError, setLogoutError] = useState("");
    const [loggingOut, setLoggingOut] = useState(false);
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
        } catch {
            return false;
        }
    });
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
        try {
            const stored = localStorage.getItem(REPORTS_STORAGE_KEY);
            return stored ? JSON.parse(stored) as Record<string, boolean> : {};
        } catch {
            return {};
        }
    });

    useEffect(() => {
        if (!mobileOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMobileOpen(false);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleEscape);
        };
    }, [mobileOpen]);

    const toggleCollapsed = () => {
        setCollapsed(previous => {
            const next = !previous;
            try {
                localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
            } catch {
                // Persistence is optional when storage is unavailable.
            }
            return next;
        });
    };

    const toggleGroup = (id: string, activeChild: boolean) => {
        setExpandedGroups(previous => {
            const next = {
                ...previous,
                [id]: !(previous[id] ?? activeChild),
            };
            try {
                localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(next));
            } catch {
                // Persistence is optional when storage is unavailable.
            }
            return next;
        });
    };

    const activateGroup = (id: string, activeChild: boolean) => {
        if (mobileOpen || !collapsed) {
            toggleGroup(id, activeChild);
            return;
        }

        setCollapsed(false);
        setExpandedGroups(previous => {
            const next = { ...previous, [id]: true };
            try {
                localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");
                localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(next));
            } catch {
                // Persistence is optional when storage is unavailable.
            }
            return next;
        });
    };

    const navigationItems = authentication.status === "authenticated" && authentication.user.isAdmin
        ? [...items, userManagementItem]
        : items;
    const visibleItems = navigationItems
        .filter(item => item.visible !== false)
        .filter(item => !item.children || item.children.some(child => child.visible !== false));

    const handleLogout = async () => {
        setLogoutError("");
        setLoggingOut(true);
        try {
            await logout();
        } catch {
            setLogoutError("Unable to sign out. Please try again.");
        } finally {
            setLoggingOut(false);
        }
    };

    return (
        <>
        <header className="mobile-app-header">
            <button
                type="button"
                className="mobile-app-header__menu"
                aria-label="Open navigation"
                aria-expanded={mobileOpen}
                aria-controls="primary-navigation"
                onClick={() => setMobileOpen(true)}
            >
                <Menu aria-hidden="true" />
            </button>
            <strong>Generic Reporting Framework</strong>
        </header>

        <button
            type="button"
            className="app-sidebar-backdrop"
            data-open={mobileOpen}
            aria-label="Close navigation"
            aria-hidden={!mobileOpen}
            tabIndex={mobileOpen ? 0 : -1}
            onClick={() => setMobileOpen(false)}
        />

        <nav
            className="app-sidebar"
            id="primary-navigation"
            data-collapsed={collapsed}
            data-mobile-open={mobileOpen}
            aria-label="Primary navigation"
        >

            <div className="app-sidebar__header">
                <div className="app-sidebar__brand">
                    <span className="app-sidebar__brand-name"><strong>Generic Reporting Framework</strong></span>
                </div>

                <button
                    type="button"
                    className="app-sidebar__toggle"
                    onClick={toggleCollapsed}
                    aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
                    aria-expanded={!collapsed}
                    aria-controls="primary-navigation-links"
                >
                    {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
                </button>

                <button
                    type="button"
                    className="app-sidebar__mobile-close"
                    onClick={() => setMobileOpen(false)}
                    aria-label="Close navigation"
                >
                    <X aria-hidden="true" />
                </button>
            </div>

            <div className="app-sidebar__links" id="primary-navigation-links">

            {visibleItems.map(item => {
                const Icon = icons[item.icon];
                const visibleChildren = item.children?.filter(child => child.visible !== false) ?? [];
                const childRoutes = visibleChildren.map(getNavigationRoute);
                const activeChild = childRoutes.includes(location.pathname);
                const groupExpanded = expandedGroups[item.id] ?? activeChild;
                const showChildren = (mobileOpen || !collapsed) && groupExpanded;
                const route = getNavigationRoute(item);

                return <div key={item.id} className="app-sidebar__section">

                    {route && (
                        <NavLink
                            to={route}
                            end={route === "/"}
                            title={collapsed && !mobileOpen ? item.title : undefined}
                            className={({ isActive }) => isActive ? "is-active" : undefined}
                            onClick={() => setMobileOpen(false)}
                        >
                            <Icon aria-hidden="true" />
                            <span className="app-sidebar__label" aria-hidden={collapsed && !mobileOpen || undefined}>{item.title}</span>
                        </NavLink>
                    )}

                    {item.children && (

                        <>

                            <button
                                type="button"
                                className="app-sidebar__group"
                                title={collapsed && !mobileOpen ? item.title : undefined}
                                aria-expanded={(mobileOpen || !collapsed) && groupExpanded}
                                aria-controls={`navigation-group-${item.id}`}
                                onClick={() => activateGroup(item.id, activeChild)}
                            >
                                <Icon aria-hidden="true" />
                                <span className="app-sidebar__label" aria-hidden={collapsed && !mobileOpen || undefined}>{item.title}</span>
                                {groupExpanded
                                    ? <ChevronDown className="app-sidebar__chevron" aria-hidden="true" />
                                    : <ChevronRight className="app-sidebar__chevron" aria-hidden="true" />}
                            </button>

                            <div
                                className="app-sidebar__children-shell"
                                id={`navigation-group-${item.id}`}
                                data-expanded={showChildren}
                                aria-hidden={!showChildren}
                            >
                                <div className="app-sidebar__children">
                                {visibleChildren.map(child => {
                                    const ChildIcon = icons[child.icon];
                                    const childRoute = getNavigationRoute(child);

                                    return childRoute ? <NavLink
                                            key={child.id}
                                            to={childRoute}
                                            tabIndex={showChildren ? undefined : -1}
                                        className={({ isActive }) => isActive ? "is-active app-sidebar__child" : "app-sidebar__child"}
                                        onClick={() => setMobileOpen(false)}
                                        >
                                            <ChildIcon aria-hidden="true" />
                                            <span className="app-sidebar__label">{child.title}</span>
                                        </NavLink> : null;

                                })}
                                </div>
                            </div>

                        </>

                    )}

                </div>;

            })}
            </div>

            {authentication.status === "authenticated" && (
                <div className="app-sidebar__account">
                    <div className="app-sidebar__identity" title={authentication.user.username}>
                        <UserRound aria-hidden="true" />
                        <span className="app-sidebar__label">{authentication.user.username}</span>
                    </div>
                    <button
                        type="button"
                        className="app-sidebar__logout"
                        title={collapsed && !mobileOpen ? "Sign out" : undefined}
                        aria-label="Sign out"
                        disabled={loggingOut}
                        onClick={() => void handleLogout()}
                    >
                        <LogOut aria-hidden="true" />
                        <span className="app-sidebar__label">{loggingOut ? "Signing out…" : "Sign out"}</span>
                    </button>
                    {logoutError && <p className="app-sidebar__account-error" role="alert">{logoutError}</p>}
                </div>
            )}

        </nav>
        </>

    );

}
