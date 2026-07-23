import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  LogOut, ShieldCheck, LayoutDashboard, Users, UserCircle, Loader2,
  FileText, CreditCard, MessageSquare, Megaphone, Crown, Bell, Menu, X, Globe, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/lib/useAvatarUrl";
import { useRoles, computeRoleFlags } from "@/lib/useRoles";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel — Malta Manager" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardLayout,
});

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  discord_id: string | null;
  discord_username: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  status: "pending" | "approved" | "rejected";
  form_status: "not_submitted" | "submitted" | "approved" | "rejected";
  pix_key: string | null;
  pix_key_type: string | null;
  pix_beneficiary: string | null;
  cargo_id: string | null;
  recruited_by: string | null;
  created_at: string;
};

function DashboardLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const profileQuery = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (error) throw error;
      return data as Profile;
    },
    staleTime: 60_000,
  });

  const roleQuery = useRoles(user.id);
  const { isStaff, isOwner, primary } = computeRoleFlags(roleQuery.data);
  const profile = profileQuery.data;
  const avatarUrl = useAvatarUrl(profile?.avatar_url ?? null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => setAvatarFailed(false), [avatarUrl, profile?.avatar_url]);

  const unreadNotifQuery = useQuery({
    queryKey: ["notif-unread", user.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  }

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canPay = profile?.form_status === "approved";
  const memberNav = [
    { to: "/dashboard", label: "Início", icon: LayoutDashboard, exact: true },
    { to: "/dashboard/perfil", label: "Perfil", icon: UserCircle, exact: false },
    { to: "/dashboard/formulario", label: "Formulário", icon: FileText, exact: false },
    ...(canPay ? [{ to: "/dashboard/pagamentos", label: "Pagamentos", icon: CreditCard, exact: false }] : []),
    { to: "/dashboard/chat", label: "Chat", icon: MessageSquare, exact: false },
    { to: "/dashboard/social", label: "Rede", icon: Sparkles, exact: false },
    { to: "/dashboard/avisos", label: "Avisos", icon: Megaphone, exact: false },
  ] as const;
  const adminNav = isStaff ? [
    { to: "/dashboard/admin", label: "Admin", icon: Users, exact: false },
  ] : [];
  const ownerNav = isOwner ? [
    { to: "/dashboard/dono", label: "Dono", icon: Crown, exact: false },
  ] : [];
  const masterEmails = ["candinofpx@gmail.com", "cry498434@gmail.com"];
  const masterNav = (isOwner && masterEmails.includes(profile?.email || "")) ? [
    { to: "/dashboard/master", label: "Master (SaaS)", icon: Globe, exact: false },
  ] : [];
  const nav = [...memberNav, ...adminNav, ...ownerNav, ...masterNav];

  // Só libera menu completo para membros que enviaram e tiveram o formulário APROVADO.
  // Staff (admin) e owner sempre têm acesso independente do próprio formulário.
  const approvedMember = profile?.form_status === "approved" && profile?.status === "approved";
  const approved = approvedMember || isStaff || isOwner;
  const initial = (profile?.first_name ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-md ring-1 ring-border hover:bg-surface-muted"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded bg-primary">
            <div className="size-2.5 rounded-full bg-background" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Malta Manager</span>
        </div>
        <Link
          to="/dashboard/avisos"
          className="relative inline-flex size-9 items-center justify-center rounded-md ring-1 ring-border hover:bg-surface-muted"
          aria-label="Notificações"
        >
          <Bell className="size-4" />
          {(unreadNotifQuery.data ?? 0) > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadNotifQuery.data}
            </span>
          )}
        </Link>
      </header>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary">
              <div className="size-3 rounded-full bg-background" />
            </div>
            <span className="truncate text-base font-semibold tracking-tight">Malta Manager</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-md ring-1 ring-border hover:bg-surface-muted lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Profile chip */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="size-10 shrink-0 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border">
            {avatarUrl && !avatarFailed ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" loading="lazy" onError={() => setAvatarFailed(true)} />
            ) : (
              <div className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
                {initial}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {profile?.first_name} {profile?.last_name}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              {isOwner ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/40">
                  <Crown className="size-2.5" /> Dono
                </span>
              ) : isStaff ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/30">
                  <ShieldCheck className="size-2.5" /> Admin
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">{primary}</span>
              )}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-4">
          {approved ? (
            <ul className="space-y-1">
              {nav.map((item) => {
                const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                          : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-md bg-surface-muted px-3 py-3 text-xs text-muted-foreground">
              Aguardando aprovação da conta.
            </div>
          )}
        </nav>

        {/* Footer actions */}
        <div className="shrink-0 space-y-2 border-t border-border p-3">
          <Link
            to="/dashboard/avisos"
            className="relative hidden items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground ring-1 ring-border hover:bg-surface-muted hover:text-foreground lg:flex"
          >
            <Bell className="size-4" />
            Notificações
            {(unreadNotifQuery.data ?? 0) > 0 && (
              <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {unreadNotifQuery.data}
              </span>
            )}
          </Link>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}