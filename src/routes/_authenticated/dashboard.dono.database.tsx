import { createFileRoute } from "@tanstack/react-router";
import { Database, ExternalLink, Info } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/dono/database")({
  component: OwnerDatabase,
});

function OwnerDatabase() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-primary/5 p-4 text-sm ring-1 ring-primary/20">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 text-primary" />
          <div>
            <b className="text-primary">Atenção: </b>
            apenas o <b>CryAnd</b> deve e pode mexer nessa aréa. Caso alguém mexa pode resultar <b>EM QUEDA  DO SISTEMA!!</b>
          </div>
        </div>
      </div>

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
        <div className="flex items-center gap-3">
          <Database className="size-5 text-primary" />
          <h2 className="text-lg font-medium">Migrar para um Supabase próprio</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Se um dia você quiser mudar para uma conta Supabase criada por você (fora do Cloud), este é o passo a passo. É uma operação avançada e substitui o banco atual — só faça se realmente for necessário.
        </p>

        <ol className="space-y-4 text-sm">
          <Step n={1} title="Criar o projeto no Supabase">
            Entre em <a className="text-primary underline" href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>, crie um novo projeto e anote o <code>Project URL</code> e a <code>Publishable (anon) key</code> em <b>Project Settings → API</b>.
          </Step>
          <Step n={2} title="Rodar as migrações">
            Todas as tabelas estão em <code>supabase/migrations/</code> deste repositório. Aplique-as com a CLI:
            <pre className="mt-2 overflow-x-auto rounded-md bg-background/60 p-3 text-xs ring-1 ring-border">
{`npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push`}
            </pre>
          </Step>
          <Step n={3} title="Criar os buckets de arquivos">
            No painel do Supabase, em <b>Storage</b>, crie três buckets <b>privados</b>: <code>avatars</code>, <code>documents</code> e <code>payment-proofs</code>. As políticas de acesso já vêm nas migrações.
          </Step>
          <Step n={4} title="Ativar o provedor de e-mail">
            Em <b>Authentication → Providers → Email</b>, mantenha <i>Email</i> ativo. Desative <i>Confirm email</i> se quiser login imediato (não recomendado em produção).
          </Step>
          <Step n={5} title="Atualizar as variáveis de ambiente">
            No repositório, edite o <code>.env</code>:
            <pre className="mt-2 overflow-x-auto rounded-md bg-background/60 p-3 text-xs ring-1 ring-border">
{`VITE_SUPABASE_URL=https://SEU_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_PROJECT_ID=SEU_REF`}
            </pre>
            E republique o app para carregar as novas chaves. As chaves privadas (<code>SUPABASE_SERVICE_ROLE_KEY</code>) ficam apenas no lado do servidor.
          </Step>
          <Step n={6} title="Promover o Dono no novo banco">
            Assim que o e-mail <b>cry498434@gmail.com</b> criar conta nesse novo banco, a trigger <code>handle_new_user</code> já o promove a <b>owner</b> automaticamente (isso está codado na migração). Se por algum motivo você quiser promover outro usuário depois, rode:
            <pre className="mt-2 overflow-x-auto rounded-md bg-background/60 p-3 text-xs ring-1 ring-border">
{`INSERT INTO public.user_roles (user_id, role)
VALUES ('UUID_DO_USUARIO', 'owner');`}
            </pre>
          </Step>
        </ol>

        <div className="flex flex-wrap gap-2 pt-2">
          <a href="https://supabase.com/docs/guides/cli/local-development" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2 text-xs font-medium ring-1 ring-border hover:bg-surface">
            <ExternalLink className="size-3.5" /> Docs Supabase CLI
          </a>
          <a href="https://supabase.com/docs/guides/database/postgres/row-level-security" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-surface-muted px-3 py-2 text-xs font-medium ring-1 ring-border hover:bg-surface">
            <ExternalLink className="size-3.5" /> RLS explicado
          </a>
        </div>
      </section>

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-3">
        <h2 className="text-lg font-medium">Recursos criados neste banco</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            "profiles", "user_roles (owner/admin/member)", "site_settings",
            "recruitment_forms + recruitment_documents", "payments + payment_proofs",
            "announcements", "notifications", "chat_threads + chat_messages", "audit_log",
          ].map((n) => (
            <div key={n} className="rounded-md bg-background/50 px-3 py-2 ring-1 ring-border font-mono text-xs">{n}</div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Todas com RLS ativa. Somente (owner) enxerga esta página.
        </p>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/30">{n}</div>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}
