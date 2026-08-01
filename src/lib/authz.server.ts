/**
 * Portão de permissão server-only.
 * O banco pode ter is_staff(_uid) (assinatura atual) ou is_staff(_user_id)
 * (versões antigas). Tenta as duas e nunca engole o erro da RPC.
 */
export async function assertStaff(supabase: any, userId: string) {
  let lastError: string | null = null;
  for (const args of [{ _uid: userId }, { _user_id: userId }]) {
    const { data, error } = await supabase.rpc("is_staff", args);
    if (!error) {
      if (data === true) return;
      throw new Error("Apenas administradores podem fazer isso.");
    }
    lastError = error.message ?? String(error);
  }
  throw new Error(`Não foi possível validar suas permissões: ${lastError}`);
}
