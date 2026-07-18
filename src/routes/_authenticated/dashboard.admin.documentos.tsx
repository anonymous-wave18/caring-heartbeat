import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, Download, Search, User as UserIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/admin/documentos")({
  component: AdminDocumentos,
});

function AdminDocumentos() {
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const docsQ = useQuery({
    queryKey: ["all-docs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recruitment_documents")
        .select(`
          id, user_id, file_path, file_name, kind, created_at,
          profiles:user_id(first_name, last_name, email)
        `)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Erro ao buscar documentos:", error);
        return [];
      }
      return data ?? [];
    },
  });

  const byUser = useMemo(() => {
    const map = new Map<string, { name: string; email: string; docs: any[] }>();
    for (const d of (docsQ.data ?? []) as any[]) {
      const key = d.user_id as string;
      const name = `${d.profiles?.first_name ?? ""} ${d.profiles?.last_name ?? ""}`.trim() || d.profiles?.email || key;
      if (!map.has(key)) map.set(key, { name, email: d.profiles?.email ?? "", docs: [] });
      map.get(key)!.docs.push(d);
    }
    const arr = Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
    return q ? arr.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())) : arr;
  }, [docsQ.data, q]);

  async function download(path: string, name: string) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (data?.signedUrl) { const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.target = "_blank"; a.click(); }
  }

  async function downloadAllForUser(userId: string) {
    const docs = byUser.find((u) => u.id === userId)?.docs ?? [];
    for (const d of docs) await download(d.file_path, d.file_name);
  }

  const openUser = byUser.find((u) => u.id === selected);

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <aside className="rounded-lg bg-surface ring-1 ring-border">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar membro" className="input pl-8" />
          </div>
        </div>
        {docsQ.isLoading ? <div className="p-4"><Loader2 className="size-5 animate-spin" /></div> : (
          <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
            {byUser.map((u) => (
              <li key={u.id}>
                <button onClick={() => setSelected(u.id)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm ${selected === u.id ? "bg-primary/10" : "hover:bg-surface-muted"}`}>
                  <UserIcon className="mt-0.5 size-4 text-muted-foreground" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.docs.length} arquivo(s)</span>
                  </span>
                </button>
              </li>
            ))}
            {byUser.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhum membro com documentos.</li>}
          </ul>
        )}
      </aside>

      <div className="rounded-lg bg-surface ring-1 ring-border">
        {openUser ? (
          <>
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <div className="font-medium">{openUser.name}</div>
                <div className="text-xs text-muted-foreground">{openUser.email}</div>
              </div>
              <button onClick={() => downloadAllForUser(openUser.id)}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <Download className="size-3.5" /> Exportar todos
              </button>
            </div>
            <ul className="divide-y divide-border">
              {openUser.docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between p-3 text-sm">
                  <span className="inline-flex items-center gap-2"><FileText className="size-4 text-muted-foreground" />{d.file_name}</span>
                  <button onClick={() => download(d.file_path, d.file_name)}
                    className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Download className="size-3.5" /> baixar
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="grid h-full min-h-[300px] place-items-center text-sm text-muted-foreground">Selecione um membro para ver os documentos.</div>
        )}
      </div>
    </div>
  );
}