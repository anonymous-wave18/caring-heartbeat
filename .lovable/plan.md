# Plano — Funcionalidade Completa Malta Manager

## Objetivo
Eliminar todos os placeholders "em breve" / "em desenvolvimento" / "simulado" e conectar cada função ao Supabase real. Entregar um SQL único para executar no seu projeto.

## 1. SQL para executar (novas tabelas e ajustes)

Vou entregar um único bloco SQL com:

- `organizations` (multi-tenant): id, name, slug, plan, owner_email, mrr_cents, status, created_at + GRANTs + RLS (apenas master lê/escreve).
- `chat_messages`: adicionar colunas `reply_to_id uuid`, `attachment_url text`, `attachment_kind text` (audio/image/gif).
- `user_follows` (para botão Seguir do perfil): follower_id, following_id + RLS.
- `feedback` (envio de feedback do sistema pelo chat): user_id, message, category, created_at + RLS.
- `master_users` view (agrega profiles + roles + org).
- Bucket storage `chat-audio` para gravações.
- Seed inicial da organização "Malta" com você (`cry498434@gmail.com`) como owner_email.

## 2. Correções de código

### Chat (`dashboard.chat.tsx`)
- Implementar **gravação de áudio real** (MediaRecorder API) → upload no bucket `chat-audio` → mensagem com `attachment_kind='audio'` + player.
- Implementar **responder mensagem** (reply_to_id), com preview da msg citada.
- Implementar **swipe-to-reply** no mobile (touch events).
- Botão GIF: abrir picker Tenor (ou input de URL simples se sem API).
- Feedback: modal real que insere em `feedback` table.

### Master (`dashboard.master.*`)
- `organizations.tsx`: CRUD real de organizações (listar, criar, editar plano/status, deletar).
- `users.tsx`: listar todos os profiles globais + roles, com filtros e ações (promover, banir).
- `security.tsx`: exibir últimos logs de audit_log com filtros, sessões ativas, tentativas de login.
- `settings.tsx`: config global (nome da plataforma, logo, taxa de comissão SaaS).
- `index.tsx`: remover toast "em breve", botão "Configurar" navega para `/dashboard/master/organizations`.

### Perfil (`dashboard.perfil.tsx`)
- Remover `mockAchievements` → tabela `achievements` real (query por user_id).
- Botão Seguir conecta em `user_follows`.

### Dono (`dashboard.dono.*`)
- Garantir que Repasses, Auditoria, Database e Permissões estão totalmente funcionais (validar cada um).

## 3. Detalhes técnicos

- Áudio: MediaRecorder → Blob webm → `supabase.storage.from('chat-audio').upload()` → salvar path em `attachment_url`.
- Reply: coluna `reply_to_id` + JOIN client-side com msgs já carregadas.
- Swipe: `onTouchStart/Move/End` com threshold de 60px, deslocamento visual via `transform`.
- Master RLS: `has_role(auth.uid(), 'owner')` AND email in ('cry498434@gmail.com', 'candinofpx@gmail.com').

## 4. Entrega
1. SQL único (você executa no SQL Editor do Supabase).
2. Todas as edições de código.
3. Instruções curtas de teste.

## Observação
Não vou testar via Playwright autenticado (sua Supabase é externa, não gerenciada pela Lovable) — validarei via typecheck/build e explicando o comportamento esperado.
