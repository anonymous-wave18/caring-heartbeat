import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Save, Loader2, Percent, DollarSign, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/master/organizations")({
  component: OrgsPage,
});

type BillingModel = "weekly_revshare" | "monthly_fixed";
type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  billing_model: BillingModel;
  revshare_percent: number;
  monthly_fee_cents: number;
  owner_email: string | null;
  mrr_cents: number;
  status: string;
  notes: string | null;
};

const BRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);

function OrgsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("organizations" as any) as any)
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((o) => ({
        ...o,
        billing_model: (o.billing_model as BillingModel) || "weekly_revshare",
        revshare_percent: Number(o.revshare_percent ?? 20),
        monthly_fee_cents: Number(o.monthly_fee_cents ?? 0),
      })) as Org[];
    },
  });

  const [form, setForm] = useState({
    name: "",
    slug: "",
    owner_email: "",
    billing_model: "weekly_revshare" as BillingModel,
    revshare_percent: 20,
    monthly_fee_brl: 0,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.slug.trim()) throw new Error("Nome e slug são obrigatórios");
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
        owner_email: form.owner_email.trim() || null,
        billing_model: form.billing_model,
        revshare_percent: form.billing_model === "weekly_revshare" ? form.revshare_percent : 0,
        monthly_fee_cents: form.billing_model === "monthly_fixed" ? Math.round(form.monthly_fee_brl * 100) : 0,
        plan: form.billing_model === "weekly_revshare" ? "revshare" : "fixed",
      };
      const { error } = await supabase.from("organizations" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organização criada");
      setForm({ name: "", slug: "", owner_email: "", billing_model: "weekly_revshare", revshare_percent: 20, monthly_fee_brl: 0 });
      qc.invalidateQueries({ queryKey: ["orgs"] });
      qc.invalidateQueries({ queryKey: ["master-orgs"] });
      qc.invalidateQueries({ queryKey: ["master-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updMut = useMutation({
    mutationFn: async (o: Org) => {
      const { error } = await supabase.from("organizations" as any).update({
        name: o.name,
        owner_email: o.owner_email,
        billing_model: o.billing_model,
        revshare_percent: o.billing_model === "weekly_revshare" ? o.revshare_percent : 0,
        monthly_fee_cents: o.billing_model === "monthly_fixed" ? o.monthly_fee_cents : 0,
        status: o.status,
        notes: o.notes,
        plan: o.billing_model === "weekly_revshare" ? "revshare" : "fixed",
      }).eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["orgs"] }); qc.invalidateQueries({ queryKey: ["master-orgs"] }); },
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
      <div className="grid gap-3 sm:grid-cols-2">
        <PlanCard
          icon={<Percent className="size-5" />}
          title="Revshare Semanal"
          badge="20% padrão"
          desc="Cobrança semanal proporcional ao faturamento da organização. Por padrão, 20% do que os membros pagaram nos últimos 7 dias vai para a plataforma. Ideal para orgs em crescimento — a plataforma ganha junto."
        />
        <PlanCard
          icon={<DollarSign className="size-5" />}
          title="Mensal Fixo"
          badge="valor fechado"
          desc="Cobrança mensal com valor combinado, independente de quantos membros a organização tem. Ideal para orgs grandes e estáveis que preferem custo previsível."
        />
      </div>

      <div className="rounded-xl bg-surface p-5 ring-1 ring-border">
        <h2 className="mb-4 text-lg font-medium">Nova organização</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome da organização</span>
            <input className="input w-full" placeholder="Ex: Malta RJ" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Slug (único, sem espaço)</span>
            <input className="input w-full font-mono text-xs" placeholder="malta-rj" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Email do dono</span>
            <input className="input w-full" placeholder="dono@exemplo.com" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Modelo de cobrança</span>
            <select className="input w-full" value={form.billing_model} onChange={(e) => setForm({ ...form, billing_model: e.target.value as BillingModel })}>
              <option value="weekly_revshare">Revshare semanal (%)</option>
              <option value="monthly_fixed">Mensal fixo (R$)</option>
            </select>
          </label>
          {form.billing_model === "weekly_revshare" ? (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Percentual sobre o faturamento semanal (%)</span>
              <input type="number" min={0} max={100} step="0.5" className="input w-full" value={form.revshare_percent} onChange={(e) => setForm({ ...form, revshare_percent: Number(e.target.value) })} />
            </label>
          ) : (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Valor mensal fixo (R$)</span>
              <input type="number" min={0} step="10" className="input w-full" value={form.monthly_fee_brl} onChange={(e) => setForm({ ...form, monthly_fee_brl: Number(e.target.value) })} />
            </label>
          )}
        </div>
        <button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer">
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Adicionar
        </button>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          O modelo pode ser trocado depois. A cobrança estimada aparece automaticamente na Overview.
        </p>
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

function PlanCard({ icon, title, badge, desc }: { icon: React.ReactNode; title: string; badge: string; desc: string }) {
  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-border transition-all hover:ring-primary/40">
      <div className="flex items-center gap-2">
        <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">{icon}</div>
        <div className="flex-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">{badge}</div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function OrgRow({ org, onSave, onDelete }: { org: Org; onSave: (o: Org) => void; onDelete: () => void }) {
  const [o, setO] = useState<Org>(org);
  return (
    <div className="border-b border-border p-3">
      <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr_150px_150px_130px_auto]">
        <input className="input" value={o.name} onChange={(e) => setO({ ...o, name: e.target.value })} />
        <input className="input font-mono text-xs" value={o.slug} disabled />
        <input className="input" value={o.owner_email ?? ""} onChange={(e) => setO({ ...o, owner_email: e.target.value })} placeholder="email do dono" />
        <select className="input" value={o.billing_model} onChange={(e) => setO({ ...o, billing_model: e.target.value as BillingModel })}>
          <option value="weekly_revshare">Revshare semanal</option>
          <option value="monthly_fixed">Mensal fixo</option>
        </select>
        {o.billing_model === "weekly_revshare" ? (
          <div className="flex items-center gap-1">
            <input type="number" min={0} max={100} step="0.5" className="input w-full" value={o.revshare_percent}
              onChange={(e) => setO({ ...o, revshare_percent: Number(e.target.value) })} />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">R$</span>
            <input type="number" min={0} step="10" className="input w-full" value={(o.monthly_fee_cents ?? 0) / 100}
              onChange={(e) => setO({ ...o, monthly_fee_cents: Math.round(Number(e.target.value) * 100) })} />
          </div>
        )}
        <select className="input" value={o.status} onChange={(e) => setO({ ...o, status: e.target.value })}>
          <option value="active">Ativo</option>
          <option value="suspended">Suspenso</option>
          <option value="canceled">Cancelado</option>
        </select>
        <div className="flex items-center gap-1">
          <button onClick={() => onSave(o)} className="rounded-md p-2 text-primary transition-all hover:bg-primary/10 hover:scale-110 cursor-pointer" title="Salvar"><Save className="size-4" /></button>
          <button onClick={onDelete} className="rounded-md p-2 text-destructive transition-all hover:bg-destructive/10 hover:scale-110 cursor-pointer" title="Remover"><Trash2 className="size-4" /></button>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {o.billing_model === "weekly_revshare"
          ? `Cobrança semanal = ${o.revshare_percent}% do faturamento da org nos últimos 7 dias.`
          : `Cobrança mensal fixa de ${BRL(o.monthly_fee_cents)}.`}
      </div>
    </div>
  );
}
