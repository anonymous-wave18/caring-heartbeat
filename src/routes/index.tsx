import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Zap, ClipboardList, Bell, ArrowRight, ChevronDown } from "lucide-react";
import foxImage from "@/assets/malta-fox.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Malta Manager — Gestão profissional da Organização Malta" },
      {
        name: "description",
        content:
          "Plataforma oficial da Organização Malta para gestão de membros, mensalidades, comprovantes e aprovações. Substitua planilhas por infraestrutura profissional.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Nav />
      <main>
        <Hero />
        <Benefits />
        <HowItWorks />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary">
            <div className="size-3 rounded-full bg-background" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Malta Manager</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            search={{ mode: "login" }}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Entrar
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-1 ring-primary/60 transition-all hover:bg-primary-glow active:scale-[0.98]"
          >
            Cadastrar
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="px-6 py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Organização Malta
            </span>
          </div>
          <h1 className="max-w-[20ch] text-balance text-5xl font-medium leading-none tracking-tight md:text-6xl">
            A infraestrutura digital da{" "}
            <span className="text-primary">Organização Malta</span>.
          </h1>
          <p className="max-w-[52ch] text-pretty text-lg leading-relaxed text-muted-foreground">
            Substitua planilhas e formulários por uma plataforma profissional de
            gestão de membros. Transparência financeira e automação para a Malta.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground ring-1 ring-primary/60 transition-all hover:bg-primary-glow"
            >
              Começar agora
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#como-funciona"
              className="rounded-md bg-surface px-5 py-2.5 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-surface-muted"
            >
              Como funciona
            </a>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative grid aspect-square w-full place-items-center rounded-3xl bg-surface ring-1 ring-border">
            <img
              src={foxImage}
              alt="Raposa Malta — mascote da Organização"
              width={800}
              height={800}
              className="size-4/5 object-contain drop-shadow-[0_20px_60px_rgba(255,106,0,0.35)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const benefits = [
  {
    icon: CheckCircle2,
    title: "Pagamentos organizados",
    body: "Gestão automatizada de mensalidades com recibos e histórico transparente.",
  },
  {
    icon: Zap,
    title: "Aprovações rápidas",
    body: "Fluxo otimizado para novos ingressos e validação de comprovantes em segundos.",
  },
  {
    icon: ClipboardList,
    title: "Histórico completo",
    body: "Auditabilidade total de cada transação e mudança de status na organização.",
  },
  {
    icon: Bell,
    title: "Notificações Discord",
    body: "Webhooks integrados para manter a comunidade informada em tempo real.",
  },
];

function Benefits() {
  return (
    <section className="border-y border-border bg-surface/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Benefícios
          </h2>
          <p className="text-3xl font-medium tracking-tight md:text-4xl">
            Tudo sob controle, em um só lugar.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="space-y-4 rounded-xl bg-background p-6 ring-1 ring-border transition-colors hover:ring-primary/40"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <b.icon className="size-4 text-primary" />
              </div>
              <h3 className="font-medium">{b.title}</h3>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    title: "Cadastro de Membro",
    body: "O interessado preenche os dados básicos e vincula sua identidade da Malta.",
  },
  {
    title: "Aprovação Administrativa",
    body: "Líderes revisam a solicitação através de um painel intuitivo e ágil.",
  },
  {
    title: "Acesso ao Ecossistema",
    body: "Liberação automática de permissões e ferramentas exclusivas da guilda.",
  },
  {
    title: "Gestão e Pagamentos",
    body: "Acompanhamento mensal de status e envio de comprovantes via plataforma.",
  },
];

function HowItWorks() {
  return (
    <section id="como-funciona" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-16 lg:grid-cols-2">
          <div>
            <h2 className="mb-12 text-3xl font-medium tracking-tight md:text-4xl">
              Processo simplificado
            </h2>
            <div className="space-y-10">
              {steps.map((s, i) => (
                <div key={s.title} className="flex gap-6">
                  <span className="mt-1 font-mono text-sm font-medium tabular-nums text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4 className="mb-2 font-medium">{s.title}</h4>
                    <p className="max-w-[42ch] text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface p-4 ring-1 ring-border">
              <div className="flex h-full w-full flex-col rounded-lg bg-background ring-1 ring-border">
                <div className="flex h-10 items-center gap-2 border-b border-border px-4">
                  <div className="size-2 rounded-full bg-muted" />
                  <div className="size-2 rounded-full bg-muted" />
                  <div className="size-2 rounded-full bg-muted" />
                </div>
                <div className="space-y-4 p-6">
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="flex h-24 items-center justify-center rounded-lg bg-surface ring-1 ring-primary/25">
                    <span className="text-[10px] uppercase tracking-widest text-primary">
                      Painel de Gestão
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-12 rounded bg-muted" />
                    <div className="h-12 rounded bg-muted" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const faq = [
  {
    q: "Como funciona a aprovação de novos membros?",
    a: "Após o cadastro, o administrador é notificado e revisa o perfil diretamente no painel de controle. O acesso completo é liberado assim que aprovado.",
  },
  {
    q: "Posso enviar comprovantes de pagamento?",
    a: "Sim. Aceitamos PNG, JPG e PDF. Os comprovantes ficam no seu histórico e são validados pelos administradores.",
  },
  {
    q: "O sistema envia avisos de vencimento?",
    a: "Sim, notificações automáticas via Discord e no próprio painel antes e após o vencimento.",
  },
  {
    q: "Quem tem acesso aos meus dados?",
    a: "Apenas você e os administradores da Malta. Todos os dados ficam protegidos por regras de segurança em nível de banco.",
  },
  {
    q: "É possível integrar com o Discord?",
    a: "Sim. Webhooks nativos disparam notificações em canais escolhidos para cadastros, pagamentos e avisos.",
  },
];

function FAQ() {
  return (
    <section className="bg-surface/40 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="mb-12 text-center text-3xl font-medium tracking-tight md:text-4xl">
          Perguntas Frequentes
        </h2>
        <div className="divide-y divide-border">
          {faq.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-left font-medium text-foreground">
                {item.q}
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-6 py-32">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-primary p-12 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="relative z-10 space-y-8">
          <h2 className="text-balance text-4xl font-medium tracking-tight text-primary-foreground md:text-5xl">
            Pronto para organizar a Malta?
          </h2>
          <p className="mx-auto max-w-[44ch] text-pretty text-lg text-primary-foreground/85">
            Junte-se aos membros que já utilizam o Malta Manager diariamente.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="rounded-full bg-background px-8 py-3 font-semibold text-primary transition-transform hover:scale-105"
            >
              Cadastrar agora
            </Link>
            <Link
              to="/auth"
              search={{ mode: "login" }}
              className="rounded-full border border-primary-foreground/30 bg-black/10 px-8 py-3 font-semibold text-primary-foreground transition-colors hover:bg-black/20"
            >
              Já sou membro
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">

        <div className="flex items-center gap-2">
          <div className="flex size-5 items-center justify-center rounded-sm bg-primary">
            <div className="size-2 rounded-full bg-background" />
          </div>

          <span className="text-sm font-medium">
            Malta Manager
          </span>
        </div>

        <div className="flex gap-8">
          <a
            href="https://discord.gg/orgmalta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Discord
          </a>
        </div>

        <span className="text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} Organização Malta.
          <br />
          Desenvolvido por <span className="font-semibold text-primary">Cryand</span>.
        </span>

      </div>
    </footer>
  );
}
