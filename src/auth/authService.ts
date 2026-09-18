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
    const response = await executeRequest({ action: "auth.users.list" }, { signal });
    return response.data.map(parseManagedUser);
}

export async function createUser(request: CreateUserRequest): Promise<ManagedAuthUser> {
    const response = await executeRequest({
        action: "auth.users.create",
        username: request.username,
        password: request.password,
        isAdmin: request.isAdmin,
    });
    return parseManagedUserResult(response.data);
}

export async function enableUser(username: string): Promise<ManagedAuthUser> {
    return userMutation("auth.users.enable", username);
}

export async function disableUser(username: string): Promise<ManagedAuthUser> {
    return userMutation("auth.users.disable", username);
}

export async function deleteUser(username: string): Promise<ManagedAuthUser> {
    return userMutation("auth.users.delete", username);
}

export async function changeUserPassword(
    username: string,
    newPassword: string
): Promise<ManagedAuthUser> {
    const response = await executeRequest({
        action: "auth.users.changePassword",
        username,
        newPassword,
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
        || Object.keys(value).some(key => !["username", "enabled", "isAdmin"].includes(key))
        || !("username" in value) || typeof value.username !== "string" || value.username.trim() === ""
        || !("enabled" in value) || typeof value.enabled !== "boolean"
        || !("isAdmin" in value) || typeof value.isAdmin !== "boolean") {
        throw new Error("The API returned an invalid user response.");
    }
    return { username: value.username, enabled: value.enabled, isAdmin: value.isAdmin };
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
        || Object.keys(value.user).some(key => key !== "username" && key !== "isAdmin")
        || !("username" in value.user) || typeof value.user.username !== "string"
        || value.user.username.trim() === ""
        || !("isAdmin" in value.user) || typeof value.user.isAdmin !== "boolean") {
        throw new Error("The API returned an invalid authentication response.");
    }

    return {
        authenticated: true,
        user: {
            username: value.user.username,
            isAdmin: value.user.isAdmin,
        },
    };
}
