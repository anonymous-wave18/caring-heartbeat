import { createFileRoute } from "@tanstack/react-router";
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
      // These would be cross-org queries
      return {
        orgs: 1,
        totalUsers: 42,
        activeSubs: 1,
        mrr: 450.00
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
        <h2 className="text-lg font-medium mb-4">Instâncias Recentes</h2>
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/50 border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Organização</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Usuários</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr className="hover:bg-surface-muted/30">
                <td className="px-4 py-3 font-medium">Malta HQ</td>
                <td className="px-4 py-3 text-muted-foreground">Enterprise</td>
                <td className="px-4 py-3">42</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success ring-1 ring-success/30">Ativo</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-primary hover:underline">Gerenciar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
