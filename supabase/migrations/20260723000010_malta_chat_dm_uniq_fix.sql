-- Corrige DMs múltiplas por membro: 1 thread por (member_id, alvo) e não por membro.
DROP INDEX IF EXISTS public.chat_threads_direct_member_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_direct_member_target_uniq
  ON public.chat_threads (member_id, title)
  WHERE kind = 'direct';
