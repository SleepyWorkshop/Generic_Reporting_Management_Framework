import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { getRequestErrorMessage } from "../api/request";
import { ApiClientError } from "../api/client";
import { useAuth } from "../auth";
import { APPLICATION_VERSION } from "../config/version";
import AccessibleDialog from "../components/Common/AccessibleDialog";

function loginErrorMessage(error: unknown): string {
    const fallback = getRequestErrorMessage(error, "Unable to sign in.");
    if (!(error instanceof ApiClientError)) return fallback;
    const detail = error.details.find(value => typeof value === "object");
    if (!detail || typeof detail === "string") return fallback;
    if (error.code === "LOGIN_RATE_LIMITED" && Number.isInteger(detail.retryAfterSeconds)) {
        const minutes = Math.max(1, Math.ceil((detail.retryAfterSeconds ?? 0) / 60));
        return `Too many unsuccessful login attempts. Please try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    }
    if (error.code === "INVALID_CREDENTIALS" && Number.isInteger(detail.attemptsRemaining)) {
        return `Invalid username or password. Attempts remaining: ${detail.attemptsRemaining}.`;
    }
    return fallback;
}

export default function Login() {
    const { login, error: sessionError } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showCredentialHelp, setShowCredentialHelp] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedUsername = username.trim();
        if (!normalizedUsername || !password) {
            setError("Username and password are required.");
            return;
        }

        setError("");
        setSubmitting(true);
        try {
            await login(normalizedUsername, password);
        } catch (requestError: unknown) {
            setError(loginErrorMessage(requestError));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="setup-page login-page">
            <section className="setup-card login-card" aria-labelledby="login-title">
                <div className="setup-card__heading">
                    <p className="setup-card__eyebrow">Generic Reporting Framework</p>
                    <p className="login-card__welcome">Welcome back</p>
                    <h1 id="login-title">Sign in</h1>
                    <p>Continue to your reporting workspace.</p>
                </div>

                <form className="setup-form" onSubmit={event => void handleSubmit(event)} noValidate>
                    <label htmlFor="login-username">
                        Username
                        <input
                            id="login-username"
                            name="username"
                            type="text"
                            autoComplete="username"
                            maxLength={64}
                            value={username}
                            onChange={event => setUsername(event.target.value)}
                            disabled={submitting}
                            autoFocus
                            required
                        />
                    </label>

                    <label htmlFor="login-password">
                        <span>Password</span>
                        <span className="login-password-field">
                            <input
                                id="login-password"
                                name="password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                value={password}
                                onChange={event => setPassword(event.target.value)}
                                disabled={submitting}
                                required
                            />
                            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} disabled={submitting} onClick={() => setShowPassword(value => !value)}>
                                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                            </button>
                        </span>
                    </label>

                    {(error || sessionError) && (
                        <p className="form-error" role="alert">{error || sessionError}</p>
                    )}

                    <button
                        type="submit"
                        className="app-button app-button--primary setup-form__submit"
                        disabled={submitting}
                    >
                        {submitting ? "Signing in…" : "Sign in"}
                    </button>
                    <button
                        type="button"
                        className="login-help-link"
                        disabled={submitting}
                        onClick={() => setShowCredentialHelp(true)}
                    >
                        Forgot username or password?
                    </button>
                </form>
            </section>
            <p className="login-page__version">V {APPLICATION_VERSION}</p>
            {showCredentialHelp && (
                <AccessibleDialog
                    title="Forgot Username or Password?"
                    className="login-help-dialog"
                    onClose={() => setShowCredentialHelp(false)}
                >
                    <div className="login-help-dialog__body">
                        <p>If you have forgotten your username or password, please contact your system administrator for assistance.</p>
                    </div>
                    <footer className="login-help-dialog__footer">
                        <button type="button" className="app-button app-button--primary" onClick={() => setShowCredentialHelp(false)}>
                            Close
                        </button>
                    </footer>
                </AccessibleDialog>
            )}
        </main>
    );
}
