import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import foxImage from "@/assets/malta-fox.png";

const searchSchema = z.object({
  mode: z.enum(["login", "signup"]).catch("login"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Acesso — Malta Manager" },
      { name: "description", content: "Entre ou cadastre-se no Malta Manager." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden border-r border-border bg-surface/40 lg:flex lg:flex-col lg:justify-between lg:p-10">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
          <div className="relative">
            <div className="absolute -inset-10 -z-10 rounded-full bg-primary/20 blur-3xl" />
            <img src={foxImage} alt="Malta" className="mx-auto size-72 object-contain" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-sm bg-primary">
                <div className="size-2 rounded-full bg-background" />
              </div>
              <span className="text-sm font-medium">Malta Manager</span>
            </div>
            <p className="max-w-[36ch] text-sm text-muted-foreground">
              A infraestrutura digital da Organização Malta.
            </p>
          </div>
        </aside>

        <main className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md space-y-8">
            <div className="lg:hidden">
              <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowLeft className="size-4" />
                Voltar
              </Link>
            </div>

            <div className="flex gap-1 rounded-lg bg-surface p-1 ring-1 ring-border">
              <Link
                to="/auth"
                search={{ mode: "login" }}
                className={`flex-1 rounded-md py-2 text-center text-sm font-medium transition-colors ${
                  mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Entrar
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className={`flex-1 rounded-md py-2 text-center text-sm font-medium transition-colors ${
                  mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cadastrar
              </Link>
            </div>

            {mode === "login" ? <LoginForm /> : <SignupForm />}
          </div>
        </main>
      </div>
    </div>
  );
}

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo de 6 caracteres").max(72),
});

function LoginForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Credenciais inválidas" : error.message);
      return;
    }
    toast.success("Bem-vindo de volta");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Entrar na Malta</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesse o painel com seus dados de membro.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="E-mail" name="email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} autoComplete="email" />
        <Field label="Senha" name="password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} autoComplete="current-password" />
        <SubmitButton loading={loading}>Entrar</SubmitButton>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Não tem conta?{" "}
        <Link to="/auth" search={{ mode: "signup" }} className="font-medium text-primary hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}

const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, "Nome obrigatório").max(60),
    lastName: z.string().trim().min(1, "Sobrenome obrigatório").max(60),
    email: z.string().trim().email("E-mail inválido").max(255),
    password: z.string().min(6, "Mínimo de 6 caracteres").max(72),
    confirmPassword: z.string(),
    discordId: z.string().trim().min(1, "Discord ID obrigatório").max(40),
    discordUsername: z.string().trim().min(1, "Usuário do Discord obrigatório").max(60),
    phone: z.string().trim().min(1, "Telefone obrigatório").max(30),
    city: z.string().trim().min(1, "Cidade obrigatória").max(80),
    state: z.string().trim().min(2, "UF obrigatória").max(2),
    accept: z.boolean(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  })
  .refine((d) => d.accept, { message: "Você precisa aceitar os termos", path: ["accept"] });

function SignupForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    discordId: "",
    discordUsername: "",
    phone: "",
    city: "",
    state: "",
    accept: false,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          first_name: parsed.data.firstName,
          last_name: parsed.data.lastName,
          discord_id: parsed.data.discordId,
          discord_username: parsed.data.discordUsername,
          phone: parsed.data.phone,
          city: parsed.data.city,
          state: parsed.data.state.toUpperCase(),
        },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("already registered") ? "E-mail já cadastrado" : error.message);
      return;
    }
    toast.success("Cadastro enviado! Aguarde a aprovação do administrador.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Solicitar cadastro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seus dados serão revisados por um administrador antes do acesso.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" name="firstName" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
          <Field label="Sobrenome" name="lastName" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
        </div>
        <Field label="E-mail" name="email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Senha" name="password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
          <Field label="Confirmar senha" name="confirmPassword" type="password" value={form.confirmPassword} onChange={(v) => setForm({ ...form, confirmPassword: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Discord ID" name="discordId" value={form.discordId} onChange={(v) => setForm({ ...form, discordId: v })} placeholder="123456789012345678" />
          <Field label="Usuário Discord" name="discordUsername" value={form.discordUsername} onChange={(v) => setForm({ ...form, discordUsername: v })} placeholder="@usuario" />
        </div>
        <Field label="Telefone" name="phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="(11) 90000-0000" />
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label="Cidade" name="city" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
          <Field label="UF" name="state" value={form.state} onChange={(v) => setForm({ ...form, state: v.toUpperCase() })} maxLength={2} />
        </div>
        <label className="flex items-start gap-2 pt-1 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={form.accept}
            onChange={(e) => setForm({ ...form, accept: e.target.checked })}
            className="mt-0.5 size-4 rounded border-border bg-surface accent-primary"
          />
          <span>Aceito os termos e regras internas da Organização Malta.</span>
        </label>
        <SubmitButton loading={loading}>Solicitar cadastro</SubmitButton>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  maxLength,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2"
      />
    </div>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground ring-1 ring-primary/60 transition-all hover:bg-primary-glow disabled:opacity-60"
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
