import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/dono/permissoes")({
  component: OwnerPermissoes,
});

function OwnerPermissoes() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const membersQ = useQuery({
    queryKey: ["all-profiles-and-roles"],
    queryFn: async () => {
      const { data: profs } = await supabase.from("profiles").select("id, first_name, last_name, email");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r) => { byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]); });
      return (profs ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const toggleAdmin = useMutation({
    mutationFn: async (args: { user_id: string; add: boolean }) => {
      if (args.add) {
        const { error } = await supabase.from("user_roles").insert({ user_id: args.user_id, role: "admin" });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", args.user_id).eq("role", "admin");
        if (error) throw error;
      }
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        actor_id: u.user!.id, action: args.add ? "role.grant" : "role.revoke",
        entity: "user_roles", entity_id: args.user_id, metadata: { role: "admin" },
      });
    },
    onSuccess: () => { toast.success("Permissão atualizada."); qc.invalidateQueries({ queryKey: ["all-profiles-and-roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = (membersQ.data ?? []).filter((m) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email}`.toLowerCase().includes(t);
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-primary/5 p-4 text-sm text-muted-foreground ring-1 ring-primary/20">
        Apenas o <b className="text-primary">Dono</b> pode promover ou remover administradores.
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar membro" className="input pl-9" />
      </div>
      {membersQ.isLoading ? <Loader2 className="size-5 animate-spin" /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg bg-surface ring-1 ring-border">
          {list.map((m) => {
            const isAdmin = m.roles.includes("admin");
            const isOwner = m.roles.includes("owner");
            return (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium">{m.first_name} {m.last_name}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary ring-1 ring-primary/30">Dono</span>}
                  {isAdmin && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary ring-1 ring-primary/30">Admin</span>}
                  {!isOwner && (
                    isAdmin
                      ? <button onClick={() => toggleAdmin.mutate({ user_id: m.id, add: false })}
                          className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive ring-1 ring-destructive/30 hover:bg-destructive/20">
                          <ShieldOff className="size-3.5" /> Remover admin
                        </button>
                      : <button onClick={() => toggleAdmin.mutate({ user_id: m.id, add: true })}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/20">
                          <ShieldCheck className="size-3.5" /> Promover a admin
                        </button>
                  )}
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhum membro.</li>}
        </ul>
      )}
    </div>
  );
}
