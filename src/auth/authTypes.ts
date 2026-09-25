export interface AuthUser {
    username: string;
    backendRole: "read-only" | "data-operator" | "system-administrator" | null;
    frontendAccess: boolean;
    frontendRole: "application-administrator" | null;
}

export interface ManagedAuthUser {
    name: string | null;
    username: string;
    mobile: string | null;
    email: string | null;
    enabled: boolean;
    backendRole: "read-only" | "data-operator" | "system-administrator" | null;
    frontendAccess: boolean;
    frontendRole: "application-administrator" | null;
    backendProtected: boolean;
    createdAt: string;
}

export interface CreateUserRequest {
    name: string;
    username: string;
    mobile: string;
    email: string | null;
    password: string;
    passwordConfirmation: string;
    role: "read-only" | "data-operator" | "application-administrator";
}

export type UserManagementRequest =
    | { action: "auth.frontendUsers.list" }
    | { action: "auth.frontendUsers.create"; name: string; username: string; mobile: string; email: string | null; password: string; passwordConfirmation: string; role: "read-only" | "data-operator" | "application-administrator" }
    | { action: "auth.frontendUsers.update"; username: string; name: string; newUsername: string; mobile: string; email: string | null }
    | { action: "auth.frontendUsers.enable" | "auth.frontendUsers.disable" | "auth.frontendUsers.delete"; username: string }
    | { action: "auth.frontendUsers.changePassword"; username: string; newPassword: string; passwordConfirmation: string }
    | { action: "auth.frontendUsers.assignRole"; username: string; frontendAccess: boolean; frontendRole: "application-administrator" | null };

export type UserManagementResponse = ManagedAuthUser[];

export type AuthState =
    | { status: "loading"; user: null }
    | { status: "unauthenticated"; user: null }
    | { status: "authenticated"; user: AuthUser };

export type AuthSessionSnapshot =
    | { authenticated: false; user: null }
    | { authenticated: true; user: AuthUser };
