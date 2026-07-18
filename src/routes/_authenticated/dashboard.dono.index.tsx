import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save, Loader2, Users, Receipt, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/lib/useSiteSettings";

export const Route = createFileRoute("/_authenticated/dashboard/dono/")({
  component: OwnerConfig,
});

function OwnerConfig() {
  const qc = useQueryClient();
  const settingsQ = useSiteSettings();
  const metricsQ = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: async () => {
      const { count: users } = await supabase.from("profiles").select("*", { count: 'exact', head: true }).eq("status", "approved");
      const { count: pendingForms } = await supabase.from("recruitment_forms").select("*", { count: 'exact', head: true }).eq("status", "submitted");
      const { data: payments } = await supabase.from("payments").select("amount, status").eq("status", "approved");
      const totalRevenue = payments?.reduce((acc, p) => acc + (p.amount || 0), 0) ?? 0;
      return { users: users ?? 0, pendingForms: pendingForms ?? 0, totalRevenue };
    }
  });
  const [form, setForm] = useState({
    org_name: "", pix_key: "", pix_key_type: "cpf", pix_beneficiary: "",
    weekly_amount: "0", payment_due_day: "7", discord_webhook_url: "",
  });

  useEffect(() => {
    if (settingsQ.data) setForm({
      org_name: settingsQ.data.org_name ?? "",
      pix_key: settingsQ.data.pix_key ?? "",
      pix_key_type: settingsQ.data.pix_key_type ?? "cpf",
      pix_beneficiary: settingsQ.data.pix_beneficiary ?? "",
      weekly_amount: String(settingsQ.data.weekly_amount ?? 0),
      payment_due_day: String(settingsQ.data.payment_due_day ?? 7),
      discord_webhook_url: settingsQ.data.discord_webhook_url ?? "",
    });
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("site_settings").update({
        org_name: form.org_name,
        pix_key: form.pix_key || null,
        pix_key_type: form.pix_key_type || null,
        pix_beneficiary: form.pix_beneficiary || null,
        weekly_amount: Number(form.weekly_amount || 0),
        payment_due_day: Number(form.payment_due_day || 7),
        discord_webhook_url: form.discord_webhook_url || null,
      }).eq("id", 1);
      if (error) throw error;
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({ actor_id: u.user!.id, action: "settings.update", entity: "site_settings", entity_id: "1" });
    },
    onSuccess: () => { toast.success("Configurações salvas."); qc.invalidateQueries({ queryKey: ["site_settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (settingsQ.isLoading) return <Loader2 className="size-5 animate-spin" />;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Membros Ativos" value={metricsQ.data?.users ?? 0} icon={<Users className="size-5 text-primary" />} />
        <MetricCard label="Formulários Pendentes" value={metricsQ.data?.pendingForms ?? 0} icon={<FileCheck className="size-5 text-amber-500" />} />
        <MetricCard label="Receita Total (Aprovada)" value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metricsQ.data?.totalRevenue ?? 0)} icon={<Receipt className="size-5 text-green-500" />} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-3">
        <h2 className="text-lg font-medium">Identidade</h2>
        <Field label="Nome da organização">
          <input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} className="input" />
        </Field>
      </section>

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-3">
        <h2 className="text-lg font-medium">PIX padrão do semanal</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de chave">
            <select value={form.pix_key_type} onChange={(e) => setForm({ ...form, pix_key_type: e.target.value })} className="input">
              <option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option><option value="phone">Telefone</option>
              <option value="random">Aleatória</option>
            </select>
          </Field>
          <Field label="Beneficiário">
            <input value={form.pix_beneficiary} onChange={(e) => setForm({ ...form, pix_beneficiary: e.target.value })} className="input" />
          </Field>
          <div className="col-span-2">
            <Field label="Chave PIX">
              <input value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} className="input font-mono" />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-3">
        <h2 className="text-lg font-medium">Financeiro</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor semanal (R$)">
            <input type="number" step="0.01" value={form.weekly_amount}
              onChange={(e) => setForm({ ...form, weekly_amount: e.target.value })} className="input" />
          </Field>
          <Field label="Dia de vencimento (1-28)">
            <input type="number" min={1} max={28} value={form.payment_due_day}
              onChange={(e) => setForm({ ...form, payment_due_day: e.target.value })} className="input" />
          </Field>
        </div>
      </section>

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-3">
        <h2 className="text-lg font-medium">Integrações</h2>
        <Field label="Webhook do Discord (opcional)">
          <input placeholder="https://discord.com/api/webhooks/..." value={form.discord_webhook_url}
            onChange={(e) => setForm({ ...form, discord_webhook_url: e.target.value })} className="input" />
        </Field>
        <p className="text-xs text-muted-foreground">Anúncios podem ser espelhados no seu canal Discord (fase futura).</p>
      </section>

      <div className="lg:col-span-2 flex justify-end">
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar tudo
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface p-4 ring-1 ring-border flex items-center gap-4">
      <div className="rounded-full bg-background p-2.5 ring-1 ring-border">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}</label>;
}