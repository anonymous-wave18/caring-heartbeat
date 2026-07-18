import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, CheckCircle2, Clock, Upload, Copy, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings, formatBRL } from "@/lib/useSiteSettings";
import { maskPixKey } from "@/lib/masks";

export const Route = createFileRoute("/_authenticated/dashboard/pagamentos")({
  component: PagamentosPage,
});

function PagamentosPage() {
  const qc = useQueryClient();
  const settingsQ = useSiteSettings();
  const userQ = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user! });
  const userId = userQ.data?.id;

  const paymentsQ = useQuery({
    queryKey: ["my-payments", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("user_id", userId!).order("week_start", { ascending: false });
      return data ?? [];
    },
  });

  const meProfQ = useQuery({
    queryKey: ["me-recruiter", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("recruited_by").eq("id", userId!).maybeSingle();
      return data;
    },
  });
  const recruiterId = meProfQ.data?.recruited_by ?? null;

  const recruiterPixQ = useQuery({
    queryKey: ["recruiter-pix", recruiterId],
    enabled: !!recruiterId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("first_name,last_name,pix_key,pix_key_type,pix_beneficiary").eq("id", recruiterId!).maybeSingle();
      return data;
    },
  });

  const proofsQ = useQuery({
    queryKey: ["my-proofs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("payment_proofs").select("*").eq("user_id", userId!);
      return data ?? [];
    },
  });

  const generateCurrentMut = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase.rpc("ensure_current_payment", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-payments"] }),
  });

  const uploadProof = useMutation({
    mutationFn: async (args: { paymentId: string; file: File }) => {
      if (!userId) throw new Error("no user");
      const path = `${userId}/${args.paymentId}-${Date.now()}-${args.file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, args.file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("payment_proofs").insert({
        payment_id: args.paymentId, user_id: userId, file_path: path, file_name: args.file.name,
      });
      if (insErr) throw insErr;
      await supabase.from("payments").update({ status: "submitted" }).eq("id", args.paymentId);
    },
    onSuccess: () => {
      toast.success("Comprovante enviado. Aguarde a aprovação.");
      qc.invalidateQueries({ queryKey: ["my-payments"] });
      qc.invalidateQueries({ queryKey: ["my-proofs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (settingsQ.isLoading || paymentsQ.isLoading) return <Loader2 className="size-5 animate-spin" />;

  const settings = settingsQ.data;
  const payments = paymentsQ.data ?? [];
  const current = payments[0];
  const rp = recruiterPixQ.data;
  // Prefer recruiter's PIX; fallback to site default
  const pix = rp?.pix_key
    ? { key: rp.pix_key, key_type: rp.pix_key_type, beneficiary: rp.pix_beneficiary ?? `${rp.first_name ?? ""} ${rp.last_name ?? ""}`.trim(), source: "recrutador" as const }
    : settings?.pix_key
      ? { key: settings.pix_key, key_type: settings.pix_key_type, beneficiary: settings.pix_beneficiary, source: "site" as const }
      : null;
  const now = new Date();
  const daysLeft = current ? Math.ceil((new Date(current.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-medium tracking-tight">Pagamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Semanal — {formatBRL(settings?.weekly_amount ?? 0)}</p>
      </header>

      {!current && (
        <div className="rounded-lg bg-surface p-6 ring-1 ring-border">
          <p className="text-sm text-muted-foreground">Nenhum pagamento gerado ainda para esta semana.</p>
          <button onClick={() => generateCurrentMut.mutate()}
            className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Gerar cobrança da semana
          </button>
        </div>
      )}

      {current && (
        <div className="rounded-lg bg-hero p-6 ring-1 ring-primary/30 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-primary/80">Cobrança atual</div>
              <div className="mt-1 text-2xl font-semibold">{formatBRL(current.amount)}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Semana {current.week_start} → {current.week_end}
              </div>
            </div>
            <StatusPill status={current.status} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CalendarClock className="size-4 text-primary" />
            {current.status === "approved"
              ? <span className="text-success">Pago e aprovado.</span>
              : daysLeft !== null && daysLeft >= 0
                ? <span>Faltam <b className="text-primary">{daysLeft} dias</b> — vence em {current.due_date}</span>
                : <span className="text-destructive">Vencido em {current.due_date}</span>}
          </div>

          {pix && (
            <div className="rounded-md bg-background/50 p-4 ring-1 ring-border space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Dados do PIX</div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/30">
                  {pix.source === "recrutador" ? "PIX do seu recrutador" : "PIX oficial"}
                </span>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <PixField label="Beneficiário" value={pix.beneficiary ?? "—"} />
                <PixField label="Tipo" value={pix.key_type ?? "—"} />
                <PixField label="Chave" value={maskPixKey(pix.key, pix.key_type)} copyable full />
              </div>
            </div>
          )}

          {(current.status === "pending" || current.status === "overdue") && (
            <UploadProofButton onFile={(f) => uploadProof.mutate({ paymentId: current.id, file: f })} pending={uploadProof.isPending} />
          )}
          {current.status === "submitted" && (
            <div className="text-sm text-warning">Comprovante enviado. Aguardando aprovação da administração.</div>
          )}
        </div>
      )}

      <section className="rounded-lg bg-surface ring-1 ring-border">
        <div className="border-b border-border px-6 py-3 text-sm font-medium">Histórico</div>
        <ul className="divide-y divide-border">
          {payments.slice(current ? 1 : 0).map((p) => (
            <li key={p.id} className="flex items-center justify-between px-6 py-3 text-sm">
              <span>{p.week_start} → {p.week_end}</span>
              <span className="text-muted-foreground">{formatBRL(p.amount)}</span>
              <StatusPill status={p.status} />
            </li>
          ))}
          {payments.length <= (current ? 1 : 0) && <li className="px-6 py-4 text-sm text-muted-foreground">Sem histórico.</li>}
        </ul>
      </section>

      <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← voltar</Link>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pending: { label: "Aguardando pagamento", cls: "bg-amber-500/10 text-amber-500 ring-amber-500/30", Icon: Clock },
    submitted: { label: "Em análise", cls: "bg-blue-500/10 text-blue-400 ring-blue-500/30", Icon: Clock },
    approved: { label: "Aprovado", cls: "bg-green-500/10 text-green-500 ring-green-500/30", Icon: CheckCircle2 },
    overdue: { label: "Vencido", cls: "bg-destructive/10 text-destructive ring-destructive/30", Icon: AlertCircle },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${m.cls}`}>
      <m.Icon className="size-3" />{m.label}
    </span>
  );
}

function PixField({ label, value, copyable, full }: { label: string; value: string; copyable?: boolean; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="font-mono text-sm">{value}</span>
        {copyable && (
          <button onClick={() => { navigator.clipboard.writeText(value); toast.success("Chave copiada."); }}
            className="rounded-md p-1 text-muted-foreground hover:text-primary"><Copy className="size-3.5" /></button>
        )}
      </div>
    </div>
  );
}

function UploadProofButton({ onFile, pending }: { onFile: (f: File) => void; pending: boolean }) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-sm transition-colors ${
        drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      }`}
    >
      {pending ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5 text-primary" />}
      <span>Arraste o comprovante ou clique para enviar</span>
      <input type="file" className="hidden" accept="image/*,application/pdf"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
    </label>
  );
}