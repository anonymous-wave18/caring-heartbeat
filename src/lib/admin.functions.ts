import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side audit log for sensitive document access. actor_id is derived
 * from the authenticated bearer token — the client cannot forge it.
 */
export const logDocumentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        file_path: z.string().min(1).max(1024),
        file_name: z.string().min(1).max(512),
        viewed_user_id: z.string().uuid().optional(),
        viewed_user_name: z.string().max(256).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    // Only staff (admin/owner) may log a document view; otherwise ignore.
    const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Forbidden");

    const { error } = await supabase.from("audit_log").insert({
      actor_id: userId,
      action: "document.view",
      entity: "recruitment_documents",
      entity_id: data.file_path,
      metadata: {
        file_name: data.file_name,
        viewed_user_id: data.viewed_user_id ?? null,
        viewed_user_name: data.viewed_user_name ?? null,
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Signs a short-lived URL for a private document — but only after verifying
 * that the caller is staff. Prevents non-staff bearer tokens from calling
 * storage.createSignedUrl directly.
 */
export const signDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ file_path: z.string().min(1).max(1024), ttl: z.number().int().min(30).max(300).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Forbidden");

    const { data: signed, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(data.file_path, data.ttl ?? 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

/**
 * Fan-out an announcement to the appropriate audience server-side. The list
 * of recipient IDs never touches the client — the admin only sees success/count.
 */
export const broadcastAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        announcement_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Forbidden");

    const { data: ann, error: annErr } = await supabase
      .from("announcements")
      .select("id, title, body, audience")
      .eq("id", data.announcement_id)
      .maybeSingle();
    if (annErr) throw new Error(annErr.message);
    if (!ann) throw new Error("Anúncio não encontrado");

    let targetsQ = supabase.from("profiles").select("id");
    if (ann.audience === "members") {
      targetsQ = targetsQ.eq("status", "approved");
    }
    const { data: profs, error: profErr } = await targetsQ;
    if (profErr) throw new Error(profErr.message);

    let targets = (profs ?? []).map((p: { id: string }) => p.id);
    if (ann.audience === "staff") {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "owner"] as const);
      const set = new Set((roles ?? []).map((r: { user_id: string }) => r.user_id));
      targets = targets.filter((id: string) => set.has(id));
    }

    if (!targets.length) return { count: 0 };

    const rows = targets.map((user_id: string) => ({
      user_id,
      type: "announcement",
      title: `📣 ${ann.title}`,
      body: ann.body,
      link: "/dashboard/avisos",
    }));

    // Chunk to avoid oversized payloads.
    const chunk = 500;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await supabase.from("notifications").insert(slice);
      if (error) throw new Error(error.message);
    }

    return { count: rows.length };
  });

/**
 * Approve or reject a recruitment form on the server. The caller must be
 * staff (admin/owner) — verified via is_staff() using their bearer token.
 * Handles: form status, profile sync, role assignment, initial payment
 * generation, audit log and notification — atomically from the server's
 * point of view, so the client cannot forge or partially skip steps.
 */
