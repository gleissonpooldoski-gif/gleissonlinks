import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Sparkles, Trash2, SearchCheck, StopCircle } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  getCleanupSummary,
  scanProductsBatch,
  deleteBrokenProducts,
  type CleanupChannelSummary,
} from "@/modules/products/cleanup.functions";

export const Route = createFileRoute("/limpeza-produtos")({
  head: () => ({
    meta: [
      { title: "Limpeza de Produtos | DivulgaLinks" },
      {
        name: "description",
        content:
          "Revise os links dos produtos dos seus grupos e remova automaticamente os anúncios que saíram do ar.",
      },
      { property: "og:title", content: "Limpeza de Produtos | DivulgaLinks" },
      {
        property: "og:description",
        content: "Revisão automática de links de produtos e exclusão dos anúncios expirados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CleanupPage,
});

type Progress = {
  channelId: string;
  checked: number;
  broken: number;
  remaining: number;
};

function CleanupPage() {
  const summaryFn = useServerFn(getCleanupSummary);
  const scanFn = useServerFn(scanProductsBatch);
  const deleteFn = useServerFn(deleteBrokenProducts);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [strict, setStrict] = useState(true);
  const [brokenList, setBrokenList] = useState<
    { id: string; title: string; reason: string; link: string }[]
  >([]);
  const stopRef = useRef(false);

  const q = useQuery({
    queryKey: ["cleanup-summary"],
    queryFn: () => summaryFn({ data: undefined as never }),
  });

  const channels: CleanupChannelSummary[] = q.data ?? [];

  async function runScan(channelId: string) {
    stopRef.current = false;
    setBrokenList([]);
    setProgress({ channelId, checked: 0, broken: 0, remaining: 0 });
    let checked = 0;
    let broken = 0;
    try {
      for (let i = 0; i < 500; i++) {
        if (stopRef.current) break;
        const r = await scanFn({ data: { channelId, limit: 20, revalidateAll: false, strict } });
        checked += r.checked;
        broken += r.broken.length;
        setBrokenList((prev) => [...prev, ...r.broken].slice(0, 300));
        setProgress({ channelId, checked, broken, remaining: r.remaining });
        if (r.checked === 0 || r.remaining === 0) break;
      }
      toast.success(`Revisão concluída: ${checked} links checados, ${broken} fora do ar`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na revisão");
    } finally {
      setProgress(null);
      q.refetch();
    }
  }

  async function runDelete(channelId: string, name: string) {
    if (!confirm(`Excluir definitivamente os produtos fora do ar de "${name}"?`)) return;
    try {
      const r = await deleteFn({
        data: { channelId, statuses: ["inactive", "out_of_stock"] },
      });
      toast.success(`${r.deleted} produto(s) removido(s)`);
      setBrokenList([]);
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased lg:flex">
      <AppSidebar />
      <div className="flex-1 lg:min-w-0">
        <div className="mx-auto max-w-5xl px-5 py-8 lg:px-10">
          <header className="mb-6 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Limpeza de Produtos</h1>
              <p className="text-sm text-muted-foreground">
                Revisa os links de cada grupo e mostra quais anúncios saíram do ar. Depois é só
                excluir de uma vez.
              </p>
            </div>
          </header>

          <label className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={strict}
              onChange={(e) => setStrict(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Marcar como fora do ar já na primeira falha (mais rigoroso)
          </label>

          {q.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando seus grupos…</p>
          )}

          <ul className="space-y-3">
            {channels.map((c) => {
              const running = progress?.channelId === c.channelId;
              const brokenTotal = c.inactive + c.outOfStock;
              return (
                <li
                  key={c.channelId}
                  className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{c.channelName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.active} no ar · {brokenTotal} fora do ar · {c.neverValidated} nunca
                        revisados
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {running ? (
                        <button
                          type="button"
                          onClick={() => (stopRef.current = true)}
                          className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                        >
                          <StopCircle className="h-4 w-4" /> Parar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!!progress}
                          onClick={() => runScan(c.channelId)}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          <SearchCheck className="h-4 w-4" /> Revisar links
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={brokenTotal === 0 || !!progress}
                        onClick={() => runDelete(c.channelId, c.channelName)}
                        className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" /> Excluir {brokenTotal || ""}
                      </button>
                    </div>
                  </div>

                  {running && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {progress!.checked} revisados · {progress!.broken} fora do ar ·{" "}
                      {progress!.remaining} restantes
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {brokenList.length > 0 && (
            <section className="mt-8">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  Produtos fora do ar encontrados ({brokenList.length})
                </h2>
                <button
                  type="button"
                  onClick={() => q.refetch()}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Atualizar
                </button>
              </div>
              <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card">
                {brokenList.map((b) => (
                  <li key={b.id} className="px-4 py-3">
                    <p className="truncate text-sm font-medium">{b.title || "Sem título"}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.reason}</p>
                    {b.link && (
                      <a
                        href={b.link}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-primary underline"
                      >
                        {b.link}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
