import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  enableUser: vi.fn(),
  disableUser: vi.fn(),
  deleteUser: vi.fn(),
  changeUserPassword: vi.fn(),
  updateUserProfile: vi.fn(),
  assignFrontendAuthorization: vi.fn(),
}));
const authMock = vi.hoisted(() => ({
  user: {
    username: "Super.Admin",
    backendRole: "system-administrator" as "system-administrator" | null,
    frontendAccess: true,
    frontendRole: "application-administrator" as
      "application-administrator" | null,
  },
}));

vi.mock("../../auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auth")>()),
  useAuth: () => ({
    state: { status: "authenticated", user: authMock.user },
    error: null,
  }),
}));
vi.mock("../../auth/authService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../auth/authService")>()),
  ...serviceMocks,
}));

import UserManagement from "../UserManagement";
import type { ManagedAuthUser } from "../../auth";
import {
  frontendCapabilities,
  getAssignableFrontendRoles,
  type FrontendCapabilities,
} from "../../config/frontendCapabilities";

const createdAt = "2026-01-01T00:00:00+00:00";
const users = [
  {
    name: "System Owner",
    username: "Super.Admin",
    mobile: "+15550000001",
    email: "super@example.test",
    enabled: true,
    backendRole: "system-administrator" as const,
    frontendAccess: true,
    frontendRole: "application-administrator" as const,
    backendProtected: true,
    createdAt,
  },
  {
    name: "Application Owner",
    username: "Application.Admin",
    mobile: "+15550000002",
    email: null,
    enabled: true,
    backendRole: null,
    frontendAccess: true,
    frontendRole: "application-administrator" as const,
    backendProtected: false,
    createdAt,
  },
  {
    name: "Data Operator",
    username: "Operator",
    mobile: "+15550000003",
    email: "operator@example.test",
    enabled: true,
    backendRole: "data-operator" as const,
    frontendAccess: true,
    frontendRole: null,
    backendProtected: false,
    createdAt,
  },
  {
    name: null,
    username: "Legacy.User",
    mobile: null,
    email: null,
    enabled: false,
    backendRole: "read-only" as const,
    frontendAccess: true,
    frontendRole: null,
    backendProtected: false,
    createdAt,
  },
];

function renderPage(
  list: ManagedAuthUser[] = users,
  capabilities?: Readonly<FrontendCapabilities>,
) {
  serviceMocks.listUsers.mockResolvedValue(list);
  return render(
    <MemoryRouter>
      <UserManagement capabilities={capabilities} />
    </MemoryRouter>,
  );
}
function rowFor(username: string) {
  return within(
    screen.getByRole("row", { name: new RegExp(username.replace(".", "\\.")) }),
  );
}

