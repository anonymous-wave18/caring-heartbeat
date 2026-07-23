import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Users, FileText, CreditCard, FolderLock, Megaphone, UserCog, Briefcase, Settings2, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth", search: { mode: "login" } });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "owner");
    if (!isStaff) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

const TABS = [
  { to: "/dashboard/admin", label: "Cadastros", icon: Users, exact: true },
  { to: "/dashboard/admin/formularios", label: "Formulários", icon: FileText, exact: false },
  { to: "/dashboard/admin/pagamentos", label: "Pagamentos", icon: CreditCard, exact: false },
  { to: "/dashboard/admin/documentos", label: "Documentos", icon: FolderLock, exact: false },
  { to: "/dashboard/admin/avisos", label: "Avisos", icon: Megaphone, exact: false },
  { to: "/dashboard/admin/membros", label: "Membros", icon: UserCog, exact: false },
  { to: "/dashboard/admin/cargos", label: "Cargos", icon: Briefcase, exact: false },
  { to: "/dashboard/admin/form-editor", label: "Editor de Formulário", icon: Settings2, exact: false },
  { to: "/dashboard/admin/feedback", label: "Feedback", icon: MessageSquare, exact: false },
] as const;

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Administração</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Gerenciamento completo da Malta.</p>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg bg-surface p-1 ring-1 ring-border sm:mx-0 sm:flex-wrap">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}