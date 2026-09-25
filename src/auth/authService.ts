import type { AuthSessionSnapshot, CreateUserRequest, ManagedAuthUser } from "./authTypes";
import { executeRequest } from "../api/request";

export async function getCurrentSession(signal?: AbortSignal): Promise<AuthSessionSnapshot> {
    const response = await executeRequest({ action: "auth.session" }, { signal });
    return parseSessionData(response.data);
}

export async function login(
    username: string,
    password: string,
    signal?: AbortSignal
): Promise<AuthSessionSnapshot> {
    const response = await executeRequest({ action: "auth.login", username, password }, { signal });
    return parseSessionData(response.data);
}

export async function logout(signal?: AbortSignal): Promise<AuthSessionSnapshot> {
    const response = await executeRequest({ action: "auth.logout" }, { signal });
    return parseSessionData(response.data);
}

export async function listUsers(signal?: AbortSignal): Promise<ManagedAuthUser[]> {
    const response = await executeRequest({ action: "auth.frontendUsers.list" }, { signal });
    return response.data.map(parseManagedUser);
}

export async function createUser(request: CreateUserRequest): Promise<ManagedAuthUser> {
    const response = await executeRequest({
        action: "auth.frontendUsers.create",
        name: request.name,
        username: request.username,
        mobile: request.mobile,
        email: request.email,
        password: request.password,
        passwordConfirmation: request.passwordConfirmation,
        role: request.role,
    });
    return parseManagedUserResult(response.data);
}

export async function enableUser(username: string): Promise<ManagedAuthUser> {
    return userMutation("auth.frontendUsers.enable", username);
}

export async function disableUser(username: string): Promise<ManagedAuthUser> {
    return userMutation("auth.frontendUsers.disable", username);
}

export async function deleteUser(username: string): Promise<ManagedAuthUser> {
    return userMutation("auth.frontendUsers.delete", username);
}

export async function updateUserProfile(username: string, name: string, newUsername: string, mobile: string, email: string | null): Promise<ManagedAuthUser> {
    const response = await executeRequest({ action: "auth.frontendUsers.update", username, name, newUsername, mobile, email });
    return parseManagedUserResult(response.data);
}

export async function assignFrontendAuthorization(username: string, frontendAccess: boolean, frontendRole: "application-administrator" | null): Promise<ManagedAuthUser> {
    const response = await executeRequest({ action: "auth.frontendUsers.assignRole", username, frontendAccess, frontendRole });
    return parseManagedUserResult(response.data);
}

export async function changeUserPassword(
    username: string,
    newPassword: string,
    passwordConfirmation: string
): Promise<ManagedAuthUser> {
    const response = await executeRequest({
        action: "auth.frontendUsers.changePassword",
        username,
        newPassword,
        passwordConfirmation,
    });
    return parseManagedUserResult(response.data);
}

async function userMutation(action: string, username: string): Promise<ManagedAuthUser> {
    const response = await executeRequest({ action, username });
    return parseManagedUserResult(response.data);
}

function parseManagedUserResult(data: Record<string, unknown>[]): ManagedAuthUser {
    if (data.length !== 1) {
        throw new Error("The API returned an invalid user response.");
    }
    return parseManagedUser(data[0]);
}

function parseManagedUser(value: unknown): ManagedAuthUser {
    if (typeof value !== "object" || value === null
        || Object.keys(value).some(key => !["name", "username", "mobile", "email", "enabled", "backendRole", "frontendAccess", "frontendRole", "backendProtected", "createdAt"].includes(key))
        || !("name" in value) || (value.name !== null && typeof value.name !== "string")
        || !("username" in value) || typeof value.username !== "string" || value.username.trim() === ""
        || !("mobile" in value) || (value.mobile !== null && typeof value.mobile !== "string")
        || !("email" in value) || (value.email !== null && typeof value.email !== "string")
        || !("enabled" in value) || typeof value.enabled !== "boolean"
        || !("backendRole" in value) || ![null, "read-only", "data-operator", "system-administrator"].includes(value.backendRole as string | null)
        || !("frontendAccess" in value) || typeof value.frontendAccess !== "boolean"
        || !("frontendRole" in value) || (value.frontendRole !== null && value.frontendRole !== "application-administrator")
        || (value.frontendAccess === false && value.frontendRole !== null)
        || !("backendProtected" in value) || typeof value.backendProtected !== "boolean"
        || !("createdAt" in value) || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) {
        throw new Error("The API returned an invalid user response.");
    }
    return { name: value.name, username: value.username, mobile: value.mobile, email: value.email, enabled: value.enabled, backendRole: value.backendRole as ManagedAuthUser["backendRole"], frontendAccess: value.frontendAccess, frontendRole: value.frontendRole, backendProtected: value.backendProtected, createdAt: value.createdAt };
}

function parseSessionData(data: Record<string, unknown>[]): AuthSessionSnapshot {
    if (data.length !== 1) {
        throw new Error("The API returned an invalid authentication response.");
    }
    return parseAuthSessionSnapshot(data[0]);
}

/** Validate the identity payload returned by a future backend session endpoint. */
export function parseAuthSessionSnapshot(value: unknown): AuthSessionSnapshot {
    if (typeof value !== "object" || value === null || !("authenticated" in value)) {
        throw new Error("The API returned an invalid authentication response.");
    }

    if (value.authenticated === false) {
        if (!("user" in value) || value.user !== null
            || Object.keys(value).some(key => key !== "authenticated" && key !== "user")) {
            throw new Error("The API returned an invalid authentication response.");
        }
        return { authenticated: false, user: null };
    }
    if (value.authenticated !== true || !("user" in value)
        || Object.keys(value).some(key => key !== "authenticated" && key !== "user")
        || typeof value.user !== "object" || value.user === null
        || Object.keys(value.user).some(key => !["username", "backendRole", "frontendAccess", "frontendRole"].includes(key))
        || !("username" in value.user) || typeof value.user.username !== "string"
        || value.user.username.trim() === ""
        || !("backendRole" in value.user) || ![null, "read-only", "data-operator", "system-administrator"].includes(value.user.backendRole as string | null)
        || !("frontendAccess" in value.user) || typeof value.user.frontendAccess !== "boolean"
        || !("frontendRole" in value.user) || ![null, "application-administrator"].includes(value.user.frontendRole as string | null)
        || (value.user.frontendAccess === false && value.user.frontendRole !== null)) {
        throw new Error("The API returned an invalid authentication response.");
    }

    return {
        authenticated: true,
        user: {
            username: value.user.username,
            backendRole: value.user.backendRole as "read-only" | "data-operator" | "system-administrator" | null,
            frontendAccess: value.user.frontendAccess,
            frontendRole: value.user.frontendRole as "application-administrator" | null,
        },
    };
}
