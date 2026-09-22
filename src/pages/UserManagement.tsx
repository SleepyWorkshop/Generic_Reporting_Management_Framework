import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getRequestErrorMessage, isRequestAbort } from "../api/request";
import { useAuth, type ManagedAuthUser } from "../auth";
import { assignFrontendRole, changeUserPassword, createUser, deleteUser, disableUser, enableUser, listUsers, updateUsername } from "../auth/authService";
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
    const [passwordConfirmation, setPasswordConfirmation] = useState("");
    const [applicationAdministrator, setApplicationAdministrator] = useState(false);
    const [editTarget, setEditTarget] = useState<ManagedAuthUser | null>(null);
    const [newUsername, setNewUsername] = useState("");
    const [passwordTarget, setPasswordTarget] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");

    const loadUsers = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try { setUsers(await listUsers(signal)); setError(""); }
        catch (requestError: unknown) { if (!isRequestAbort(requestError)) setError(getRequestErrorMessage(requestError, "Unable to load users.")); }
        finally { if (!signal?.aborted) setLoading(false); }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const task = window.setTimeout(() => void loadUsers(controller.signal), 0);
        return () => { window.clearTimeout(task); controller.abort(); };
    }, [loadUsers]);

    const runMutation = async (target: string, operation: () => Promise<unknown>) => {
        setBusyUser(target); setError("");
        try { await operation(); await loadUsers(); }
        catch (requestError: unknown) { setError(getRequestErrorMessage(requestError, "Unable to update user.")); }
        finally { setBusyUser(""); }
    };

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!username.trim()) return setError("Username is required.");
        if (password.length < MINIMUM_PASSWORD_LENGTH) return setError(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
        if (password !== passwordConfirmation) return setError("Password confirmation does not match.");
        setBusyUser("create"); setError("");
        try {
            await createUser({ username: username.trim(), password, passwordConfirmation, frontendRole: applicationAdministrator ? "application-administrator" : null });
            setUsername(""); setPassword(""); setPasswordConfirmation(""); setApplicationAdministrator(false); await loadUsers();
        } catch (requestError: unknown) { setError(getRequestErrorMessage(requestError, "Unable to create user.")); }
        finally { setBusyUser(""); }
    };

    const handleRename = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); if (!editTarget || !newUsername.trim()) return;
        await runMutation(editTarget.username, () => updateUsername(editTarget.username, newUsername.trim())); setEditTarget(null);
    };

    const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (newPassword.length < MINIMUM_PASSWORD_LENGTH) return setError(`Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
        if (newPassword !== newPasswordConfirmation) return setError("Password confirmation does not match.");
        await runMutation(passwordTarget, () => changeUserPassword(passwordTarget, newPassword, newPasswordConfirmation));
        setPasswordTarget(""); setNewPassword(""); setNewPasswordConfirmation("");
    };

    return <main className="user-management-page">
        <header className="user-management-header"><div><nav className="settings-breadcrumb" aria-label="Breadcrumb"><Link to="/settings">Settings</Link><span aria-hidden="true">/</span><span aria-current="page">User Management</span></nav><h1>Frontend User Management</h1><p>Manage application access. Backend authorization is managed separately in the Backend Admin Console.</p></div></header>
        <section className="user-management-card" aria-labelledby="create-user-title"><h2 id="create-user-title">Create frontend user</h2><form className="user-create-form" onSubmit={event => void handleCreate(event)} noValidate>
            <label>Username<input value={username} maxLength={64} autoComplete="off" onChange={event => setUsername(event.target.value)} disabled={busyUser === "create"} /></label>
            <label>Password<input type="password" value={password} minLength={MINIMUM_PASSWORD_LENGTH} autoComplete="new-password" onChange={event => setPassword(event.target.value)} disabled={busyUser === "create"} /></label>
            <label>Confirm password<input type="password" value={passwordConfirmation} minLength={MINIMUM_PASSWORD_LENGTH} autoComplete="new-password" onChange={event => setPasswordConfirmation(event.target.value)} disabled={busyUser === "create"} /></label>
            <label className="user-create-form__checkbox"><input type="checkbox" checked={applicationAdministrator} onChange={event => setApplicationAdministrator(event.target.checked)} disabled={busyUser === "create"} />Application Administrator</label>
            <button className="app-button app-button--primary" type="submit" disabled={busyUser === "create"}>{busyUser === "create" ? "Creating…" : "Create user"}</button>
        </form></section>
        {error && <div className="user-management-error" role="alert">{error}</div>}
        <section className="user-management-card" aria-labelledby="users-title"><div className="user-management-section-heading"><h2 id="users-title">Frontend users</h2><button className="app-button" type="button" onClick={() => void loadUsers()} disabled={loading}>Refresh</button></div>
            {loading && users.length === 0 ? <Loading label="Loading users…" /> : null}
            {!loading && error && users.length === 0 ? <ErrorState title="Unable to load users" message={error} onRetry={() => void loadUsers()} /> : null}
            {users.length > 0 && <div className="user-table-shell"><table className="user-table"><thead><tr><th>Username</th><th>Status</th><th>Frontend role</th><th>Identity</th><th>Actions</th></tr></thead><tbody>{users.map(user => {
                const current = user.username.toLowerCase() === currentUsername.toLowerCase(); const busy = busyUser.toLowerCase() === user.username.toLowerCase();
                return <tr key={user.username}><td>{user.username}{current ? " (you)" : ""}</td><td><span className={user.enabled ? "user-status is-enabled" : "user-status"}>{user.enabled ? "Enabled" : "Disabled"}</span></td><td>{user.frontendRole === "application-administrator" ? "Application Administrator" : "Frontend Read"}</td><td>{user.backendProtected ? "Also managed by backend" : "Frontend only"}</td><td><div className="user-actions">
                    <button className="app-button" type="button" disabled={busy} onClick={() => void runMutation(user.username, () => assignFrontendRole(user.username, user.frontendRole ? null : "application-administrator"))}>{user.frontendRole ? "Remove admin" : "Make app admin"}</button>
                    <button className="app-button" type="button" disabled={busy || user.backendProtected} onClick={() => { setEditTarget(user); setNewUsername(user.username); }}>Edit username</button>
                    <button className="app-button" type="button" disabled={busy || user.backendProtected} onClick={() => void runMutation(user.username, () => user.enabled ? disableUser(user.username) : enableUser(user.username))}>{user.enabled ? "Disable" : "Enable"}</button>
                    <button className="app-button" type="button" disabled={busy || user.backendProtected} onClick={() => { setPasswordTarget(user.username); setNewPassword(""); setNewPasswordConfirmation(""); }}>Change password</button>
                    <button className="app-button user-action--danger" type="button" disabled={busy || current || user.backendProtected} onClick={() => void runMutation(user.username, () => deleteUser(user.username))}>Delete</button>
                </div></td></tr>;
            })}</tbody></table></div>}
        </section>
        {editTarget && <section className="user-management-card"><h2>Edit username</h2><form className="password-change-form" onSubmit={event => void handleRename(event)}><label>Username<input value={newUsername} maxLength={64} onChange={event => setNewUsername(event.target.value)} /></label><div className="user-actions"><button className="app-button app-button--primary">Save</button><button className="app-button" type="button" onClick={() => setEditTarget(null)}>Cancel</button></div></form></section>}
        {passwordTarget && <section className="user-management-card password-change-card"><h2>Change password for {passwordTarget}</h2><form className="password-change-form" onSubmit={event => void handlePasswordChange(event)} noValidate><label>New password<input type="password" value={newPassword} minLength={MINIMUM_PASSWORD_LENGTH} autoComplete="new-password" onChange={event => setNewPassword(event.target.value)} /></label><label>Confirm password<input type="password" value={newPasswordConfirmation} minLength={MINIMUM_PASSWORD_LENGTH} autoComplete="new-password" onChange={event => setNewPasswordConfirmation(event.target.value)} /></label><div className="user-actions"><button className="app-button app-button--primary" type="submit">Change password</button><button className="app-button" type="button" onClick={() => setPasswordTarget("")}>Cancel</button></div></form></section>}
    </main>;
}
