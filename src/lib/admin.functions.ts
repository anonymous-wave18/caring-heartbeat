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