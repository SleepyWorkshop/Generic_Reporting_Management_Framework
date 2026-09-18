import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeRequestMock } = vi.hoisted(() => ({ executeRequestMock: vi.fn() }));

vi.mock("../../api/request", () => ({ executeRequest: executeRequestMock }));

import {
    changeUserPassword,
    createUser,
    deleteUser,
    disableUser,
    enableUser,
    listUsers,
} from "../authService";

const user = { username: "Operator", enabled: true, isAdmin: false };
const response = (data: Record<string, unknown>[]) => ({ success: true, message: "OK", data });

describe("user management auth service", () => {
    beforeEach(() => executeRequestMock.mockReset());

    it("lists and strictly validates safe users", async () => {
        executeRequestMock.mockResolvedValueOnce(response([user]));
        await expect(listUsers()).resolves.toEqual([user]);
        expect(executeRequestMock.mock.calls[0][0]).toEqual({ action: "auth.users.list" });

        executeRequestMock.mockResolvedValueOnce(response([{ ...user, passwordHash: "unsafe" }]));
        await expect(listUsers()).rejects.toThrow("invalid user response");
    });

    it("sends the exact create-user contract", async () => {
        executeRequestMock.mockResolvedValueOnce(response([user]));
        await createUser({ username: "Operator", password: "private-password", isAdmin: false });
        expect(executeRequestMock.mock.calls[0][0]).toEqual({
            action: "auth.users.create",
            username: "Operator",
            password: "private-password",
            isAdmin: false,
        });
    });

    it("sends enable, disable, delete, and password-change actions", async () => {
        executeRequestMock.mockResolvedValue(response([user]));
        await enableUser("Operator");
        await disableUser("Operator");
        await deleteUser("Operator");
        await changeUserPassword("Operator", "replacement-password");

        expect(executeRequestMock.mock.calls.map(call => call[0])).toEqual([
            { action: "auth.users.enable", username: "Operator" },
            { action: "auth.users.disable", username: "Operator" },
            { action: "auth.users.delete", username: "Operator" },
            { action: "auth.users.changePassword", username: "Operator", newPassword: "replacement-password" },
        ]);
    });
});
