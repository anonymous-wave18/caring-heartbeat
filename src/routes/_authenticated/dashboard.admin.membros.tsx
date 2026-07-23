import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Loader2, MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/admin/membros")({
  component: AdminMembros,
});

function AdminMembros() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cargoFilter, setCargoFilter] = useState<string>("all");

  const cargosQ = useQuery({
    queryKey: ["cargos"],
    queryFn: async () => (await supabase.from("cargos").select("*").order("sort_order").order("name")).data ?? [],
  });

  const membersQ = useQuery({
    queryKey: ["all-profiles-and-roles"],
    queryFn: async () => {
      const { data: profs } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r) => { byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]); });
      return (profs ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const setCargoMut = useMutation({
    mutationFn: async ({ userId, cargoId }: { userId: string; cargoId: string | null }) => {
      const { error } = await supabase.from("profiles").update({ cargo_id: cargoId }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo atualizado.");
      qc.invalidateQueries({ queryKey: ["all-profiles-and-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (membersQ.data ?? []).filter((m) => {
    if (cargoFilter !== "all") {
      if (cargoFilter === "none" ? m.cargo_id : m.cargo_id !== cargoFilter) return false;
    }
    if (!q) return true;
    const t = q.toLowerCase();
    return `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email}`.toLowerCase().includes(t);
  });

  // Group by cargo
  const groups = new Map<string, typeof list>();
  const cargoById = new Map((cargosQ.data ?? []).map((c: any) => [c.id, c]));
  for (const m of list) {
    const key = m.cargo_id ?? "__none";
    if (!groups.has(key)) groups.set(key, [] as any);
    groups.get(key)!.push(m);
  }
  const orderedKeys = [
    ...(cargosQ.data ?? []).map((c: any) => c.id).filter((id: string) => groups.has(id)),
    ...(groups.has("__none") ? ["__none"] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou email" className="input pl-9" />
        </div>
        <select className="input max-w-[220px]" value={cargoFilter} onChange={(e) => setCargoFilter(e.target.value)}>
          <option value="all">Todos os cargos</option>
          <option value="none">Sem cargo</option>
          {(cargosQ.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {membersQ.isLoading ? <Loader2 className="size-5 animate-spin" /> : (
        <div className="space-y-6">
          {orderedKeys.length === 0 && (
            <div className="rounded-lg bg-surface p-8 text-center text-sm text-muted-foreground ring-1 ring-border">Nenhum membro.</div>
          )}
          {orderedKeys.map((key) => {
            const cargo: any = key === "__none" ? null : cargoById.get(key);
            const rows = groups.get(key)!;
            return (
              <div key={key} className="overflow-hidden rounded-lg bg-surface ring-1 ring-border">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="inline-flex items-center gap-2">
                    <span className="inline-block size-3 rounded-full ring-1 ring-border" style={{ background: cargo?.color ?? "#64748b" }} />
                    <span className="text-sm font-medium">{cargo?.name ?? "Sem cargo"}</span>
                    <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border">{rows.length}</span>
                  </div>
                </div>
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5">Membro</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Formulário</th>
                      <th className="px-4 py-2.5">Cargo</th>
                      <th className="px-4 py-2.5">Papéis</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((m) => (
                      <tr key={m.id} className="hover:bg-surface-muted/50">
                        <td className="px-4 py-2.5">{m.first_name} {m.last_name}<div className="text-xs text-muted-foreground">{m.email}</div></td>
                        <td className="px-4 py-2.5">{m.status}</td>
                        <td className="px-4 py-2.5">{m.form_status}</td>
                        <td className="px-4 py-2.5">
                          <select className="input py-1 text-xs" value={m.cargo_id ?? ""}
                            onChange={(e) => setCargoMut.mutate({ userId: m.id, cargoId: e.target.value || null })}>
                            <option value="">— sem cargo —</option>
                            {(cargosQ.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1">
                            {m.roles.map((r) => (
                              <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary ring-1 ring-primary/30">{r}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link to="/dashboard/chat" search={{ thread_id: `dm:${m.id}` }} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <MessageSquare className="size-3.5" /> chat
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}