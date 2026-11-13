import { describe, expect, it, vi } from "vitest";
import { Route } from "./instagram-tick";

const { from, requireCronSecret } = vi.hoisted(() => ({
  from: vi.fn(),
  requireCronSecret: vi.fn(() => null),
}));

vi.mock("@/lib/public-auth.server", () => ({ requireCronSecret }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from },
}));

describe("verificação recorrente do Instagram", () => {
  it("permanece desligada e não acessa o banco", async () => {
    const handlers = Route.options.server?.handlers as unknown as {
      POST: (args: { request: Request }) => Promise<Response>;
    };

    const response = await handlers.POST({
      request: new Request("http://localhost/api/public/hooks/instagram-tick", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      disabled: true,
      ran: 0,
      results: [],
    });
    expect(from).not.toHaveBeenCalled();
  });
});
