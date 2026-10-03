import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { getRequestErrorMessage, isRequestAbort } from "../api/request";
import { useAuth, type ManagedAuthUser } from "../auth";
import {
  assignFrontendAuthorization,
  changeUserPassword,
  createUser,
  deleteUser,
  disableUser,
  enableUser,
  listUsers,
  updateUserProfile,
} from "../auth/authService";
import ErrorState from "../components/Common/Error";
import Loading from "../components/Common/Loading";
import AccessibleDialog from "../components/Common/AccessibleDialog";
import {
  frontendCapabilities,
  getAssignableFrontendRoles,
  type FrontendCapabilities,
} from "../config/frontendCapabilities";

const MINIMUM_PASSWORD_LENGTH = 12;
type Modal = "create" | "edit" | "password" | null;

function UserDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <AccessibleDialog title={title} onClose={onClose} className="user-modal">
      {children}
    </AccessibleDialog>
  );
}

function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <span className="field-label">
      {children}{" "}
      <span className="field-required" aria-hidden="true">
        *
      </span>
    </span>
  );
}

const roleLabels = {
  "application-administrator": "Admin",
  "data-operator": "Data Operator",
  "read-only": "Read Only",
} as const;

export default function UserManagement({
  capabilities = frontendCapabilities,
}: {
  capabilities?: Readonly<FrontendCapabilities>;
}) {
  const { state: authentication } = useAuth();
  const currentUsername =
    authentication.status === "authenticated"
      ? authentication.user.username
      : "";
  const isSuperAdmin =
    authentication.status === "authenticated" &&
    authentication.user.backendRole === "system-administrator";
  const [users, setUsers] = useState<ManagedAuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [busyUser, setBusyUser] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [role, setRole] = useState<
    "read-only" | "data-operator" | "application-administrator"
  >("read-only");
  const [editTarget, setEditTarget] = useState<ManagedAuthUser | null>(null);
  const [editName, setEditName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [passwordTarget, setPasswordTarget] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const assignableRoles = getAssignableFrontendRoles(capabilities);

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      setUsers(await listUsers(signal));
      setError("");
    } catch (requestError: unknown) {
      if (!isRequestAbort(requestError))
        setError(getRequestErrorMessage(requestError, "Unable to load users."));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const task = window.setTimeout(() => void loadUsers(controller.signal), 0);
    return () => {
      window.clearTimeout(task);
      controller.abort();
    };
  }, [loadUsers]);

  const closeModal = () => {
    const closingModal = modal;
    setModal(null);
    setModalError("");
    setEditTarget(null);
    setPasswordTarget("");
    if (closingModal === "create")
      window.setTimeout(() => createButton.current?.focus(), 0);
  };

  const runMutation = async (
    target: string,
    operation: () => Promise<unknown>,
  ) => {
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

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");
    if (!name.trim()) return setModalError("Name is required.");
    if (!username.trim()) return setModalError("Username is required.");
    if (!/^\+?[0-9][0-9 ()-]{6,22}[0-9]$/.test(mobile.trim()))
      return setModalError("Mobile number is invalid.");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim()))
      return setModalError("Email is invalid.");
    if (password.length < MINIMUM_PASSWORD_LENGTH)
      return setModalError(
        `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      );
    if (!passwordConfirmation)
      return setModalError("Password confirmation is required.");
    if (password !== passwordConfirmation)
      return setModalError("Password confirmation does not match.");
    setBusyUser("create");
    try {
      await createUser({
        name: name.trim(),
        username: username.trim(),
        mobile: mobile.trim(),
        email: email.trim() || null,
        password,
        passwordConfirmation,
        role,
      });
      setName("");
      setUsername("");
      setMobile("");
      setEmail("");
      setPassword("");
      setPasswordConfirmation("");
      setRole("read-only");
      closeModal();
      await loadUsers();
    } catch (requestError: unknown) {
      setModalError(
        getRequestErrorMessage(requestError, "Unable to create user."),
      );
    } finally {
      setBusyUser("");
    }
  };

  const handleProfileEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) return;
    setModalError("");
    if (!editName.trim()) return setModalError("Name is required.");
    if (!newUsername.trim()) return setModalError("Username is required.");
    if (!/^\+?[0-9][0-9 ()-]{6,22}[0-9]$/.test(editMobile.trim()))
      return setModalError("Mobile number is invalid.");
    if (editEmail.trim() && !/^\S+@\S+\.\S+$/.test(editEmail.trim()))
      return setModalError("Email is invalid.");
    setBusyUser(editTarget.username);
    try {
      await updateUserProfile(
        editTarget.username,
        editName.trim(),
        newUsername.trim(),
        editMobile.trim(),
        editEmail.trim() || null,
      );
      closeModal();
      await loadUsers();
    } catch (requestError: unknown) {
      setModalError(
        getRequestErrorMessage(requestError, "Unable to update user."),
      );
    } finally {
      setBusyUser("");
    }
  };

  const openProfileEditor = (user: ManagedAuthUser) => {
    setEditTarget(user);
    setEditName(user.name ?? "");
    setNewUsername(user.username);
    setEditMobile(user.mobile ?? "");
    setEditEmail(user.email ?? "");
    setModalError("");
    setModal("edit");
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError("");
    if (newPassword.length < MINIMUM_PASSWORD_LENGTH)
      return setModalError(
        `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      );
    if (!newPasswordConfirmation)
      return setModalError("Password confirmation is required.");
    if (newPassword !== newPasswordConfirmation)
      return setModalError("Password confirmation does not match.");
    setBusyUser(passwordTarget);
    try {
      await changeUserPassword(
        passwordTarget,
        newPassword,
        newPasswordConfirmation,
      );
      setNewPassword("");
      setNewPasswordConfirmation("");
      closeModal();
      await loadUsers();
    } catch (requestError: unknown) {
      setModalError(
        getRequestErrorMessage(requestError, "Unable to change password."),
      );
    } finally {
      setBusyUser("");
    }
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
          <h1>Frontend User Management</h1>
          <p>
            Manage application access. Backend authorization is managed
            separately in the Backend Admin Console.
          </p>
        </div>
        <button
          ref={createButton}
          className="app-button app-button--primary"
          type="button"
          onClick={() => {
            setModalError("");
            setModal("create");
          }}
        >
          Create User
        </button>
      </header>
      {error && (
        <div className="user-management-error" role="alert">
          {error}
        </div>
      )}
      <section className="user-management-card" aria-labelledby="users-title">
        <div className="user-management-section-heading">
          <h2 id="users-title">Frontend users</h2>
          <button
            className="app-button"
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        {loading && users.length === 0 ? (
          <Loading label="Loading users…" />
        ) : null}
        {!loading && error && users.length === 0 ? (
          <ErrorState
            title="Unable to load users"
            message={error}
            onRetry={() => void loadUsers()}
          />
        ) : null}
        {!loading && !error && users.length === 0 ? (
          <div className="user-management-empty">No frontend users found.</div>
        ) : null}
        {users.length > 0 && (
          <div className="user-table-shell" tabIndex={0} aria-label="Frontend users">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Mobile Number</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const current =
                    user.username.toLowerCase() ===
                    currentUsername.toLowerCase();
                  const busy =
                    busyUser.toLowerCase() === user.username.toLowerCase();
                  const backendManaged =
                    user.backendRole === "system-administrator";
                  const displayedRole = backendManaged
                    ? "Super Admin"
                    : user.frontendRole === "application-administrator"
                      ? "Admin"
                      : "Read Only";
                  const applicationAdmin =
                    user.frontendRole === "application-administrator";
                  return (
                    <tr key={user.username}>
                      <td data-label="Name" className="user-profile-cell">
                        {user.name || "—"}
                      </td>
                      <td data-label="Username" className="user-profile-cell">
                        {user.username}
                        {current ? " (you)" : ""}
                      </td>
                      <td
                        data-label="Mobile Number"
                        className="user-profile-cell"
                      >
                        {user.mobile || "—"}
                      </td>
                      <td data-label="Email" className="user-profile-cell">
                        {user.email || "—"}
                      </td>
                      <td data-label="Status">
                        <span
                          className={
                            user.enabled
                              ? "user-status is-enabled"
                              : "user-status"
                          }
                        >
                          {user.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td data-label="Role" className="user-role-cell">
                        <span className="user-role">{displayedRole}</span>
                      </td>
                      <td data-label="Created" className="user-created">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td data-label="Actions" className="user-actions-cell">
                        <div className="user-actions">
                          {backendManaged ? (
                            <span className="user-protected">
                              Backend Managed
                            </span>
                          ) : (
                            <>
                              {isSuperAdmin &&
                                applicationAdmin &&
                                user.frontendAccess && (
                                  <button
                                    className="app-button"
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      void runMutation(user.username, () =>
                                        assignFrontendAuthorization(
                                          user.username,
                                          true,
                                          null,
                                        ),
                                      )
                                    }
                                  >
                                    Demote
                                  </button>
                                )}
                              {isSuperAdmin && !applicationAdmin && (
                                <button
                                  className="app-button"
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void runMutation(user.username, () =>
                                      assignFrontendAuthorization(
                                        user.username,
                                        true,
                                        "application-administrator",
                                      ),
                                    )
                                  }
                                >
                                  Make Admin
                                </button>
                              )}
                              <button
                                className="app-button"
                                type="button"
                                disabled={busy}
                                onClick={() => openProfileEditor(user)}
                              >
                                Edit User
                              </button>
                              {!current && (
                                <button
                                  className="app-button"
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void runMutation(user.username, () =>
                                      user.enabled
                                        ? disableUser(user.username)
                                        : enableUser(user.username),
                                    )
                                  }
                                >
                                  {user.enabled ? "Disable" : "Enable"}
                                </button>
                              )}
                              <button
                                className="app-button"
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setPasswordTarget(user.username);
                                  setNewPassword("");
                                  setNewPasswordConfirmation("");
                                  setModalError("");
                                  setModal("password");
                                }}
                              >
                                Change Password
                              </button>
                              {!current && (
                                <button
                                  className="app-button user-action--danger"
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void runMutation(user.username, () =>
                                      deleteUser(user.username),
                                    )
                                  }
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal === "create" && (
        <UserDialog title="Create User" onClose={closeModal}>
          <form
            className="user-modal-form"
            onSubmit={(event) => void handleCreate(event)}
            noValidate
          >
            <div className="user-modal-form__body">
            <label>
              <RequiredLabel>Name</RequiredLabel>
              <input
                value={name}
                maxLength={120}
                autoComplete="name"
                required
                onChange={(event) => setName(event.target.value)}
                disabled={busyUser === "create"}
              />
            </label>
            <label>
              <RequiredLabel>Username</RequiredLabel>
              <input
                value={username}
                maxLength={64}
                autoComplete="off"
                required
                onChange={(event) => setUsername(event.target.value)}
                disabled={busyUser === "create"}
              />
            </label>
            <label>
              <RequiredLabel>Mobile Number</RequiredLabel>
              <input
                value={mobile}
                maxLength={24}
                inputMode="tel"
                autoComplete="tel"
                required
                onChange={(event) => setMobile(event.target.value)}
                disabled={busyUser === "create"}
              />
            </label>
            <label>
              <span className="field-label">
                Email <span className="field-optional">(optional)</span>
              </span>
              <input
                type="email"
                value={email}
                maxLength={254}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                disabled={busyUser === "create"}
              />
            </label>
            <label>
              <RequiredLabel>Role</RequiredLabel>
              <select
                value={role}
                required
                onChange={(event) => setRole(event.target.value as typeof role)}
                disabled={busyUser === "create"}
              >
                {assignableRoles.map((assignableRole) => (
                  <option key={assignableRole} value={assignableRole}>
                    {roleLabels[assignableRole]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <RequiredLabel>Password</RequiredLabel>
              <input
                type="password"
                value={password}
                minLength={MINIMUM_PASSWORD_LENGTH}
                autoComplete="new-password"
                required
                onChange={(event) => setPassword(event.target.value)}
                disabled={busyUser === "create"}
              />
            </label>
            <label>
              <RequiredLabel>Confirm Password</RequiredLabel>
              <input
                type="password"
                value={passwordConfirmation}
                minLength={MINIMUM_PASSWORD_LENGTH}
                autoComplete="new-password"
                required
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)
                }
                disabled={busyUser === "create"}
              />
            </label>
            {modalError && (
              <p className="user-modal__error" role="alert">
                {modalError}
              </p>
            )}
            </div>
            <div className="user-modal__actions">
              <button className="app-button" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="app-button app-button--primary"
                type="submit"
                disabled={busyUser === "create"}
              >
                {busyUser === "create" ? "Creating…" : "Create User"}
              </button>
            </div>
          </form>
        </UserDialog>
      )}
      {modal === "edit" && editTarget && (
        <UserDialog title="Edit User" onClose={closeModal}>
          <form
            className="user-modal-form"
            onSubmit={(event) => void handleProfileEdit(event)}
            noValidate
          >
            <div className="user-modal-form__body">
            <label>
              <RequiredLabel>Name</RequiredLabel>
              <input
                value={editName}
                maxLength={120}
                required
                onChange={(event) => setEditName(event.target.value)}
              />
            </label>
            <label>
              <RequiredLabel>Username</RequiredLabel>
              <input
                value={newUsername}
                maxLength={64}
                required
                onChange={(event) => setNewUsername(event.target.value)}
              />
            </label>
            <label>
              <RequiredLabel>Mobile Number</RequiredLabel>
              <input
                value={editMobile}
                maxLength={24}
                inputMode="tel"
                required
                onChange={(event) => setEditMobile(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">
                Email <span className="field-optional">(optional)</span>
              </span>
              <input
                type="email"
                value={editEmail}
                maxLength={254}
                onChange={(event) => setEditEmail(event.target.value)}
              />
            </label>
            {modalError && (
              <p className="user-modal__error" role="alert">
                {modalError}
              </p>
            )}
            </div>
            <div className="user-modal__actions">
              <button className="app-button" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="app-button app-button--primary"
                type="submit"
                disabled={busyUser === editTarget.username}
              >
                Save User
              </button>
            </div>
          </form>
        </UserDialog>
      )}
      {modal === "password" && (
        <UserDialog
          title={`Change Password for ${passwordTarget}`}
          onClose={closeModal}
        >
          <form
            className="user-modal-form"
            onSubmit={(event) => void handlePasswordChange(event)}
            noValidate
          >
            <div className="user-modal-form__body">
            <label>
              <RequiredLabel>New Password</RequiredLabel>
              <input
                type="password"
                value={newPassword}
                minLength={MINIMUM_PASSWORD_LENGTH}
                autoComplete="new-password"
                required
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              <RequiredLabel>Confirm Password</RequiredLabel>
              <input
                type="password"
                value={newPasswordConfirmation}
                minLength={MINIMUM_PASSWORD_LENGTH}
                autoComplete="new-password"
                required
                onChange={(event) =>
                  setNewPasswordConfirmation(event.target.value)
                }
              />
            </label>
            {modalError && (
              <p className="user-modal__error" role="alert">
                {modalError}
              </p>
            )}
            </div>
            <div className="user-modal__actions">
              <button className="app-button" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="app-button app-button--primary"
                type="submit"
                disabled={busyUser === passwordTarget}
              >
                Change Password
              </button>
            </div>
          </form>
        </UserDialog>
      )}
    </main>
  );
}
