import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe, Users, CreditCard, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/master/")({
  component: MasterOverview,
});

function MasterOverview() {
  const statsQ = useQuery({
    queryKey: ["master-stats"],
    queryFn: async () => {
      const { data: orgs } = await supabase.from("organizations" as any).select("*", { count: "exact" });
      const { count: users } = await supabase.from("profiles").select("*", { count: "exact", head: true });
      const { data: rev } = await supabase.from("payments").select("amount").eq("status", "approved");
      
      return {
        orgs: orgs?.length ?? 1,
        totalUsers: users ?? 0,
        activeSubs: orgs?.length ?? 1,
        mrr: rev?.reduce((acc, curr) => acc + curr.amount, 0) ?? 0
      };
    }
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Organizações" value={statsQ.data?.orgs ?? 0} icon={Globe} color="text-blue-500" />
        <StatCard label="Usuários Globais" value={statsQ.data?.totalUsers ?? 0} icon={Users} color="text-primary" />
        <StatCard label="Instâncias Ativas" value={statsQ.data?.activeSubs ?? 0} icon={CreditCard} color="text-success" />
        <StatCard label="MRR Estimado" value={`R$ ${statsQ.data?.mrr ?? 0}`} icon={ArrowUpRight} color="text-amber-500" />
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
        <button className="text-primary hover:underline" onClick={() => toast.info("Gerenciamento de instâncias em breve")}>Configurar</button>
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
