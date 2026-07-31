/**
 * Helpers server-only do bot do Discord.
 * Segredos (URL da API do bot e shared secret) vivem SOMENTE em env vars.
 * Este arquivo (*.server.ts) nunca entra no bundle do browser.
 */

export type BotCommand = "ping" | "assign_role" | "remove_role" | "send_dm" | "sync_user";

export function botSecretsConfigured() {
  return {
    apiUrl: Boolean(process.env.DISCORD_BOT_API_URL),
    sharedSecret: Boolean(process.env.DISCORD_BOT_SHARED_SECRET),
  };
}

/** Remove menções em massa e limita o tamanho de qualquer texto enviado por DM. */
export function sanitizeMessage(input: string, max = 1800) {
  return input
    .replace(/@everyone/gi, "[everyone]")
    .replace(/@here/gi, "[here]")
    .replace(/<@&\d+>/g, "[cargo]")
    .replace(/<@!?\d+>/g, "[membro]")
    .trim()
    .slice(0, max);
}

export function renderTemplate(tpl: string, vars: Record<string, string | null | undefined>) {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? "").trim());
}

async function hmacHex(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Envia um comando para a API REST do bot (hospedado no Discloud).
 * Autenticação: shared secret + assinatura HMAC-SHA256 do corpo + timestamp.
 */
export async function callBot(
  command: BotCommand,
  payload: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const apiUrl = process.env.DISCORD_BOT_API_URL;
  const secret = process.env.DISCORD_BOT_SHARED_SECRET;
  if (!apiUrl || !secret) {
    return {
      ok: false,
      error: "Bot não configurado no servidor (DISCORD_BOT_API_URL / DISCORD_BOT_SHARED_SECRET).",
    };
  }

  const timestamp = Date.now().toString();
  const body = JSON.stringify({ command, payload, timestamp });

  let signature: string;
  try {
    signature = await hmacHex(secret, body);
  } catch {
    return { ok: false, error: "Falha ao assinar a requisição do bot." };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/commands`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": signature,
        authorization: `Bearer ${secret}`,
      },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) return { ok: false, error: parsed?.error ?? `Bot respondeu ${res.status}` };
    return { ok: true, data: parsed };
  } catch (e: any) {
    const msg =
      e?.name === "AbortError"
        ? "Tempo esgotado ao falar com o bot."
        : e?.message ?? "Falha de rede ao falar com o bot.";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

/** Grava no log append-only. Nunca lança — log não pode derrubar a ação. */
export async function logBotActivity(
  supabase: any,
  entry: {
    actor_id: string;
    action: string;
    target_user_id?: string | null;
    discord_id?: string | null;
    status: "success" | "error";
    detail?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("bot_activity_logs").insert({
      actor_id: entry.actor_id,
      action: entry.action,
      target_user_id: entry.target_user_id ?? null,
      discord_id: entry.discord_id ?? null,
      status: entry.status,
      detail: entry.detail ?? {},
    });
  } catch (e) {
    console.warn("[bot] falha ao gravar bot_activity_logs", e);
  }
}

/** Garante que o chamador é owner. Lança em caso negativo. */
export async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  if (error) throw new Error("Não foi possível validar suas permissões.");
  if (!data) throw new Error("Apenas o dono pode usar o painel do bot.");
}

/** Resolve discord_id + nome do membro alvo. */
export async function getTargetProfile(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, discord_id, cargo_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Membro não encontrado.");
  if (!data.discord_id) throw new Error("Este membro ainda não tem Discord vinculado.");
  return data as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    discord_id: string;
    cargo_id: string | null;
  };
}

/** Config + mapa de cargos, em uma chamada. */
export async function getBotConfig(supabase: any) {
  const [{ data: settings }, { data: map }] = await Promise.all([
    supabase.from("discord_bot_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("discord_role_map").select("cargo_id, discord_role_id"),
  ]);
  const roleMap = new Map<string, string>();
  for (const r of (map ?? []) as any[]) roleMap.set(r.cargo_id, r.discord_role_id);
  return { settings: settings ?? null, roleMap };
}

/**
 * Gancho best-effort chamado por outras server functions (aprovação de
 * formulário / pagamento). NÃO lança: uma falha do bot nunca pode derrubar
 * um fluxo que já funciona hoje.
 */
export async function botOnEvent(
  supabase: any,
  actorId: string,
  event: "form_approved" | "payment_approved",
  targetUserId: string,
) {
  try {
    const { settings, roleMap } = await getBotConfig(supabase);
    if (!settings?.enabled || !settings.guild_id) return;

    const { data: prof } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, discord_id, cargo_id")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!prof?.discord_id) return;

    const roleId =
      (prof.cargo_id ? roleMap.get(prof.cargo_id) : null) ?? settings.default_member_role_id ?? null;
    if (roleId) {
      await callBot("assign_role", { guild_id: settings.guild_id, discord_id: prof.discord_id, role_id: roleId });
    }
    if (event === "payment_approved" && settings.overdue_role_id) {
      await callBot("remove_role", {
        guild_id: settings.guild_id,
        discord_id: prof.discord_id,
        role_id: settings.overdue_role_id,
      });
    }

    const key = event === "form_approved" ? "welcome" : "renewed";
    const { data: msg } = await supabase
      .from("discord_bot_messages")
      .select("template")
      .eq("key", key)
      .maybeSingle();
    if (msg?.template) {
      const text = sanitizeMessage(
        renderTemplate(msg.template, {
          nome: [prof.first_name, prof.last_name].filter(Boolean).join(" ") || "membro",
        }),
      );
      if (text) await callBot("send_dm", { discord_id: prof.discord_id, message: text });
    }

    await logBotActivity(supabase, {
      actor_id: actorId,
      action: `bot.auto_${event}`,
      target_user_id: prof.id,
      discord_id: prof.discord_id,
      status: "success",
    });
  } catch (e: any) {
    console.warn("[bot] gancho automático falhou", e?.message ?? e);
    await logBotActivity(supabase, {
      actor_id: actorId,
      action: `bot.auto_${event}`,
      target_user_id: targetUserId,
      status: "error",
      detail: { error: String(e?.message ?? e) },
    });
  }
}
