import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Upload, Trash2, FileText, CheckCircle2, XCircle, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFormConfig, type FieldKey } from "@/lib/formConfig";
import { maskCPF, maskPhone, maskCEP, maskDate } from "@/lib/masks";

export const Route = createFileRoute("/_authenticated/dashboard/formulario")({
  component: FormularioPage,
});

function FormularioPage() {
  const qc = useQueryClient();
  const cfgQ = useFormConfig();
  const cfg = cfgQ.data;
  const userQ = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user!,
  });
  const userId = userQ.data?.id;

  const cargosQ = useQuery({
    queryKey: ["cargos"],
    queryFn: async () => {
      const { data } = await supabase.from("cargos").select("id, name, slug, description").order("sort_order").order("name");
      return data ?? [];
    },
  });

  const formQ = useQuery({
    queryKey: ["my-form", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("recruitment_forms").select("*").eq("user_id", userId!).maybeSingle();
      return data;
    },
  });

  const docsQ = useQuery({
    queryKey: ["my-docs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("recruitment_documents").select("*").eq("user_id", userId!).order("created_at");
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    cargo_desejado_id: "",
    full_name: "",
    birth_date: "",
    cpf: "",
    bank_name: "",
    bank_holder: "",
    discord_contact: "",
    discord_avatar_url: "",
    phone_self: "",
    phone_father: "",
    phone_mother: "",
    availability: "",
    experience: "",
    motivation: "",
    referred_by: "",
    location_lat: "" as string | number,
    location_lng: "" as string | number,
    location_captured_at: "" as string | null,
    address_proof: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (formQ.data) {
      const d: any = formQ.data;
      setForm({
        cargo_desejado_id: d.cargo_desejado_id ?? "",
        full_name: d.full_name ?? "",
        birth_date: d.birth_date ?? "",
        cpf: d.cpf ?? "",
        bank_name: d.bank_name ?? "",
        bank_holder: d.bank_holder ?? "",
        discord_contact: d.discord_contact ?? "",
        discord_avatar_url: d.discord_avatar_url ?? "",
        phone_self: d.phone_self ?? "",
        phone_father: d.phone_father ?? "",
        phone_mother: d.phone_mother ?? "",
        availability: d.availability ?? "",
        experience: d.experience ?? "",
        motivation: d.motivation ?? "",
        referred_by: d.referred_by ?? "",
        location_lat: d.location_lat ?? "",
        location_lng: d.location_lng ?? "",
        location_captured_at: d.location_captured_at ?? "",
        address_proof: d.address_proof ?? "",
      });
      setAnswers((d.custom_answers as Record<string, string>) ?? {});
    }
  }, [formQ.data]);

  const readOnly = formQ.data?.status === "submitted" || formQ.data?.status === "approved";

  const saveMut = useMutation({
    mutationFn: async (submit: boolean) => {
      if (!userId) throw new Error("no user");
      const F = cfg?.fields;
      if (submit) {
        const checks: FieldKey[] = [
          "cargo_desejado_id","full_name","birth_date","cpf","bank_name","bank_holder",
          "discord_contact","discord_avatar_url","phone_self","phone_father","phone_mother",
          "availability","experience","motivation","referred_by","address_proof",
        ];
        for (const k of checks) {
          const fc = F?.[k];
          if (fc?.hidden || !fc?.required) continue;
          if (!(form as any)[k]) throw new Error(`Preencha: ${fc.label}`);
        }
        if (F?.location && !F.location.hidden && F.location.required && !form.location_captured_at) {
          throw new Error("Capture sua localização em tempo real.");
        }
        const docs = docsQ.data ?? [];
        const missing = (cfg?.docs ?? []).filter((k) => k.required).filter((k) => !docs.some((d: any) => d.kind === k.key));
        if (missing.length) throw new Error(`Envie: ${missing.map((m) => m.label).join(", ")}`);
        for (const q of cfg?.customQuestions ?? []) {
          if (q.hidden || !q.required) continue;
          if (!answers[q.id]?.toString().trim()) throw new Error(`Responda: ${q.label}`);
        }
      }
      const payload = {
        user_id: userId,
        cargo_desejado_id: form.cargo_desejado_id || null,
        full_name: form.full_name || null,
        birth_date: form.birth_date || null,
        cpf: form.cpf || null,
        bank_name: form.bank_name || null,
        bank_holder: form.bank_holder || null,
        discord_contact: form.discord_contact || null,
        discord_avatar_url: form.discord_avatar_url || null,
        phone_self: form.phone_self || null,
        phone_father: form.phone_father || null,
        phone_mother: form.phone_mother || null,
        availability: form.availability || null,
        experience: form.experience || null,
        motivation: form.motivation || null,
        referred_by: form.referred_by || null,
        location_lat: form.location_lat === "" ? null : Number(form.location_lat),
        location_lng: form.location_lng === "" ? null : Number(form.location_lng),
        location_captured_at: form.location_captured_at || null,
        address_proof: form.address_proof || null,
        custom_answers: answers as any,
        status: (submit ? "submitted" : "not_submitted") as "submitted" | "not_submitted",
        submitted_at: submit ? new Date().toISOString() : null,
      };
      const { error } = await supabase.from("recruitment_forms").upsert(payload as any, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: (_d, submit) => {
      toast.success(submit ? "Formulário enviado para análise!" : "Rascunho salvo.");
      qc.invalidateQueries({ queryKey: ["my-form"] });
      qc.invalidateQueries({ queryKey: ["me-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMut = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: string }) => {
      if (!userId) throw new Error("no user");
      const path = `${userId}/${kind}-${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error } = await supabase.from("recruitment_documents").insert({
        user_id: userId, form_id: formQ.data?.id ?? null,
        file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, kind,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Documento enviado."); qc.invalidateQueries({ queryKey: ["my-docs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delDocMut = useMutation({
    mutationFn: async (doc: { id: string; file_path: string }) => {
      await supabase.storage.from("documents").remove([doc.file_path]);
      const { error } = await supabase.from("recruitment_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido."); qc.invalidateQueries({ queryKey: ["my-docs"] }); },
  });

  function captureLocation() {
    if (!navigator.geolocation) return toast.error("Geolocalização não suportada.");
    toast.loading("Capturando localização...", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          location_lat: pos.coords.latitude,
          location_lng: pos.coords.longitude,
          location_captured_at: new Date().toISOString(),
        }));
        toast.success("Localização capturada.", { id: "geo" });
      },
      (err) => toast.error(err.message, { id: "geo" }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  if (formQ.isLoading || !cfg) return <Loader2 className="size-5 animate-spin" />;
  const F = cfg.fields;
  const show = (k: FieldKey) => !F[k]?.hidden;
  const req = (k: FieldKey) => F[k]?.required;
  const lbl = (k: FieldKey) => F[k]?.label ?? k;

  const status = formQ.data?.status ?? "not_submitted";
  const cargoNome = cargosQ.data?.find((c) => c.id === form.cargo_desejado_id)?.name ?? "(CARGO ADQUIRIDO)";
  const videoText = `Eu, ${form.full_name || "(nome completo)"}, do CPF ${form.cpf || "(número)"}, sou o novo ${cargoNome} da MALTA e concordo que qualquer tentativa de golpe estarei submetido a medidas externas, tais como boletim de ocorrência.`;

  const StatusBanner = () => {
    if (status === "approved") return <Banner icon={<CheckCircle2 className="size-5" />} tone="ok">Formulário aprovado. Você já tem acesso completo.</Banner>;
    if (status === "submitted") return <Banner icon={<Clock className="size-5" />} tone="warn">Aguardando análise da administração.</Banner>;
    if (status === "rejected") return <Banner icon={<XCircle className="size-5" />} tone="err">Formulário recusado. Ajuste os dados e reenvie.{formQ.data?.review_notes ? ` Motivo: ${formQ.data.review_notes}` : ""}</Banner>;
    return null;
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-medium tracking-tight">{cfg.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{cfg.subtitle}</p>
      </header>
      <StatusBanner />

      {show("cargo_desejado_id") && <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
        <h2 className="text-lg font-medium">📌 Vaga desejada</h2>
        <Field label={lbl("cargo_desejado_id")} required={req("cargo_desejado_id")}>
          <select disabled={readOnly} className="input" value={form.cargo_desejado_id}
            onChange={(e) => setForm({ ...form, cargo_desejado_id: e.target.value })}>
            <option value="">Selecione…</option>
            {(cargosQ.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </section>}

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
        <h2 className="text-lg font-medium">👤 Dados pessoais</h2>
        {show("full_name") && <Field label={lbl("full_name")} required={req("full_name")}>
          <input disabled={readOnly} className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>}
        <div className="grid gap-4 sm:grid-cols-2">
          {show("birth_date") && <Field label={lbl("birth_date")} required={req("birth_date")}>
            <input disabled={readOnly} className="input" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: maskDate(e.target.value) })} placeholder="DD/MM/AAAA" inputMode="numeric" maxLength={10} />
          </Field>}
          {show("cpf") && <Field label={lbl("cpf")} required={req("cpf")}>
            <input disabled={readOnly} className="input" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
          </Field>}
          {show("bank_name") && <Field label={lbl("bank_name")} required={req("bank_name")}>
            <input disabled={readOnly} className="input" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
          </Field>}
          {show("bank_holder") && <Field label={lbl("bank_holder")} required={req("bank_holder")}>
            <input disabled={readOnly} className="input" value={form.bank_holder} onChange={(e) => setForm({ ...form, bank_holder: e.target.value })} />
          </Field>}
          {show("discord_contact") && <Field label={lbl("discord_contact")} required={req("discord_contact")}>
            <input disabled={readOnly} className="input" value={form.discord_contact} onChange={(e) => setForm({ ...form, discord_contact: e.target.value })} />
          </Field>}
          {show("discord_avatar_url") && <Field label={lbl("discord_avatar_url")} required={req("discord_avatar_url")}>
            <input disabled={readOnly} className="input" value={form.discord_avatar_url} onChange={(e) => setForm({ ...form, discord_avatar_url: e.target.value })} placeholder="https://…" />
          </Field>}
        </div>
      </section>

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
        <h2 className="text-lg font-medium">📞 Contato</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {show("phone_self") && <Field label={lbl("phone_self")} required={req("phone_self")}>
            <input disabled={readOnly} className="input" value={form.phone_self} onChange={(e) => setForm({ ...form, phone_self: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} />
          </Field>}
          {show("phone_father") && <Field label={lbl("phone_father")} required={req("phone_father")}>
            <input disabled={readOnly} className="input" value={form.phone_father} onChange={(e) => setForm({ ...form, phone_father: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} />
          </Field>}
          {show("phone_mother") && <Field label={lbl("phone_mother")} required={req("phone_mother")}>
            <input disabled={readOnly} className="input" value={form.phone_mother} onChange={(e) => setForm({ ...form, phone_mother: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" inputMode="tel" maxLength={15} />
          </Field>}
        </div>
      </section>

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
        <h2 className="text-lg font-medium">📎 Documentos e verificações</h2>
        <p className="text-xs text-muted-foreground">Envie cada arquivo no campo correspondente. Arquivos ficam privados, apenas o admin e o dono conseguem visualizar.</p>
        <div className="rounded-md bg-background/50 p-3 ring-1 ring-border">
          <div className="text-xs font-medium text-muted-foreground">Texto obrigatório para o vídeo</div>
          <div className="mt-1 text-sm italic">“{videoText}”</div>
        </div>
        <div className="space-y-3">
          {cfg.docs.map((k) => {
            const existing = (docsQ.data ?? []).filter((d: any) => d.kind === k.key);
            return (
              <div key={k.key} className="rounded-md bg-background/50 p-3 ring-1 ring-border">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{k.label} {k.required && <span className="text-destructive">*</span>}</div>
                    {k.hint && <div className="text-xs text-muted-foreground">{k.hint}</div>}
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
                    <Upload className="size-3.5" /> enviar
                    <input type="file" accept={k.accept} className="hidden"
                      disabled={readOnly || uploadMut.isPending}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMut.mutate({ file: f, kind: k.key }); e.currentTarget.value = ""; }} />
                  </label>
                </div>
                {existing.length > 0 && (
                  <ul className="mt-2 divide-y divide-border">
                    {existing.map((d: any) => (
                      <li key={d.id} className="flex items-center justify-between py-1.5 text-xs">
                        <span className="inline-flex items-center gap-2"><FileText className="size-3.5 text-muted-foreground" />{d.file_name}</span>
                        {!readOnly && (
                          <button onClick={() => delDocMut.mutate({ id: d.id, file_path: d.file_path })} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {show("location") && <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
        <h2 className="text-lg font-medium">📍 {lbl("location")}{req("location") && <span className="text-destructive"> *</span>}</h2>
        <p className="text-xs text-muted-foreground">Capturamos apenas as coordenadas no momento em que você clica. Autorize o navegador quando pedir.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={readOnly} onClick={captureLocation}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <MapPin className="size-4" /> Capturar localização atual
          </button>
          {form.location_captured_at && (
            <a target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps?q=${form.location_lat},${form.location_lng}`}
              className="text-sm text-primary hover:underline">
              {Number(form.location_lat).toFixed(5)}, {Number(form.location_lng).toFixed(5)} — abrir no mapa
            </a>
          )}
        </div>
      </section>}

      <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
        <h2 className="text-lg font-medium">💬 Informações adicionais</h2>
        {show("availability") && <Field label={lbl("availability")} required={req("availability")}>
          <textarea disabled={readOnly} rows={2} value={form.availability}
            onChange={(e) => setForm({ ...form, availability: e.target.value })} className="input" />
        </Field>}
        {show("experience") && <Field label={lbl("experience")} required={req("experience")}>
          <textarea disabled={readOnly} rows={3} value={form.experience}
            onChange={(e) => setForm({ ...form, experience: e.target.value })} className="input" />
        </Field>}
        {show("motivation") && <Field label={lbl("motivation")} required={req("motivation")}>
          <textarea disabled={readOnly} rows={3} value={form.motivation}
            onChange={(e) => setForm({ ...form, motivation: e.target.value })} className="input" />
        </Field>}
        {show("referred_by") && <Field label={lbl("referred_by")} required={req("referred_by")}>
          <input disabled={readOnly} value={form.referred_by}
            onChange={(e) => setForm({ ...form, referred_by: e.target.value })} className="input" />
        </Field>}
      </section>

      {cfg.customQuestions.filter((q) => !q.hidden).length > 0 && (
        <section className="rounded-lg bg-surface p-6 ring-1 ring-border space-y-4">
          <h2 className="text-lg font-medium">➕ Perguntas adicionais</h2>
          {cfg.customQuestions.filter((q) => !q.hidden).map((q) => (
            <Field key={q.id} label={q.label} required={q.required}>
              {q.type === "textarea" ? (
                <textarea disabled={readOnly} rows={3} className="input" value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              ) : q.type === "select" ? (
                <select disabled={readOnly} className="input" value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="">Selecione…</option>
                  {(q.options ?? []).map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              ) : (
                <input type={q.type === "number" ? "number" : "text"} disabled={readOnly} className="input"
                  value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              )}
            </Field>
          ))}
        </section>
      )}

      <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/30">
        <div className="font-semibold">⚠️ ATENÇÃO</div>
        <p className="mt-1 whitespace-pre-wrap">{cfg.warning}</p>
      </div>

      {!readOnly && (
        <div className="flex justify-end gap-2">
          <button onClick={() => saveMut.mutate(false)} disabled={saveMut.isPending}
            className="rounded-md bg-surface px-4 py-2 text-sm font-medium ring-1 ring-border hover:bg-surface-muted">Salvar rascunho</button>
          <button onClick={() => saveMut.mutate(true)} disabled={saveMut.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">Enviar para análise</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  );
}

function Banner({ children, icon, tone }: { children: React.ReactNode; icon: React.ReactNode; tone: "ok" | "warn" | "err" }) {
  const cls = tone === "ok" ? "bg-green-500/10 text-green-500 ring-green-500/30"
    : tone === "warn" ? "bg-amber-500/10 text-amber-500 ring-amber-500/30"
    : "bg-destructive/10 text-destructive ring-destructive/30";
  return <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ring-1 ${cls}`}>{icon}<span>{children}</span></div>;
}