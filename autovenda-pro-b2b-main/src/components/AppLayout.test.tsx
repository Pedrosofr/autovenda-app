// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const authMocks = vi.hoisted(() => ({
  logout: vi.fn(),
  user: {
    id: "1",
    email: "owner@loja.local",
    name: "Loja Centro",
    role: "owner" as "platform_admin" | "owner" | "seller",
  },
  tenant: {
    id: "10",
    name: "Loja Centro",
    slug: "loja-centro",
    status: "trial" as const,
    trialEndsAt: new Date().toISOString(),
    planCode: "starter",
    daysRemaining: 6,
  },
  permissions: {
    canManagePlatform: false,
    canManageTeam: true,
  },
  isPlatformAdmin: false,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => authMocks,
}));

import AppLayout from "@/components/AppLayout";

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows team management for owners and hides the platform console", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppLayout>
          <div>Painel</div>
        </AppLayout>
      </MemoryRouter>,
    );

    expect(screen.getByText("Equipe")).toBeInTheDocument();
    expect(screen.queryByText("Lojas")).not.toBeInTheDocument();
  });
});
