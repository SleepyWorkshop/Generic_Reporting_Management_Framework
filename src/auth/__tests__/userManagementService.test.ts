import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRequestMock } = vi.hoisted(() => ({ executeRequestMock: vi.fn() }));

vi.mock("../../api/request", () => ({ executeRequest: executeRequestMock }));

import {
    assignFrontendAuthorization,
    changeUserPassword,
    createUser,
    deleteUser,
    disableUser,
    enableUser,
    listUsers,
    updateUserProfile,
} from "../authService";

const user = { name: "Data Operator", username: "Operator", mobile: "+15551234567", email: "operator@example.test", enabled: true, backendRole: "data-operator", frontendAccess: true, frontendRole: null, backendProtected: false, createdAt: "2026-01-01T00:00:00+00:00" };
const response = (data: Record<string, unknown>[]) => ({ success: true, message: "OK", data });

describe("user management auth service", () => {
    beforeEach(() => executeRequestMock.mockReset());

    it("lists and strictly validates safe users", async () => {
        executeRequestMock.mockResolvedValueOnce(response([user]));
        await expect(listUsers()).resolves.toEqual([user]);
        expect(executeRequestMock.mock.calls[0][0]).toEqual({ action: "auth.frontendUsers.list" });

        executeRequestMock.mockResolvedValueOnce(response([{ ...user, passwordHash: "unsafe" }]));
        await expect(listUsers()).rejects.toThrow("invalid user response");
    });

    it("sends the exact create-user contract", async () => {
        executeRequestMock.mockResolvedValueOnce(response([user]));
        await createUser({ name: "Read Only User", username: "Operator", mobile: "+15551234567", email: null, password: "private-password", passwordConfirmation: "private-password", role: "read-only" });
        expect(executeRequestMock.mock.calls[0][0]).toEqual({
            action: "auth.frontendUsers.create",
            name: "Read Only User",
            username: "Operator",
            mobile: "+15551234567",
            email: null,
            password: "private-password",
            passwordConfirmation: "private-password",
            role: "read-only",
        });
    });

    it("sends profile updates separately from password changes", async () => {
        executeRequestMock.mockResolvedValueOnce(response([user]));
        await updateUserProfile("Operator", "Updated Operator", "Updated.Operator", "+15557654321", null);
        expect(executeRequestMock.mock.calls[0][0]).toEqual({
            action: "auth.frontendUsers.update",
            username: "Operator",
            name: "Updated Operator",
            newUsername: "Updated.Operator",
            mobile: "+15557654321",
            email: null,
        });
    });

    it("sends enable, disable, delete, and password-change actions", async () => {
        executeRequestMock.mockResolvedValue(response([user]));
        await enableUser("Operator");
        await disableUser("Operator");
        await deleteUser("Operator");
        await changeUserPassword("Operator", "replacement-password", "replacement-password");

        expect(executeRequestMock.mock.calls.map(call => call[0])).toEqual([
            { action: "auth.frontendUsers.enable", username: "Operator" },
            { action: "auth.frontendUsers.disable", username: "Operator" },
            { action: "auth.frontendUsers.delete", username: "Operator" },
            { action: "auth.frontendUsers.changePassword", username: "Operator", newPassword: "replacement-password", passwordConfirmation: "replacement-password" },
        ]);
    });

    it("sends explicit frontend access and role assignments", async () => {
        executeRequestMock.mockResolvedValue(response([user]));
        await assignFrontendAuthorization("Operator", false, null);
        expect(executeRequestMock.mock.calls[0][0]).toEqual({
            action: "auth.frontendUsers.assignRole",
            username: "Operator",
            frontendAccess: false,
            frontendRole: null,
        });
    });

    it("rejects managed-user responses that omit the persisted backend role", async () => {
        const malformed = Object.fromEntries(Object.entries(user).filter(([key]) => key !== "backendRole"));
        executeRequestMock.mockResolvedValueOnce(response([malformed]));
        await expect(listUsers()).rejects.toThrow("The API returned an invalid user response.");
    });
});
