// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const teamMocks = vi.hoisted(() => ({
  fetchTeamMembers: vi.fn(),
  inviteTeamMember: vi.fn(),
  revokeTeamInvite: vi.fn(),
  updateMemberPermissions: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    tenant: {
      id: "10",
      name: "Auto Prime",
      slug: "auto-prime",
      status: "trial",
      trialEndsAt: new Date().toISOString(),
      planCode: "starter",
      daysRemaining: 7,
    },
  }),
}));

vi.mock("@/services/team", () => ({
  fetchTeamMembers: teamMocks.fetchTeamMembers,
  inviteTeamMember: teamMocks.inviteTeamMember,
  revokeTeamInvite: teamMocks.revokeTeamInvite,
  updateMemberPermissions: teamMocks.updateMemberPermissions,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import TeamManagement from "@/pages/TeamManagement";

describe("TeamManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    teamMocks.fetchTeamMembers.mockResolvedValue({
      members: [
        {
          id: 1,
          nome: "Julia",
          email: "julia@autoprime.com",
          papel: "owner",
          ativo: 1,
          meta_mensal: 0,
          seller_permissions: null,
          criado_em: new Date().toISOString(),
        },
      ],
      invites: [],
    });
  });

  it("envia convite e atualiza a lista pendente", async () => {
    teamMocks.inviteTeamMember.mockResolvedValue({
      success: true,
      inviteUrl: "http://localhost:8082/?invite=abc",
      members: [
        {
          id: 1,
          nome: "Julia",
          email: "julia@autoprime.com",
          papel: "owner",
          ativo: 1,
          meta_mensal: 0,
          seller_permissions: null,
          criado_em: new Date().toISOString(),
        },
      ],
      invites: [
        {
          id: 9,
          nome: "Mario",
          email: "mario@autoprime.com",
          papel: "seller",
          meta_mensal: 4,
          status: "pending",
          expires_em: new Date(Date.now() + 86_400_000).toISOString(),
          criado_em: new Date().toISOString(),
        },
      ],
    });

    render(<TeamManagement />);

    await waitFor(() => {
      expect(teamMocks.fetchTeamMembers).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Mario" },
    });
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "mario@autoprime.com" },
    });
    fireEvent.change(screen.getByLabelText("Meta mensal"), {
      target: { value: "4" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Enviar convite/i }));

    await waitFor(() => {
      expect(teamMocks.inviteTeamMember).toHaveBeenCalledWith({
        name: "Mario",
        email: "mario@autoprime.com",
        role: "seller",
        salesGoalMonthly: 4,
      });
      expect(screen.getByText("Mario")).toBeInTheDocument();
      expect(screen.getByText("Pendente")).toBeInTheDocument();
    });
  });
});
