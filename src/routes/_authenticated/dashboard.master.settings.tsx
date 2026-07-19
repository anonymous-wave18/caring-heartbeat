import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/master/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("platform_settings" as any) as any).select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ platform_name: "", logo_url: "", saas_fee_cents: 0 });
  useEffect(() => { if (q.data) setForm({ platform_name: q.data.platform_name ?? "", logo_url: q.data.logo_url ?? "", saas_fee_cents: q.data.saas_fee_cents ?? 0 }); }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from("platform_settings" as any) as any).update({
        platform_name: form.platform_name, logo_url: form.logo_url || null, saas_fee_cents: Number(form.saas_fee_cents) || 0,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Configurações salvas"); qc.invalidateQueries({ queryKey: ["platform-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings2 className="size-5 text-primary" />
        <h2 className="text-lg font-medium">Configurações Globais da Plataforma</h2>
      </div>
      <div className="rounded-xl bg-surface p-6 ring-1 ring-border space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Nome da plataforma</label>
          <input className="input w-full" value={form.platform_name} onChange={(e) => setForm({ ...form, platform_name: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Logo URL</label>
          <input className="input w-full" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Taxa SaaS (centavos por organização/mês)</label>
          <input type="number" className="input w-full" value={form.saas_fee_cents} onChange={(e) => setForm({ ...form, saas_fee_cents: Number(e.target.value) })} />
          <p className="mt-1 text-xs text-muted-foreground">Ex.: 4990 = R$ 49,90</p>
        </div>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
        </button>
      </div>
    </div>
  );
}
