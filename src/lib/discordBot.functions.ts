import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertOwner,
  botSecretsConfigured,
  callBot,
  getBotConfig,
  getTargetProfile,
  logBotActivity,
  renderTemplate,
  sanitizeMessage,
} from "./discordBot.server";

const snowflake = z.string().regex(/^[0-9]{15,25}$/, "ID do Discord inválido (apenas números, 15-25 dígitos).");
const optionalSnowflake = z.union([snowflake, z.literal("")]).optional().nullable();

/** Status do bot: secrets presentes (booleano) + ping. Nunca devolve valores de segredo. */
export const getBotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);
    const secrets = botSecretsConfigured();
    if (!secrets.apiUrl || !secrets.sharedSecret) {
      return { secrets, online: false, error: "Secrets do bot ausentes no servidor." as string | null };
    }
    const res = await callBot("ping", {}, 6000);
    return { secrets, online: res.ok, error: res.ok ? null : res.error };
  });

export const saveBotSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        guild_id: optionalSnowflake,
        default_member_role_id: optionalSnowflake,
        overdue_role_id: optionalSnowflake,
        removal_after_days: z.number().int().min(1).max(90),
        enabled: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);
    const norm = (v?: string | null) => (v && v.length ? v : null);
    const { error } = await supabase
      .from("discord_bot_settings")
      .update({
        guild_id: norm(data.guild_id),
        default_member_role_id: norm(data.default_member_role_id),
        overdue_role_id: norm(data.overdue_role_id),
        removal_after_days: data.removal_after_days,
        enabled: data.enabled,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    await logBotActivity(supabase, { actor_id: userId, action: "bot.settings_updated", status: "success" });
    return { ok: true };
  });

export const saveRoleMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        entries: z
          .array(z.object({ cargo_id: z.string().uuid(), discord_role_id: z.string() }))
          .max(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);

    const toUpsert: { cargo_id: string; discord_role_id: string; updated_at: string }[] = [];
    const toDelete: string[] = [];
    for (const e of data.entries) {
      const v = e.discord_role_id.trim();
      if (!v) {
        toDelete.push(e.cargo_id);
        continue;
      }
      const parsed = snowflake.safeParse(v);
      if (!parsed.success) throw new Error(`Cargo do Discord inválido: "${v}". Use apenas números.`);
      toUpsert.push({ cargo_id: e.cargo_id, discord_role_id: v, updated_at: new Date().toISOString() });
    }

    if (toDelete.length) {
      const { error } = await supabase.from("discord_role_map").delete().in("cargo_id", toDelete);
      if (error) throw new Error(error.message);
    }
    if (toUpsert.length) {
      const { error } = await supabase.from("discord_role_map").upsert(toUpsert, { onConflict: "cargo_id" });
      if (error) throw new Error(error.message);
    }
    await logBotActivity(supabase, {
      actor_id: userId,
      action: "bot.role_map_updated",
      status: "success",
      detail: { mapped: toUpsert.length, cleared: toDelete.length },
    });
    return { ok: true, mapped: toUpsert.length, cleared: toDelete.length };
  });

export const saveBotMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        messages: z
          .array(
            z.object({
              key: z.enum(["welcome", "payment_pending", "payment_overdue", "role_removed", "renewed"]),
              template: z.string().max(1800),
            }),
          )
          .min(1)
          .max(5),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);
    const rows = data.messages.map((m) => ({
      key: m.key,
      template: sanitizeMessage(m.template),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("discord_bot_messages").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await logBotActivity(supabase, { actor_id: userId, action: "bot.messages_updated", status: "success" });
    return { ok: true };
  });

export const assignDiscordRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid(), cargo_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);
    const target = await getTargetProfile(supabase, data.user_id);
    const { settings, roleMap } = await getBotConfig(supabase);
    const roleId = roleMap.get(data.cargo_id);
    if (!roleId) throw new Error("Este cargo ainda não está mapeado para um cargo do Discord.");
    if (!settings?.guild_id) throw new Error("Configure o ID do servidor (Guild ID) antes.");

    const res = await callBot("assign_role", {
      guild_id: settings.guild_id,
      discord_id: target.discord_id,
      role_id: roleId,
    });
    await logBotActivity(supabase, {
      actor_id: userId,
      action: "bot.role_assigned",
      target_user_id: target.id,
      discord_id: target.discord_id,
      status: res.ok ? "success" : "error",
      detail: { role_id: roleId, cargo_id: data.cargo_id, error: res.ok ? null : res.error },
    });
    if (!res.ok) throw new Error(res.error);
    return { ok: true };
  });

export const removeDiscordRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid(), cargo_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);
    const target = await getTargetProfile(supabase, data.user_id);
    const { settings, roleMap } = await getBotConfig(supabase);
    const roleId = roleMap.get(data.cargo_id);
    if (!roleId) throw new Error("Este cargo ainda não está mapeado para um cargo do Discord.");
    if (!settings?.guild_id) throw new Error("Configure o ID do servidor (Guild ID) antes.");

    const res = await callBot("remove_role", {
      guild_id: settings.guild_id,
      discord_id: target.discord_id,
      role_id: roleId,
    });
    await logBotActivity(supabase, {
      actor_id: userId,
      action: "bot.role_removed",
      target_user_id: target.id,
      discord_id: target.discord_id,
      status: res.ok ? "success" : "error",
      detail: { role_id: roleId, cargo_id: data.cargo_id, error: res.ok ? null : res.error },
    });
    if (!res.ok) throw new Error(res.error);
    return { ok: true };
  });

export const sendDiscordDm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ user_id: z.string().uuid(), message: z.string().trim().min(1).max(1800) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);
    const target = await getTargetProfile(supabase, data.user_id);
    const message = sanitizeMessage(data.message);
    if (!message) throw new Error("Mensagem vazia após a sanitização.");

    const res = await callBot("send_dm", { discord_id: target.discord_id, message });
    await logBotActivity(supabase, {
      actor_id: userId,
      action: "bot.dm_sent",
      target_user_id: target.id,
      discord_id: target.discord_id,
      status: res.ok ? "success" : "error",
      detail: { preview: message.slice(0, 200), error: res.ok ? null : res.error },
    });
    if (!res.ok) throw new Error(res.error);
    return { ok: true };
  });

export const syncDiscordUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertOwner(supabase, userId);
    const target = await getTargetProfile(supabase, data.user_id);
    const { settings, roleMap } = await getBotConfig(supabase);
    if (!settings?.guild_id) throw new Error("Configure o ID do servidor (Guild ID) antes.");

    const { data: lastPayment } = await supabase
      .from("payments")
      .select("status, due_date")
      .eq("user_id", target.id)
      .order("due_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const res = await callBot("sync_user", {
      guild_id: settings.guild_id,
      discord_id: target.discord_id,
      role_id: target.cargo_id ? roleMap.get(target.cargo_id) ?? null : null,
      default_role_id: settings.default_member_role_id ?? null,
      overdue_role_id: settings.overdue_role_id ?? null,
      payment_status: lastPayment?.status ?? null,
    });
    await logBotActivity(supabase, {
      actor_id: userId,
      action: "bot.user_synced",
      target_user_id: target.id,
      discord_id: target.discord_id,
      status: res.ok ? "success" : "error",
      detail: { payment_status: lastPayment?.status ?? null, error: res.ok ? null : res.error },
    });
    if (!res.ok) throw new Error(res.error);
    return { ok: true };
  });