describe("User Management", () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mock) => mock.mockReset());
    authMock.user = {
      username: "Super.Admin",
      backendRole: "system-administrator",
      frontendAccess: true,
      frontendRole: "application-administrator",
    };
  });

  it("renders one Role column and safe profile fields", async () => {
    renderPage();
    await screen.findByText("Operator");
    const headings = screen
      .getAllByRole("columnheader")
      .map((item) => item.textContent);
    expect(headings).toEqual([
      "Name",
      "Username",
      "Mobile Number",
      "Email",
      "Status",
      "Role",
      "Created",
      "Actions",
    ]);
    expect(
      screen.queryByRole("columnheader", { name: "Backend Role" }),
    ).toBeNull();
    expect(
      screen.queryByRole("columnheader", { name: "Frontend Role" }),
    ).toBeNull();
    expect(rowFor("Application.Admin").getByText("Admin")).toBeTruthy();
    expect(rowFor("Operator").getByText("Read Only")).toBeTruthy();
    expect(rowFor("Legacy.User").getByText("Read Only")).toBeTruthy();
    expect(screen.queryByText(/passwordHash|sessionId/i)).toBeNull();
  });

  it("keeps long profile values inside the responsive table and compact actions area", async () => {
    const longUser = {
      ...users[2],
      name: "A very long operator name that must wrap naturally",
      username: "A.Very.Long.Operator.Username",
      email: "a.very.long.operator.address@example.test",
    };
    const view = renderPage([longUser]);
    await screen.findByText(longUser.username);
    expect(view.container.querySelector(".user-table-shell")).toBeTruthy();
    expect(
      screen.getByText(longUser.name).classList.contains("user-profile-cell"),
    ).toBe(true);
    expect(
      screen.getByText(longUser.email).classList.contains("user-profile-cell"),
    ).toBe(true);
    expect(
      rowFor(longUser.username)
        .getByRole("button", { name: "Edit User" })
        .closest(".user-actions"),
    ).toBeTruthy();
  });

  it("uses an accessible bounded viewport for large non-report user lists", async () => {
    const manyUsers = Array.from({ length: 20 }, (_, index) => ({
      ...users[2],
      name: `User ${index + 1}`,
      username: `User.${index + 1}`,
      email: `user${index + 1}@example.test`,
    }));
    const view = renderPage(manyUsers);
    await screen.findByText("User.20");
    const viewport = view.container.querySelector(".user-table-shell");
    expect(viewport?.getAttribute("tabindex")).toBe("0");
    expect(viewport?.getAttribute("aria-label")).toBe("Frontend users");
    expect(within(viewport as HTMLElement).getAllByRole("row")).toHaveLength(
      21,
    );
  });

  it("derives current role options from frontend capabilities", async () => {
    renderPage();
    await screen.findByText("Operator");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));
    const role = screen.getByLabelText(/Role/) as HTMLSelectElement;
    expect(frontendCapabilities).toEqual({
      read: true,
      write: false,
      userManagement: true,
    });
    expect(Array.from(role.options).map((option) => option.text)).toEqual([
      "Admin",
      "Read Only",
    ]);
    expect(
      screen.queryByRole("option", {
        name: /Super Admin|System Administrator/,
      }),
    ).toBeNull();
  });

  it("offers Data Operator automatically when frontend write capability is enabled", async () => {
    const capabilities = { ...frontendCapabilities, write: true };
    expect(getAssignableFrontendRoles(capabilities)).toEqual([
      "application-administrator",
      "data-operator",
      "read-only",
    ]);
    renderPage(users, capabilities);
    await screen.findByText("Operator");
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));
    const role = screen.getByLabelText(/Role/) as HTMLSelectElement;
    expect(Array.from(role.options).map((option) => option.text)).toEqual([
      "Admin",
      "Data Operator",
      "Read Only",
    ]);
    expect(
      screen.queryByRole("option", {
        name: /Super Admin|System Administrator/,
      }),
    ).toBeNull();
  });

  it("opens user forms in a dialog and closes with Cancel or X", async () => {
    renderPage();
    await screen.findByText("Operator");
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      rowFor("Operator").getByRole("button", { name: "Edit User" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps modal actions outside the scrollable form body and locks the page", async () => {
    renderPage();
    await screen.findByText("Operator");
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".user-modal-form__body")).toBeTruthy();
    expect(
      dialog
        .querySelector(".user-modal__actions")
        ?.parentElement?.classList.contains("user-modal-form"),
    ).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(document.body.style.overflow).toBe("");
  });

  it("shows a Super Admin as backend managed with no normal actions", async () => {
    renderPage();
    await screen.findByText("Operator");
    const rowElement = screen.getByRole("row", { name: /Super\.Admin/ });
    const row = within(rowElement);
    expect(rowElement.querySelector(".user-role-cell")?.textContent).toBe(
      "Super Admin",
    );
    expect(row.getAllByText("Backend Managed")).toHaveLength(1);
    expect(row.queryByRole("button")).toBeNull();
  });

  it("allows an Admin to edit self and change password only", async () => {
    authMock.user = {
      username: "Application.Admin",
      backendRole: null,
      frontendAccess: true,
      frontendRole: "application-administrator",
    };
    renderPage();
    await screen.findByText("Operator");
    const row = rowFor("Application.Admin");
    expect(row.getByRole("button", { name: "Edit User" })).toBeTruthy();
    expect(row.getByRole("button", { name: "Change Password" })).toBeTruthy();
    for (const action of [
      "Disable",
      "Delete",
      "Remove Frontend Access",
      "Demote",
    ])
      expect(row.queryByRole("button", { name: action })).toBeNull();
    expect(row.queryByText("Protected Admin")).toBeNull();
  });

  it("allows an Admin to manage another Admin without offering Demote", async () => {
    authMock.user = {
      username: "Other.Admin",
      backendRole: null,
      frontendAccess: true,
      frontendRole: "application-administrator",
    };
    renderPage();
    await screen.findByText("Operator");
    const row = rowFor("Application.Admin");
    for (const action of ["Edit User", "Change Password", "Disable", "Delete"])
      expect(row.getByRole("button", { name: action })).toBeTruthy();
    expect(row.queryByRole("button", { name: "Demote" })).toBeNull();
    expect(
      row.queryByRole("button", { name: "Remove Frontend Access" }),
    ).toBeNull();
    expect(row.queryByText("Protected Admin")).toBeNull();
  });

  it("offers Demote to a Super Admin managing an Admin", async () => {
    serviceMocks.assignFrontendAuthorization.mockResolvedValue(users[1]);
    renderPage();
    await screen.findByText("Operator");
    fireEvent.click(
      rowFor("Application.Admin").getByRole("button", { name: "Demote" }),
    );
    await waitFor(() =>
      expect(serviceMocks.assignFrontendAuthorization).toHaveBeenCalledWith(
        "Application.Admin",
        true,
        null,
      ),
    );
  });

  it("validates and sends all required profile fields during creation", async () => {
    renderPage();
    await screen.findByText("Operator");
    expect(screen.queryByLabelText(/Name/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create User" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create User" }),
    );
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");
    serviceMocks.createUser.mockResolvedValue(users[3]);
    fireEvent.change(within(dialog).getByLabelText(/Name/), {
      target: { value: "New User" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Username/), {
      target: { value: "New.User" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Mobile Number/), {
      target: { value: "+15551234567" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Password/), {
      target: { value: "new-user-password" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Confirm Password/), {
      target: { value: "new-user-password" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create User" }),
    );
    await waitFor(() =>
      expect(serviceMocks.createUser).toHaveBeenCalledWith({
        name: "New User",
        username: "New.User",
        mobile: "+15551234567",
        email: null,
        password: "new-user-password",
        passwordConfirmation: "new-user-password",
        role: "read-only",
      }),
    );
  });

  it("edits profile separately from password", async () => {
    serviceMocks.updateUserProfile.mockResolvedValue(users[2]);
    renderPage();
    await screen.findByText("Operator");
    fireEvent.click(
      rowFor("Operator").getByRole("button", { name: "Edit User" }),
    );
    const form = screen.getByRole("dialog");
    fireEvent.change(within(form).getByLabelText(/Name/), {
      target: { value: "Updated Operator" },
    });
    fireEvent.change(within(form).getByLabelText(/Username/), {
      target: { value: "Updated.Operator" },
    });
    fireEvent.change(within(form).getByLabelText(/Mobile Number/), {
      target: { value: "+15557654321" },
    });
    fireEvent.change(within(form).getByLabelText(/Email/), {
      target: { value: "" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Save User" }));
    await waitFor(() =>
      expect(serviceMocks.updateUserProfile).toHaveBeenCalledWith(
        "Operator",
        "Updated Operator",
        "Updated.Operator",
        "+15557654321",
        null,
      ),
    );
    expect(within(form).queryByLabelText(/Password/)).toBeNull();
  });

  it("keeps normal lifecycle and password actions separate", async () => {
    serviceMocks.disableUser.mockResolvedValue(users[2]);
    serviceMocks.changeUserPassword.mockResolvedValue(users[2]);
    renderPage();
    await screen.findByText("Operator");
    fireEvent.click(
      rowFor("Operator").getByRole("button", { name: "Disable" }),
    );
    await waitFor(() =>
      expect(serviceMocks.disableUser).toHaveBeenCalledWith("Operator"),
    );
    fireEvent.click(
      rowFor("Operator").getByRole("button", { name: "Change Password" }),
    );
    const card = screen.getByRole("dialog");
    fireEvent.change(within(card).getByLabelText(/New Password/), {
      target: { value: "replacement-password" },
    });
    fireEvent.change(within(card).getByLabelText(/Confirm Password/), {
      target: { value: "replacement-password" },
    });
    fireEvent.click(
      within(card).getByRole("button", { name: "Change Password" }),
    );
    await waitFor(() =>
      expect(serviceMocks.changeUserPassword).toHaveBeenCalledWith(
        "Operator",
        "replacement-password",
        "replacement-password",
      ),
    );
  });
});
