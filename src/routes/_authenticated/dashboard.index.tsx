import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle, User as UserIcon, ShieldCheck, ArrowRight, FileText, CreditCard, MessageSquare, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import foxImage from "@/assets/malta-fox.png";
import type { Profile } from "./dashboard";
import { useRoles, computeRoleFlags } from "@/lib/useRoles";
import { useSiteSettings, formatBRL } from "@/lib/useSiteSettings";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { user } = Route.useRouteContext();

  const profileQuery = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const rolesQ = useRoles(user.id);
  const { isStaff } = computeRoleFlags(rolesQ.data);
  const profile = profileQuery.data;

  if (!profile) return null;
  if (profile.status === "pending") return <PendingState />;
  if (profile.status === "rejected") return <RejectedState />;

  return <ApprovedHome profile={profile} isStaff={isStaff} userId={user.id} />;
}

function PendingState() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-surface p-10 text-center ring-1 ring-border">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-warning/10 ring-1 ring-warning/40">
        <Clock className="size-6 text-warning" />
      </div>
      <h1 className="text-2xl font-medium tracking-tight">Aguardando aprovação</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Seu cadastro foi recebido e está sendo revisado pela administração da Malta.
        Você receberá acesso completo assim que for aprovado.
      </p>
      <img src={foxImage} alt="" className="mx-auto mt-8 size-40 opacity-70" />
    </div>
  );
}

function RejectedState() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-surface p-10 text-center ring-1 ring-border">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/40">
        <XCircle className="size-6 text-destructive" />
      </div>
      <h1 className="text-2xl font-medium tracking-tight">Cadastro não aprovado</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Seu cadastro foi rejeitado pela administração. Entre em contato com um
        líder da Malta pelo Discord para mais informações.
      </p>
    </div>
  );
}

function ApprovedHome({ profile, isStaff, userId }: { profile: Profile; isStaff: boolean; userId: string }) {
  const settingsQ = useSiteSettings();
  const pendingCountQuery = useQuery({
    queryKey: ["pending-forms-count"],
    enabled: isStaff,
    queryFn: async () => {
      const { count } = await supabase.from("recruitment_forms").select("id", { count: "exact", head: true }).eq("status", "submitted");
      return count ?? 0;
    },
  });
  const nextPaymentQ = useQuery({
    queryKey: ["my-next-payment", userId],
    enabled: profile.form_status === "approved" || profile.status === "approved",
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("user_id", userId)
        .in("status", ["pending", "submitted", "overdue"]).order("week_start", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });
  const daysLeft = nextPaymentQ.data
    ? Math.ceil((new Date(nextPaymentQ.data.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-medium tracking-tight">
          Olá, <span className="text-primary">{profile.first_name}</span>.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Bem-vindo ao painel da Malta.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card icon={CheckCircle2} label="Status" value="Ativo" tint="success" />
        <Card icon={FileText} label="Formulário" value={
          profile.form_status === "approved" || profile.status === "approved" ? "Aprovado"
          : profile.form_status === "submitted" ? "Em análise"
          : profile.form_status === "rejected" ? "Recusado" : "Não enviado"
        } />
        <Card icon={CreditCard} label="Pagamento semanal"
          value={profile.form_status === "approved" || profile.status === "approved"
            ? (nextPaymentQ.data ? `${daysLeft !== null && daysLeft >= 0 ? `${daysLeft} dias para pagar` : daysLeft !== null ? "Vencido" : "Aguardando"} · ${formatBRL(nextPaymentQ.data.amount)}` : "Em dia")
            : "Bloqueado"} />
      </div>

      {profile.form_status !== "approved" && profile.status !== "approved" && (
        <ActionCard to="/dashboard/formulario" icon={FileText} title="Complete seu formulário"
          desc="Necessário para liberar pagamentos e chat completo." />
      )}

      {profile.form_status === "approved" && nextPaymentQ.data && (
        <div className="rounded-xl bg-primary/5 p-6 ring-1 ring-primary/20 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="size-4" /> Pagamento Pendente
            </h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
              {daysLeft !== null && daysLeft >= 0 ? `Vence em ${daysLeft} dias` : "Atrasado"}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-2xl font-bold tracking-tight">{formatBRL(nextPaymentQ.data.amount)}</div>
              <div className="text-xs text-muted-foreground mt-1">Referente à semana de {new Date(nextPaymentQ.data.week_start).toLocaleDateString("pt-BR")}</div>
            </div>
            <Link to="/dashboard/pagamentos" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2">
              Ver PIX e enviar comprovante <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {profile.form_status === "approved" && (
          <ActionCard to="/dashboard/pagamentos" icon={CreditCard} title="Pagamentos" desc="Envie comprovantes e veja próximas cobranças." />
        )}
        <ActionCard to="/dashboard/chat" icon={MessageSquare} title="Chat" desc="Fale com a Malta em tempo real." />
        <ActionCard to="/dashboard/avisos" icon={Megaphone} title="Avisos" desc="Comunicados oficiais e notificações." />
      </div>

      {isStaff && (
        <Link
          to="/dashboard/admin/formularios"
          className="group flex items-center justify-between rounded-xl bg-surface p-6 ring-1 ring-border transition-colors hover:ring-primary/40"
        >
          <div className="flex items-center gap-4">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div>
              <div className="font-medium">Formulários aguardando</div>
              <div className="text-xs text-muted-foreground">Revise novos candidatos.</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/30">
              {pendingCountQuery.data ?? 0} pendentes
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      )}
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, desc }: { to: string; icon: typeof Clock; title: string; desc: string }) {
  return (
    <Link to={to} className="group flex items-center justify-between rounded-xl bg-surface p-5 ring-1 ring-border transition-colors hover:ring-primary/40">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-primary/10 ring-1 ring-primary/30"><Icon className="size-4 text-primary" /></div>
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tint?: "success";
}) {
  return (
    <div className="rounded-xl bg-surface p-6 ring-1 ring-border">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tint === "success" ? "text-success" : "text-primary"}`} />
      </div>
      <div className="mt-3 text-2xl font-medium tracking-tight">{value}</div>
    </div>
  );
}