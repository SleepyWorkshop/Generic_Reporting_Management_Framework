import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { getRequestErrorMessage, isRequestAbort } from "../api/request";
import { useAuth, type ManagedAuthUser } from "../auth";
import {
    changeUserPassword,
    createUser,
    deleteUser,
    disableUser,
    enableUser,
    listUsers,
} from "../auth/authService";
import ErrorState from "../components/Common/Error";
import Loading from "../components/Common/Loading";

const MINIMUM_PASSWORD_LENGTH = 12;

export default function UserManagement() {
    const { state: authentication } = useAuth();
    const currentUsername = authentication.status === "authenticated" ? authentication.user.username : "";
    const [users, setUsers] = useState<ManagedAuthUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyUser, setBusyUser] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [passwordTarget, setPasswordTarget] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const loadUsers = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            setUsers(await listUsers(signal));
            setError("");
        } catch (requestError: unknown) {
            if (!isRequestAbort(requestError)) {
                setError(getRequestErrorMessage(requestError, "Unable to load users."));
            }
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void listUsers(controller.signal).then(result => {
            setUsers(result);
            setError("");
            setLoading(false);
        }).catch((requestError: unknown) => {
            if (!isRequestAbort(requestError)) {
                setError(getRequestErrorMessage(requestError, "Unable to load users."));
                setLoading(false);
            }
        });
        return () => controller.abort();
    }, []);

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedUsername = username.trim();
        if (!normalizedUsername) return setError("Username is required.");
        if (password.length < MINIMUM_PASSWORD_LENGTH) {
            return setError(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
        }
        setBusyUser("create");
        setError("");
        try {
            await createUser({ username: normalizedUsername, password, isAdmin });
            setUsername("");
            setPassword("");
            setIsAdmin(false);
            await loadUsers();
        } catch (requestError: unknown) {
            setError(getRequestErrorMessage(requestError, "Unable to create user."));
        } finally {
            setBusyUser("");
        }
    };

    const runMutation = async (target: string, operation: () => Promise<unknown>) => {
        setBusyUser(target);
        setError("");
        try {
            await operation();
            await loadUsers();
        } catch (requestError: unknown) {
            setError(getRequestErrorMessage(requestError, "Unable to update user."));
        } finally {
            setBusyUser("");
        }
    };

    const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (newPassword.length < MINIMUM_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
            return;
        }
        await runMutation(passwordTarget, () => changeUserPassword(passwordTarget, newPassword));
        setPasswordTarget("");
        setNewPassword("");
    };

    return (
        <main className="user-management-page">
            <header className="user-management-header">
                <div>
                    <nav className="settings-breadcrumb" aria-label="Breadcrumb">
                        <Link to="/settings">Settings</Link>
                        <span aria-hidden="true">/</span>
                        <span aria-current="page">User Management</span>
                    </nav>
                    <h1>User Management</h1>
                    <p>Create and manage application accounts.</p>
                </div>
            </header>

            <section className="user-management-card" aria-labelledby="create-user-title">
                <h2 id="create-user-title">Create user</h2>
                <form className="user-create-form" onSubmit={event => void handleCreate(event)} noValidate>
                    <label>
                        Username
                        <input value={username} maxLength={64} autoComplete="off"
                            onChange={event => setUsername(event.target.value)} disabled={busyUser === "create"} />
                    </label>
                    <label>
                        Password
                        <input type="password" value={password} minLength={MINIMUM_PASSWORD_LENGTH}
                            autoComplete="new-password" onChange={event => setPassword(event.target.value)}
                            disabled={busyUser === "create"} />
                    </label>
                    <label className="user-create-form__checkbox">
                        <input type="checkbox" checked={isAdmin} onChange={event => setIsAdmin(event.target.checked)}
                            disabled={busyUser === "create"} />
                        Administrator
                    </label>
                    <button className="app-button app-button--primary" type="submit" disabled={busyUser === "create"}>
                        {busyUser === "create" ? "Creating…" : "Create user"}
                    </button>
                </form>
            </section>

            {error && <div className="user-management-error" role="alert">{error}</div>}

            <section className="user-management-card" aria-labelledby="users-title">
                <div className="user-management-section-heading">
                    <h2 id="users-title">Users</h2>
                    <button className="app-button" type="button" onClick={() => void loadUsers()} disabled={loading}>Refresh</button>
                </div>
                {loading && users.length === 0 ? <Loading label="Loading users…" /> : null}
                {!loading && error && users.length === 0
                    ? <ErrorState title="Unable to load users" message={error} onRetry={() => void loadUsers()} />
                    : null}
                {users.length > 0 && (
                    <div className="user-table-shell">
                        <table className="user-table">
                            <thead><tr><th>Username</th><th>Status</th><th>Admin</th><th>Actions</th></tr></thead>
                            <tbody>
                            {users.map(user => {
                                const isCurrent = user.username.toLowerCase() === currentUsername.toLowerCase();
                                const busy = busyUser.toLowerCase() === user.username.toLowerCase();
                                return (
                                    <tr key={user.username}>
                                        <td>{user.username}{isCurrent ? " (you)" : ""}</td>
                                        <td><span className={user.enabled ? "user-status is-enabled" : "user-status"}>
                                            {user.enabled ? "Enabled" : "Disabled"}
                                        </span></td>
                                        <td>{user.isAdmin ? "Yes" : "No"}</td>
                                        <td><div className="user-actions">
                                            <button className="app-button" type="button" disabled={busy}
                                                onClick={() => void runMutation(user.username, () => user.enabled
                                                    ? disableUser(user.username) : enableUser(user.username))}>
                                                {user.enabled ? "Disable" : "Enable"}
                                            </button>
                                            <button className="app-button" type="button" disabled={busy}
                                                onClick={() => { setPasswordTarget(user.username); setNewPassword(""); setError(""); }}>
                                                Change password
                                            </button>
                                            <button className="app-button user-action--danger" type="button"
                                                disabled={busy || isCurrent}
                                                title={isCurrent ? "You cannot delete your current account." : undefined}
                                                onClick={() => void runMutation(user.username, () => deleteUser(user.username))}>
                                                Delete
                                            </button>
                                        </div></td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {passwordTarget && (
                <section className="user-management-card password-change-card" aria-labelledby="change-password-title">
                    <h2 id="change-password-title">Change password for {passwordTarget}</h2>
                    <form className="password-change-form" onSubmit={event => void handlePasswordChange(event)} noValidate>
                        <label>
                            New password
                            <input type="password" value={newPassword} minLength={MINIMUM_PASSWORD_LENGTH}
                                autoComplete="new-password" onChange={event => setNewPassword(event.target.value)} />
                        </label>
                        <div className="user-actions">
                            <button className="app-button app-button--primary" type="submit">Change password</button>
                            <button className="app-button" type="button" onClick={() => setPasswordTarget("")}>Cancel</button>
                        </div>
                    </form>
                </section>
            )}
        </main>
    );
}
