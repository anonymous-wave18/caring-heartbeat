import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe, Users, CreditCard, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/master/")({
  component: MasterOverview,
});

function MasterOverview() {
  const statsQ = useQuery({
    queryKey: ["master-stats"],
    queryFn: async () => {
      const { data: orgs } = await supabase.from("organizations" as any).select("*");
      const { count: users } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rev } = await supabase.from("payments")
        .select("amount_cents,created_at").eq("status", "approved")
        .gte("created_at", sevenDaysAgo);
      const weeklyRevenueCents = (rev ?? []).reduce((acc: number, r: any) => acc + Number(r.amount_cents ?? 0), 0);

      let estimatedRevenueCents = 0;
      let activeSubs = 0;
      for (const o of (orgs ?? []) as any[]) {
        if (o.status && o.status !== "active") continue;
        activeSubs++;
        if (o.billing_model === "monthly_fixed") {
          estimatedRevenueCents += Number(o.monthly_fee_cents ?? 0);
        } else {
          const pct = Number(o.revshare_percent ?? 20);
          // extrapola: revshare semanal * ~4.33 = mensal
          estimatedRevenueCents += Math.round(weeklyRevenueCents * (pct / 100) * 4.33);
        }
      }

      return {
        orgs: orgs?.length ?? 0,
        totalUsers: users ?? 0,
        activeSubs,
        mrr: estimatedRevenueCents / 100,
      };
    }
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Organizações" value={statsQ.data?.orgs ?? 0} icon={Globe} color="text-blue-500" />
        <StatCard label="Usuários Globais" value={statsQ.data?.totalUsers ?? 0} icon={Users} color="text-primary" />
        <StatCard label="Instâncias Ativas" value={statsQ.data?.activeSubs ?? 0} icon={CreditCard} color="text-success" />
        <StatCard label="MRR Estimado" value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(statsQ.data?.mrr ?? 0)} icon={ArrowUpRight} color="text-amber-500" />
      </div>

      <div className="rounded-xl bg-surface p-6 ring-1 ring-border">
        <h2 className="text-lg font-medium mb-4">Instâncias e Organizações</h2>
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/50 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Organização</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <MasterOrgRows />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MasterOrgRows() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["master-orgs"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations" as any).select("*");
      return data ?? [];
    }
  });

  if (!data?.length) return (
    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhuma organização encontrada.</td></tr>
  );

  return data.map((org: any) => (
    <tr key={org.id} className="hover:bg-surface-muted/30">
      <td className="px-4 py-3 font-medium">{org.name}</td>
      <td className="px-4 py-3 text-muted-foreground uppercase">{org.plan || "Enterprise"}</td>
      <td className="px-4 py-3 font-mono text-xs">{org.slug}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success ring-1 ring-success/30">Ativo</span>
      </td>
      <td className="px-4 py-3 text-right">
        <button className="text-primary hover:underline" onClick={() => navigate({ to: "/dashboard/master/organizations" })}>Configurar</button>
      </td>
    </tr>
  ));
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-border">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className={`size-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
