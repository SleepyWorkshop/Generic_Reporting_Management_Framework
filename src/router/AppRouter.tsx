import { BrowserRouter, Navigate, Outlet, Routes, Route } from "react-router-dom";

import Layout from "../components/Layout/Layout";

import Dashboard from "../pages/Dashboard";
import ReportViewer from "../pages/ReportViewer";
import DashboardViewer from "../pages/DashboardViewer";
import Setup from "../pages/Setup";
import Login from "../pages/Login";
import UserManagement from "../pages/UserManagement";
import Settings from "../pages/Settings";
import ErrorState from "../components/Common/Error";
import Loading from "../components/Common/Loading";
import menu from "../config/menu.json";
import { getDashboardIds } from "../engine/DashboardEngine";
import { getFirstDashboardRoute, loadNavigation } from "../engine/NavigationEngine";
import { getReportIds } from "../engine/ReportEngine/reportLoader";
import { useSetup } from "../setup";
import { useAuth } from "../auth";

const homeRoute = getFirstDashboardRoute(loadNavigation(menu, {
    reportIds: getReportIds(),
    dashboardIds: getDashboardIds(),
}));

export default function AppRouter() {
    return (
        <BrowserRouter>
            <ApplicationRoutes />
        </BrowserRouter>
    );
}

export function ApplicationRoutes() {
    const { state, refresh } = useSetup();

    if (state.status === "loading") {
        return <div className="setup-page"><Loading label="Checking application setup…" /></div>;
    }
    if (state.status === "error") {
        return (
            <div className="setup-page">
                <ErrorState
                    title="Unable to check application setup"
                    message={state.error}
                    onRetry={() => void refresh()}
                />
            </div>
        );
    }
    if (state.status === "required") {
        return (
            <Routes>
                <Route path="/setup" element={<Setup />} />
                <Route path="*" element={<Navigate to="/setup" replace />} />
            </Routes>
        );
    }

    return (
        <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route element={<ProtectedRoute />}>
                <Route path="/setup" element={<Navigate to="/" replace />} />
                <Route element={<Layout />}>
                    <Route
                        path="/"
                        element={homeRoute
                            ? <Navigate to={homeRoute} replace />
                            : <Dashboard dashboardId="item-dashboard" />}
                    />

                    <Route
                        path="/dashboard/:dashboardId"
                        element={<DashboardViewer />}
                    />

                    <Route
                        path="/report/:reportId"
                        element={<ReportViewer />}
                    />

                    <Route path="/settings" element={<Settings />} />

                    <Route element={<AdminRoute />}>
                        <Route path="/settings/users" element={<UserManagement />} />
                    </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

function ProtectedRoute() {
    const { state } = useAuth();
    if (state.status === "loading") {
        return <div className="setup-page"><Loading label="Restoring your session…" /></div>;
    }
    if (state.status === "unauthenticated") {
        return <Navigate to="/login" replace />;
    }
    return <Outlet />;
}

function LoginRoute() {
    const { state } = useAuth();
    if (state.status === "loading") {
        return <div className="setup-page"><Loading label="Restoring your session…" /></div>;
    }
    return state.status === "authenticated" ? <Navigate to="/" replace /> : <Login />;
}

function AdminRoute() {
    const { state } = useAuth();
    if (state.status !== "authenticated") {
        return <Navigate to="/login" replace />;
    }
    return state.user.isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
