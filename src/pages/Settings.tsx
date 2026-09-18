import { ArrowRight, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth";

export default function Settings() {
    const { state } = useAuth();
    const isAdmin = state.status === "authenticated" && state.user.isAdmin;

    return (
        <main className="settings-page">
            <header className="settings-header">
                <p className="settings-eyebrow">Application</p>
                <h1>Settings</h1>
                <p>Manage application configuration and administration.</p>
            </header>

            {isAdmin ? (
                <section className="settings-grid" aria-label="Available settings">
                    <article className="settings-option">
                        <div className="settings-option__icon"><Users aria-hidden="true" /></div>
                        <div className="settings-option__content">
                            <h2>User Management</h2>
                            <p>Create and manage application users and administrator access.</p>
                        </div>
                        <Link className="settings-option__link" to="/settings/users">
                            Open User Management <ArrowRight aria-hidden="true" />
                        </Link>
                    </article>
                </section>
            ) : (
                <section className="settings-empty" aria-labelledby="settings-empty-title">
                    <h2 id="settings-empty-title">No settings are available for your account</h2>
                    <p>Additional settings will appear here when they are available to you.</p>
                </section>
            )}
        </main>
    );
}
