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

import { getRequestErrorMessage, isRequestAbort } from "../api/request";
import { getSetupStatus } from "./setupService";
import type { SetupState } from "./setupTypes";

interface SetupContextValue {
    state: SetupState;
    refresh: () => Promise<void>;
}

const SetupContext = createContext<SetupContextValue | undefined>(undefined);

export function SetupProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SetupState>({ status: "loading", error: null });
    const mounted = useRef(true);

    const loadStatus = useCallback(async (signal?: AbortSignal) => {
        try {
            const initialized = await getSetupStatus(signal);
            if (mounted.current) {
                setState(initialized
                    ? { status: "complete", error: null }
                    : { status: "required", error: null });
            }
        } catch (error: unknown) {
            if (!isRequestAbort(error) && mounted.current) {
                setState({
                    status: "error",
                    error: getRequestErrorMessage(error, "Unable to check application setup."),
                });
            }
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        const controller = new AbortController();
        void getSetupStatus(controller.signal).then(initialized => {
            if (mounted.current) {
                setState(initialized
                    ? { status: "complete", error: null }
                    : { status: "required", error: null });
            }
        }).catch((error: unknown) => {
            if (!isRequestAbort(error) && mounted.current) {
                setState({
                    status: "error",
                    error: getRequestErrorMessage(error, "Unable to check application setup."),
                });
            }
        });
        return () => {
            mounted.current = false;
            controller.abort();
        };
    }, []);

    const refresh = useCallback(async () => {
        setState({ status: "loading", error: null });
        await loadStatus();
    }, [loadStatus]);

    const value = useMemo(() => ({
        state,
        refresh,
    }), [state, refresh]);

    return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSetup(): SetupContextValue {
    const context = useContext(SetupContext);
    if (!context) {
        throw new Error("useSetup must be used inside SetupProvider");
    }
    return context;
}
