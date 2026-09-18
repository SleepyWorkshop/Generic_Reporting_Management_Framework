export interface AuthUser {
    username: string;
    isAdmin: boolean;
}

export interface ManagedAuthUser {
    username: string;
    enabled: boolean;
    isAdmin: boolean;
}

export interface CreateUserRequest {
    username: string;
    password: string;
    isAdmin: boolean;
}

export type UserManagementRequest =
    | { action: "auth.users.list" }
    | { action: "auth.users.create"; username: string; password: string; isAdmin: boolean }
    | { action: "auth.users.enable" | "auth.users.disable" | "auth.users.delete"; username: string }
    | { action: "auth.users.changePassword"; username: string; newPassword: string };

export type UserManagementResponse = ManagedAuthUser[];

export type AuthState =
    | { status: "loading"; user: null }
    | { status: "unauthenticated"; user: null }
    | { status: "authenticated"; user: AuthUser };

export type AuthSessionSnapshot =
    | { authenticated: false; user: null }
    | { authenticated: true; user: AuthUser };