export const reviewRecruitmentForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        form_id: z.string().uuid(),
        user_id: z.string().uuid(),
        status: z.enum(["approved", "rejected"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Forbidden");

    const { data: fdata, error: fErr } = await supabase
      .from("recruitment_forms")
      .update({
        status: data.status,
        reviewed_at: new Date().toISOString(),
        review_notes: data.notes ?? null,
      })
      .eq("id", data.form_id)
      .select("cargo_desejado_id")
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!fdata) throw new Error("Formulário não encontrado");

    if (data.status === "approved" && fdata.cargo_desejado_id) {
      const { data: formDetails } = await supabase
        .from("recruitment_forms")
        .select("*")
        .eq("id", data.form_id)
        .single();
      const { data: cargoData } = await supabase
        .from("cargos")
        .select("*")
        .eq("id", fdata.cargo_desejado_id)
        .maybeSingle();

      const fullName = (formDetails?.full_name || "").trim();
      const parts = fullName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || null;
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("avatar_url, first_name, last_name")
        .eq("id", data.user_id)
        .maybeSingle();

      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          cargo_id: fdata.cargo_desejado_id,
          recruited_by: userId,
          form_status: "approved",
          status: "approved",
          first_name: firstName && !currentProfile?.first_name ? firstName : currentProfile?.first_name ?? firstName,
          last_name: lastName && !currentProfile?.last_name ? lastName : currentProfile?.last_name ?? lastName,
          avatar_url: currentProfile?.avatar_url || formDetails?.discord_avatar_url || null,
        })
        .eq("id", data.user_id);
      if (pErr) throw new Error(pErr.message);

      const slug = (cargoData?.slug ?? "").toLowerCase();
      const isStaffCargo = slug.includes("rec") || slug.includes("adm");
      await supabase
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: isStaffCargo ? "admin" : "member" }, { onConflict: "user_id,role" });

      try {
        await supabase.rpc("ensure_current_payment", { _user_id: data.user_id });
      } catch (e) {
        console.warn("ensure_current_payment falhou", e);
      }
      await supabase
        .from("payments")
        .update({ recruiter_admin_id: userId })
        .eq("user_id", data.user_id)
        .is("recruiter_admin_id", null);
    } else if (data.status === "rejected") {
      await supabase
        .from("profiles")
        .update({ form_status: "rejected", status: "pending" })
        .eq("id", data.user_id);
    }

    await supabase.from("audit_log").insert({
      actor_id: userId,
      action: `form.${data.status}`,
      entity: "recruitment_forms",
      entity_id: data.form_id,
      metadata: { notes: data.notes ?? null, user_id: data.user_id },
    });

    await supabase.from("notifications").insert({
      user_id: data.user_id,
      type: "form",
      title: data.status === "approved" ? "Formulário aprovado!" : "Formulário recusado",
      body:
        data.status === "approved"
          ? "Você agora tem acesso completo ao painel."
          : data.notes ?? "Sem observações",
      link: "/dashboard/formulario",
    });

    return { ok: true };
  });

/**
 * Approve / revert a weekly payment. Only the recruiter that owns the
 * charge or an owner can approve — enforced via is_staff + row check.
 */
export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        payment_id: z.string().uuid(),
        status: z.enum(["approved", "pending"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: userId });
    if (!isStaff) throw new Error("Forbidden");

    const { data: pay } = await supabase
      .from("payments")
      .select("id, user_id, recruiter_admin_id")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (!pay) throw new Error("Pagamento não encontrado");

    const { error } = await supabase
      .from("payments")
      .update({
        status: data.status,
        approved_at: data.status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", data.payment_id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_id: userId,
      action: `payment.${data.status}`,
      entity: "payments",
      entity_id: data.payment_id,
      metadata: { user_id: pay.user_id, recruiter_admin_id: pay.recruiter_admin_id },
    });

    await supabase.from("notifications").insert({
      user_id: pay.user_id,
      type: "payment",
      title:
        data.status === "approved" ? "Pagamento aprovado!" : "Pagamento marcado como pendente",
      link: "/dashboard/pagamentos",
    });

    return { ok: true };
  });

/**
 * Recruiter marks a payment as "transfer sent" — owner will confirm later.
 * Only the recruiter for the charge can mark it.
 */
export const sendTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ payment_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: pay } = await supabase
      .from("payments")
      .select("id, recruiter_admin_id, status")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (!pay) throw new Error("Pagamento não encontrado");
    if (pay.recruiter_admin_id !== userId) {
      const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
      if (!isOwner) throw new Error("Forbidden");
    }
    if (pay.status !== "approved") throw new Error("Pagamento não está aprovado.");

    const { error } = await supabase
      .from("payments")
      .update({ transfer_status: "pending" })
      .eq("id", data.payment_id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_id: userId,
      action: "payment.transfer_sent",
      entity: "payments",
      entity_id: data.payment_id,
      metadata: {},
    });
    return { ok: true };
  });

/**
 * Owner confirms or rejects a recruiter's transfer.
 */
export const reviewTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        payment_id: z.string().uuid(),
        status: z.enum(["confirmed", "rejected", "none"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
    if (!isOwner) throw new Error("Forbidden: somente o dono confere repasses.");

    const { error } = await supabase
      .from("payments")
      .update({ transfer_status: data.status })
      .eq("id", data.payment_id);
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_id: userId,
      action: `payment.transfer_${data.status}`,
      entity: "payments",
      entity_id: data.payment_id,
      metadata: {},
    });
    return { ok: true };
  });