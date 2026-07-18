import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/master/organizations")({
  component: OrgsPage,
});

type Org = { id: string; name: string; slug: string; plan: string; owner_email: string | null; mrr_cents: number; status: string };

function OrgsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Org[];
    },
  });

  const [form, setForm] = useState({ name: "", slug: "", plan: "enterprise", owner_email: "" });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.slug.trim()) throw new Error("Nome e slug são obrigatórios");
      const { error } = await supabase.from("organizations" as any).insert({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        plan: form.plan,
        owner_email: form.owner_email.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Organização criada"); setForm({ name: "", slug: "", plan: "enterprise", owner_email: "" }); qc.invalidateQueries({ queryKey: ["orgs"] }); qc.invalidateQueries({ queryKey: ["master-orgs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updMut = useMutation({
    mutationFn: async (o: Org) => {
      const { error } = await supabase.from("organizations" as any).update({
        name: o.name, plan: o.plan, owner_email: o.owner_email, mrr_cents: o.mrr_cents, status: o.status,
      }).eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["orgs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organizations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removida"); qc.invalidateQueries({ queryKey: ["orgs"] }); qc.invalidateQueries({ queryKey: ["master-orgs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-surface p-5 ring-1 ring-border">
        <h2 className="mb-4 text-lg font-medium">Nova organização</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input className="input" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" placeholder="slug (unique)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <select className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <input className="input" placeholder="Email do dono" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />
        </div>
        <button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Adicionar
        </button>
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-border overflow-hidden">
        {q.isLoading && <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="inline size-4 animate-spin" /></div>}
        {q.error && <div className="p-6 text-center text-sm text-destructive">Erro: {(q.error as Error).message}</div>}
        {q.data && q.data.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma organização.</div>}
        {q.data && q.data.map((o) => <OrgRow key={o.id} org={o} onSave={(u) => updMut.mutate(u)} onDelete={() => { if (confirm(`Remover ${o.name}?`)) delMut.mutate(o.id); }} />)}
      </div>
    </div>
  );
}

function OrgRow({ org, onSave, onDelete }: { org: Org; onSave: (o: Org) => void; onDelete: () => void }) {
  const [o, setO] = useState<Org>(org);
  return (
    <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-[1fr_1fr_1fr_100px_120px_auto]">
      <input className="input" value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} />
      <input className="input font-mono text-xs" value={o.slug} disabled />
      <input className="input" value={o.owner_email ?? ""} onChange={(e) => setO({ ...o, owner_email: e.target.value })} placeholder="owner email" />
      <select className="input" value={o.plan} onChange={(e) => setO({ ...o, plan: e.target.value })}>
        <option value="starter">Starter</option>
        <option value="pro">Pro</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <select className="input" value={o.status} onChange={(e) => setO({ ...o, status: e.target.value })}>
        <option value="active">Ativo</option>
        <option value="suspended">Suspenso</option>
        <option value="canceled">Cancelado</option>
      </select>
      <div className="flex items-center gap-1">
        <button onClick={() => onSave(o)} className="rounded-md p-2 hover:bg-primary/10 text-primary" title="Salvar"><Save className="size-4" /></button>
        <button onClick={onDelete} className="rounded-md p-2 hover:bg-destructive/10 text-destructive" title="Remover"><Trash2 className="size-4" /></button>
      </div>
    </div>
  );
}
