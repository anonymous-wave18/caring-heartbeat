import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, X, FileText, Loader2, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/admin/formularios")({
  component: AdminFormularios,
});

function AdminFormularios() {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user! });
  const [filter, setFilter] = useState<"submitted" | "approved" | "rejected" | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const formsQ = useQuery({
    queryKey: ["admin-forms", filter],
    queryFn: async () => {
      let q = supabase.from("recruitment_forms").select("*");
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q.order("submitted_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length === 0) return rows.map((r) => ({ ...r, profiles: null }));
      const { data: profs } = await supabase.from("profiles").select("id,first_name,last_name,email").in("id", ids);
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r) => ({ ...r, profiles: byId.get(r.user_id) ?? null }));
    },
  });

  const countsQ = useQuery({
    queryKey: ["admin-forms-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("recruitment_forms").select("status");
      const c = { submitted: 0, approved: 0, rejected: 0, all: 0, not_submitted: 0 } as Record<string, number>;
      (data ?? []).forEach((r: any) => { c[r.status] = (c[r.status] ?? 0) + 1; c.all += 1; });
      return c;
    },
    refetchInterval: 15000,
  });

  const reviewMut = useMutation({
    mutationFn: async (args: { id: string; user_id: string; status: "approved" | "rejected"; notes?: string }) => {
      // 1. Update form status and get the desired cargo
      const { data: fdata, error: fErr } = await supabase.from("recruitment_forms").update({
        status: args.status, 
        reviewed_at: new Date().toISOString(), 
        review_notes: args.notes ?? null,
      }).eq("id", args.id).select("cargo_desejado_id").maybeSingle();
      
      if (fErr) throw fErr;
      if (!fdata) throw new Error("Formulário não encontrado");

      if (args.status === "approved" && fdata.cargo_desejado_id) {
        // 2. Get form details for syncing
        const { data: formDetails } = await supabase.from("recruitment_forms").select("*").eq("id", args.id).single();
        // 3. Get cargo details
        const { data: cargoData } = await supabase.from("cargos").select("*").eq("id", fdata.cargo_desejado_id).maybeSingle();

        // 4. Update profile with info from form
        const fullName = (formDetails?.full_name || "").trim();
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] || null;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

        // Current profile (para não sobrescrever avatar/nome existentes)
        const { data: currentProfile } = await supabase
          .from("profiles").select("avatar_url, first_name, last_name").eq("id", args.user_id).maybeSingle();

        const { error: pErr } = await supabase.from("profiles").update({
          cargo_id: fdata.cargo_desejado_id,
          recruited_by: meQ.data?.id ?? null,
          form_status: "approved",
          status: "approved",
          first_name: firstName && !currentProfile?.first_name ? firstName : (currentProfile?.first_name ?? firstName),
          last_name: lastName && !currentProfile?.last_name ? lastName : (currentProfile?.last_name ?? lastName),
          avatar_url: currentProfile?.avatar_url || formDetails?.discord_avatar_url || null,
        }).eq("id", args.user_id);
        if (pErr) throw pErr;

        // 5. Update user_roles based on slug or default
        const isStaffCargo = cargoData?.slug?.toLowerCase().includes("rec") || cargoData?.slug?.toLowerCase().includes("admin");
        
        await supabase.from("user_roles").upsert({ 
          user_id: args.user_id, 
          role: isStaffCargo ? "admin" : "member" 
        }, { onConflict: "user_id,role" });

        // 6. Gera a cobrança da semana atual para o novo membro e marca o admin recrutador
        try {
          await supabase.rpc("ensure_current_payment", { _user_id: args.user_id });
        } catch (e) {
          console.warn("ensure_current_payment falhou", e);
        }
        await supabase.from("payments")
          .update({ recruiter_admin_id: meQ.data?.id ?? null })
          .eq("user_id", args.user_id)
          .is("recruiter_admin_id", null);
      } else {
        await supabase.from("profiles").update({
          form_status: "rejected",
          status: "pending"
        }).eq("id", args.user_id);
      }

      // 5. Log action with device info
      await supabase.from("audit_log").insert({
        actor_id: meQ.data?.id,
        action: `form.${args.status}`,
        entity: "recruitment_forms",
        entity_id: args.id,
        metadata: { 
          notes: args.notes,
          user_id: args.user_id,
          ua: navigator.userAgent,
          platform: navigator.platform
        }
      });

      // 6. Notify user
      await supabase.from("notifications").insert({
        user_id: args.user_id, type: "form",
        title: args.status === "approved" ? "Formulário aprovado!" : "Formulário recusado",
        body: args.status === "approved" ? "Você agora tem acesso completo ao painel." : (args.notes ?? "Sem observações"),
        link: "/dashboard/formulario",
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Aprovado." : "Recusado.");
      qc.invalidateQueries({ queryKey: ["admin-forms"] });
      setOpenId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = formsQ.data?.find((f) => f.id === openId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["submitted", "approved", "rejected", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
              filter === f ? "bg-primary text-primary-foreground ring-primary" : "bg-surface ring-border hover:bg-surface-muted"
            }`}>
            {f === "submitted" ? "Aguardando" : f === "approved" ? "Aprovados" : f === "rejected" ? "Recusados" : "Todos"}
            {countsQ.data && (
              <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">
                {countsQ.data[f] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {formsQ.isLoading ? <Loader2 className="size-5 animate-spin" /> : (
        <div className="overflow-x-auto rounded-lg bg-surface ring-1 ring-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Membro</th>
                <th className="px-4 py-3">Discord</th>
                <th className="px-4 py-3">Enviado</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(formsQ.data ?? []).map((f) => {
                const p = (f as any).profiles;
                return (
                  <tr key={f.id} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">{p?.first_name} {p?.last_name}<div className="text-xs text-muted-foreground">{p?.email}</div></td>
                    <td className="px-4 py-2.5">{f.discord_contact ?? "—"}</td>
                    <td className="px-4 py-2.5">{f.submitted_at ? new Date(f.submitted_at).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-2.5">{f.status}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setOpenId(f.id)} className="text-primary hover:underline">Ver</button>
                    </td>
                  </tr>
                );
              })}
              {formsQ.data && formsQ.data.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sem registros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <FormDetail form={open}
          onClose={() => setOpenId(null)}
          onApprove={() => reviewMut.mutate({ id: open.id, user_id: open.user_id, status: "approved" })}
          onReject={(notes) => reviewMut.mutate({ id: open.id, user_id: open.user_id, status: "rejected", notes })}
        />
      )}
    </div>
  );
}

function FormDetail({ form, onClose, onApprove, onReject }: {
  form: any; onClose: () => void; onApprove: () => void; onReject: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const docsQ = useQuery({
    queryKey: ["admin-form-docs", form.id],
    queryFn: async () => {
      const { data } = await supabase.from("recruitment_documents").select("*").eq("user_id", form.user_id);
      return data ?? [];
    },
  });
  const cargosQ = useQuery({
    queryKey: ["cargos"],
    queryFn: async () => (await supabase.from("cargos").select("id,name")).data ?? [],
  });
  const cargoName = cargosQ.data?.find((c: any) => c.id === form.cargo_desejado_id)?.name ?? "—";

  async function download(path: string, name: string) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.target = "_blank"; a.click();
    }
  }

  const [preview, setPreview] = useState<{ url: string; name: string; type: string } | null>(null);
  async function openPreview(path: string, name: string) {
    const { data } = await supabase.storage.from("documents").createSignedUrl(path, 300);
    if (!data?.signedUrl) return;
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const type = ["png","jpg","jpeg","gif","webp","bmp","svg"].includes(ext) ? "image"
      : ext === "pdf" ? "pdf" : "other";
    setPreview({ url: data.signedUrl, name, type });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-card p-6 ring-1 ring-border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Formulário — {form.profiles?.first_name} {form.profiles?.last_name}</h3>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Info label="Vaga desejada" value={cargoName} />
          <Info label="Nome completo" value={form.full_name ?? "—"} />
          <Info label="Data de nascimento" value={form.birth_date ?? "—"} />
          <Info label="CPF" value={form.cpf ?? "—"} />
          <Info label="Banco" value={form.bank_name ?? "—"} />
          <Info label="Titular do banco" value={form.bank_holder ?? "—"} />
          <Info label="Discord" value={form.discord_contact ?? "—"} />
          <div>
            <dt className="text-xs text-muted-foreground">Foto Discord</dt>
            <dd className="mt-1">
              {form.discord_avatar_url
                ? <img src={form.discord_avatar_url} alt="Discord" className="size-12 rounded-full ring-1 ring-border" />
                : "—"}
            </dd>
          </div>
          <Info label="Telefone" value={form.phone_self ?? "—"} />
          <Info label="Telefone pai" value={form.phone_father ?? "—"} />
          <Info label="Telefone mãe" value={form.phone_mother ?? "—"} />
          <Info label="Localização" value={
            form.location_lat && form.location_lng
              ? `${form.location_lat}, ${form.location_lng} (${form.location_captured_at ? new Date(form.location_captured_at).toLocaleString("pt-BR") : ""})`
              : "—"
          } full />
          <Info label="Disponibilidade" value={form.availability ?? "—"} full />
          <Info label="Experiência" value={form.experience ?? "—"} full />
          <Info label="Motivação" value={form.motivation ?? "—"} full />
          <Info label="Indicado por" value={form.referred_by ?? "—"} />
          <Info label="Comprovante Residência" value={form.address_proof ?? "—"} />
        </dl>
        {form.location_lat && form.location_lng && (
          <a target="_blank" rel="noreferrer"
            href={`https://www.google.com/maps?q=${form.location_lat},${form.location_lng}`}
            className="mt-2 inline-block text-sm text-primary hover:underline">Abrir localização no mapa</a>
        )}
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium">Documentos</div>
          <ul className="divide-y divide-border rounded-md bg-surface ring-1 ring-border">
            {(docsQ.data ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between p-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary ring-1 ring-primary/30">{(d as any).kind ?? "other"}</span>
                  {d.file_name}
                </span>
                <div className="flex items-center gap-3">
                  <button onClick={() => openPreview(d.file_path, d.file_name)} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Eye className="size-3.5" /> ver
                  </button>
                  <button onClick={() => download(d.file_path, d.file_name)} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Download className="size-3.5" /> baixar
                  </button>
                </div>
              </li>
            ))}
            {docsQ.data && docsQ.data.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum documento.</li>}
          </ul>
        </div>
        {preview && (
          <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" onClick={() => setPreview(null)}>
            <div className="w-full max-w-3xl rounded-lg bg-card p-3 ring-1 ring-border max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between pb-2">
                <div className="truncate text-sm font-medium">{preview.name}</div>
                <button onClick={() => setPreview(null)} className="p-1 rounded hover:bg-surface-muted"><X className="size-4" /></button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto grid place-items-center bg-black/40 rounded">
                {preview.type === "image" ? (
                  <img src={preview.url} alt={preview.name} className="max-h-full max-w-full object-contain" />
                ) : preview.type === "pdf" ? (
                  <iframe src={preview.url} title={preview.name} className="h-[75vh] w-full bg-white rounded" />
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">
                    Pré-visualização não disponível para este tipo.
                    <a href={preview.url} target="_blank" rel="noreferrer" className="ml-2 text-primary hover:underline">Abrir em nova aba</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="mt-4 space-y-2">
          <textarea rows={2} placeholder="Observações (obrigatório para recusar)"
            value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
          <div className="flex justify-end gap-2">
            <button onClick={() => onReject(notes)} disabled={!notes.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive ring-1 ring-destructive/30 hover:bg-destructive/20 disabled:opacity-50">
              <X className="size-4" /> Recusar
            </button>
            <button onClick={onApprove}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Check className="size-4" /> Aprovar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}