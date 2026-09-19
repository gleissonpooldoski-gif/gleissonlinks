/**
 * Ferramenta de revisão e limpeza de produtos.
 * - `getCleanupSummary`: panorama por canal (ativos / quebrados / pendentes).
 * - `scanProductsBatch`: revalida um lote de links e persiste o resultado.
 * - `deleteBrokenProducts`: remove produtos já confirmados como indisponíveis.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface CleanupChannelSummary {
  channelId: string;
  channelName: string;
  active: number;
  inactive: number;
  outOfStock: number;
  errored: number;
  neverValidated: number;
}

export const getCleanupSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CleanupChannelSummary[]> => {
    const { data: channels, error: chErr } = await context.supabase
      .from("channels")
      .select("id,name")
      .eq("user_id", context.userId)
      .order("name");
    if (chErr) throw new Error(chErr.message);

    const pageSize = 1000;
    const rows: { channel_id: string | null; availability: string; last_validated_at: string | null }[] = [];
    for (let i = 0; i < 100; i++) {
      const from = i * pageSize;
      const { data: batch, error } = await context.supabase
        .from("products")
        .select("channel_id,availability,last_validated_at")
        .eq("user_id", context.userId)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const b = (batch ?? []) as typeof rows;
      rows.push(...b);
      if (b.length < pageSize) break;
    }

    const byChannel = new Map<string, CleanupChannelSummary>();
    for (const ch of channels ?? []) {
      byChannel.set(ch.id, {
        channelId: ch.id,
        channelName: ch.name ?? "Sem nome",
        active: 0,
        inactive: 0,
        outOfStock: 0,
        errored: 0,
        neverValidated: 0,
      });
    }
    for (const r of rows) {
      if (!r.channel_id) continue;
      const s = byChannel.get(r.channel_id);
      if (!s) continue;
      if (r.availability === "active") s.active += 1;
      else if (r.availability === "out_of_stock") s.outOfStock += 1;
      else if (r.availability === "error") s.errored += 1;
      else s.inactive += 1;
      if (!r.last_validated_at) s.neverValidated += 1;
    }
    return [...byChannel.values()].filter(
      (s) => s.active + s.inactive + s.outOfStock + s.errored > 0,
    );
  });

const ScanSchema = z.object({
  channelId: z.string().uuid(),
  limit: z.number().int().min(1).max(40).default(20),
  /** Revalida também os que já foram checados nas últimas 24h. */
  revalidateAll: z.boolean().default(false),
  /** Marca como indisponível já na primeira falha confirmada. */
  strict: z.boolean().default(false),
});

export interface ScanBatchResult {
  checked: number;
  active: number;
  inactive: number;
  outOfStock: number;
  errored: number;
  remaining: number;
  broken: { id: string; title: string; reason: string; link: string }[];
}

export const scanProductsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ScanSchema.parse(input))
  .handler(async ({ data, context }): Promise<ScanBatchResult> => {
    const { validateProduct, persistValidation } = await import(
      "@/modules/products/validation/validate.server"
    );

    const staleBefore = new Date(Date.now() - 24 * 3600_000).toISOString();

    let query = context.supabase
      .from("products")
      .select("id,channel_id,platform,title,affiliate_link,raw_link,image_url", { count: "exact" })
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .eq("availability", "active");
    if (!data.revalidateAll) {
      query = query.or(`last_validated_at.is.null,last_validated_at.lt.${staleBefore}`);
    }

    const { data: rows, error, count } = await query
      .order("last_validated_at", { ascending: true, nullsFirst: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const result: ScanBatchResult = {
      checked: list.length,
      active: 0,
      inactive: 0,
      outOfStock: 0,
      errored: 0,
      remaining: Math.max(0, (count ?? list.length) - list.length),
      broken: [],
    };

    const CONCURRENCY = 6;
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const p = list[cursor++]!;
        const r = await validateProduct(p);
        if (p.channel_id) {
          await persistValidation(context.supabase, p.id, p.channel_id, r, "manual", data.strict);
        }
        if (r.availability === "active") result.active += 1;
        else {
          if (r.availability === "inactive") result.inactive += 1;
          else if (r.availability === "out_of_stock") result.outOfStock += 1;
          else result.errored += 1;
          result.broken.push({
            id: p.id,
            title: p.title ?? "",
            reason: r.reason ?? r.availability,
            link: p.affiliate_link || p.raw_link || "",
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));

    return result;
  });

const DeleteSchema = z.object({
  channelId: z.string().uuid(),
  /** Quais status remover. `error` fica de fora por padrão (falha temporária). */
  statuses: z.array(z.enum(["inactive", "out_of_stock", "error"])).min(1),
});

export const deleteBrokenProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("products")
      .delete({ count: "exact" })
      .eq("user_id", context.userId)
      .eq("channel_id", data.channelId)
      .in("availability", data.statuses);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });
