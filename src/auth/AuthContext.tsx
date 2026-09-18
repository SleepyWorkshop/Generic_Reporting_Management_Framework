import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

import { clearRequestCache } from "../engine/RequestCache";
import { subscribeToAuthenticationRequired } from "../api/client";
import { getRequestErrorMessage, isRequestAbort } from "../api/request";
import { getCurrentSession, login as loginRequest, logout as logoutRequest } from "./authService";
import type { AuthSessionSnapshot, AuthState } from "./authTypes";

interface AuthContextValue {
    state: AuthState;
    error: string | null;
    beginSessionCheck: () => void;
    applySessionSnapshot: (snapshot: AuthSessionSnapshot) => void;
    refreshSession: () => Promise<void>;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const loadingState: AuthState = { status: "loading", user: null };
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
    const [state, setState] = useState<AuthState>(loadingState);
    const [error, setError] = useState<string | null>(null);
    const stateRef = useRef<AuthState>(loadingState);
    const mounted = useRef(true);

    const updateState = useCallback((next: AuthState) => {
        if (identityKey(stateRef.current) !== identityKey(next)) {
            clearRequestCache();
        }
        stateRef.current = next;
        setState(next);
    }, []);

    const beginSessionCheck = useCallback(() => {
        setError(null);
        stateRef.current = loadingState;
        setState(loadingState);
    }, []);

    const applySessionSnapshot = useCallback((snapshot: AuthSessionSnapshot) => {
        setError(null);
        updateState(snapshot.authenticated
            ? { status: "authenticated", user: snapshot.user }
            : { status: "unauthenticated", user: null });
    }, [updateState]);

    const refreshSession = useCallback(async () => {
        beginSessionCheck();
        try {
            const snapshot = await getCurrentSession();
            if (mounted.current) applySessionSnapshot(snapshot);
        } catch (requestError: unknown) {
            if (mounted.current) {
                setError(getRequestErrorMessage(requestError, "Unable to restore your session."));
                updateState({ status: "unauthenticated", user: null });
            }
        }
    }, [applySessionSnapshot, beginSessionCheck, updateState]);

    useEffect(() => {
        if (!enabled) return;
        return subscribeToAuthenticationRequired(() => {
            applySessionSnapshot({ authenticated: false, user: null });
        });
    }, [enabled, applySessionSnapshot]);

    useEffect(() => {
        mounted.current = true;
        if (!enabled) return () => { mounted.current = false; };

        const controller = new AbortController();
        void getCurrentSession(controller.signal).then(snapshot => {
            if (mounted.current) applySessionSnapshot(snapshot);
        }).catch((requestError: unknown) => {
            if (!isRequestAbort(requestError) && mounted.current) {
                setError(getRequestErrorMessage(requestError, "Unable to restore your session."));
                updateState({ status: "unauthenticated", user: null });
            }
        });
        return () => {
            mounted.current = false;
            controller.abort();
        };
    }, [enabled, applySessionSnapshot, updateState]);

    const login = useCallback(async (username: string, password: string) => {
        const snapshot = await loginRequest(username, password);
        if (!snapshot.authenticated) {
            throw new Error("The API did not establish an authenticated session.");
        }
        if (mounted.current) applySessionSnapshot(snapshot);
    }, [applySessionSnapshot]);

    const logout = useCallback(async () => {
        const snapshot = await logoutRequest();
        if (snapshot.authenticated) {
            throw new Error("The API did not end the authenticated session.");
        }
        if (mounted.current) applySessionSnapshot(snapshot);
    }, [applySessionSnapshot]);

    const value = useMemo(() => ({
        state,
        error,
        beginSessionCheck,
        applySessionSnapshot,
        refreshSession,
        login,
        logout,
    }), [state, error, beginSessionCheck, applySessionSnapshot, refreshSession, login, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function identityKey(state: AuthState): string {
    return state.status === "authenticated"
        ? `authenticated:${state.user.username}:${String(state.user.isAdmin)}`
        : state.status;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }
    return context;
}
