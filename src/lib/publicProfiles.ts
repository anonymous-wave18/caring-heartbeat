import { supabase } from "@/integrations/supabase/client";

export type PublicProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  cargo_id: string | null;
  is_staff: boolean;
  discord_username: string | null;
  created_at?: string | null;
  email?: string | null;
};

/**
 * Perfis "públicos" (sem PII). Após a blindagem de RLS em `profiles`, membros
 * comuns não conseguem mais ler a tabela direto — usamos a RPC SECURITY DEFINER
 * `get_profiles_basic`, que só devolve campos não sensíveis. O SELECT direto
 * continua como merge para staff (nome/foto atualizados manualmente).
 */
export async function fetchPublicProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  const key = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, PublicProfile>();
  if (key.length === 0) return map;

  const rpc = await (supabase as any).rpc("get_profiles_basic", { _ids: key });
  for (const r of (rpc?.data ?? []) as PublicProfile[]) map.set(r.id, r);

  // Staff (dono/admin) ainda enxerga a tabela: usamos para completar dados.
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, cargo_id, discord_username, email")
    .in("id", key);
  for (const p of (profs ?? []) as any[]) {
    const prev = map.get(p.id);
    map.set(p.id, {
      id: p.id,
      first_name: p.first_name ?? prev?.first_name ?? null,
      last_name: p.last_name ?? prev?.last_name ?? null,
      avatar_url: p.avatar_url ?? prev?.avatar_url ?? null,
      cargo_id: p.cargo_id ?? prev?.cargo_id ?? null,
      is_staff: prev?.is_staff ?? false,
      discord_username: p.discord_username ?? prev?.discord_username ?? null,
      created_at: prev?.created_at ?? null,
      email: p.email ?? null,
    });
  }
  return map;
}

export async function fetchPublicProfile(id: string): Promise<PublicProfile | null> {
  const m = await fetchPublicProfiles([id]);
  return m.get(id) ?? null;
}

/** Diretório de membros aprovados (sugestões da rede social). */
export async function listPublicProfiles(limit = 24): Promise<PublicProfile[]> {
  const { data } = await (supabase as any).rpc("list_public_profiles", { _limit: limit });
  return (data ?? []) as PublicProfile[];
}
