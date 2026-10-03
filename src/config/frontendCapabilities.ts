export interface FrontendCapabilities {
    read: boolean;
    write: boolean;
    userManagement: boolean;
}

export type AssignableFrontendRole = "read-only" | "data-operator" | "application-administrator";

export const frontendCapabilities: Readonly<FrontendCapabilities> = Object.freeze({
    read: true,
    write: false,
    userManagement: true,
});

export function getAssignableFrontendRoles(
    capabilities: Readonly<FrontendCapabilities> = frontendCapabilities
): AssignableFrontendRole[] {
    const roles: AssignableFrontendRole[] = [];
    if (capabilities.userManagement) roles.push("application-administrator");
    if (capabilities.write) roles.push("data-operator");
    if (capabilities.read) roles.push("read-only");
    return roles;
}
