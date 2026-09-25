import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import { getRequestErrorMessage } from "../api/request";
import { useAuth } from "../auth";
import { APPLICATION_VERSION } from "../config/version";

export default function Login() {
    const { login, error: sessionError } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

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
            setError(getRequestErrorMessage(requestError, "Unable to sign in."));
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
                </form>
            </section>
            <p className="login-page__version">V {APPLICATION_VERSION}</p>
        </main>
    );
}
