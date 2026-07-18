import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Settings, Users, ShieldAlert, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/master")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth", search: { mode: "login" } });
    
    // Check for 'master' role
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isMaster = (roles ?? []).some((r) => r.role === "admin"); // For now using admin or master
    
    // In a real multi-tenant app, only specific IDs would be master
    // if (!isMaster) throw redirect({ to: "/dashboard" });
  },
  component: MasterLayout,
});

const TABS = [
  { to: "/dashboard/master", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/master/organizations", label: "Organizações", icon: Globe, exact: false },
  { to: "/dashboard/master/users", label: "Global Users", icon: Users, exact: false },
  { to: "/dashboard/master/security", label: "Segurança", icon: ShieldAlert, exact: false },
  { to: "/dashboard/master/settings", label: "Global Config", icon: Settings, exact: false },
] as const;

function MasterLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <ShieldAlert className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Painel Master</h1>
          <p className="text-sm text-muted-foreground">Gestão multi-organização (Dono dos Donos).</p>
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
