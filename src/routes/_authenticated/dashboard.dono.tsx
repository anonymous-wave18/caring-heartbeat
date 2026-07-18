import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Settings, ShieldCheck, ScrollText, Database } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/dono")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth", search: { mode: "login" } });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isOwner = (roles ?? []).some((r) => r.role === "owner");
    if (!isOwner) throw redirect({ to: "/dashboard" });
  },
  component: OwnerLayout,
});

const TABS = [
  { to: "/dashboard/dono", label: "Configurações", icon: Settings, exact: true },
  { to: "/dashboard/dono/permissoes", label: "Permissões", icon: ShieldCheck, exact: false },
  { to: "/dashboard/dono/auditoria", label: "Auditoria", icon: ScrollText, exact: false },
  { to: "/dashboard/dono/database", label: "Banco de Dados", icon: Database, exact: false },
] as const;

function OwnerLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <Crown className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Painel Desenvolvedor</h1>
          <p className="text-sm text-muted-foreground">Controle owner.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg bg-surface p-1 ring-1 ring-border">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link key={t.to} to={t.to}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="size-3.5" />{t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
