## Fase 1 — Restaurar o projeto do zip (agora)

O zip `malta_2.0.zip` contém o projeto completo com 13 migrations, ~30 rotas, integrações Supabase e assets.

Passos:
1. Copiar todo o conteúdo de `/tmp/malta` para o projeto, **exceto**:
   - `.env` (mantém o `.env` novo da Cloud atual)
   - `src/integrations/supabase/{client.ts, client.server.ts, auth-attacher.ts, auth-middleware.ts, types.ts}` (auto-gerados para o novo projeto Cloud)
   - `supabase/config.toml` (auto-gerado)
   - `.lovable/`, `node_modules/`, `bun.lock`
2. Aplicar as 13 migrations combinadas na nova Cloud (cria tabelas: profiles, user_roles, formularios, membros, pagamentos, chat_messages, avisos, documentos, auditoria, site_settings, etc — vou consolidar num único migration file após ler todas).
3. Reinstalar dependências e reiniciar dev server.
4. Validar que o site carrega em `/` e `/auth`.

**Importante:** o Supabase novo está vazio, então dados antigos (usuários, formulários, pagamentos) não voltam — apenas o schema. Você vai precisar recriar as contas.

## Fase 2 — Correções críticas (próxima mensagem, após restore validado)

Você pediu muita coisa. Vou atacar por ordem de impacto/dependência:

**Bloco A — Formulários e cargos (bug reportado)**
- Corrigir trigger/RLS que atribui cargo "rec" (aguardando avaliação) quando membro envia formulário
- Fazer o formulário enviado aparecer em `/dashboard/admin/formularios`
- Adicionar upload de comprovante de residência no formulário
- No Discord webhook: usar `@discord_username` + ID que o membro colocou no signup

**Bloco B — Sistema de pagamento semanal por admin**
- Coluna `admin_id` (aprovador) em `membros`
- Cálculo "dias até próximo pagamento" visível ao membro
- Quando vencer, mostrar PIX **do admin que aprovou** o membro
- Admin: aba "Enviar PIX" (comprovante) → Dono aprova/rejeita
- Dono: PIX padrão dele + visão consolidada de dívidas por admin
- Dashboard admin: recrutas + total devido só dos seus

**Bloco C — Chat/Suporte (WhatsApp-like)**
- Mostrar avatar + nome do remetente em cada msg
- Clicar no avatar → perfil (cargo, discord, tempo na org, botão seguir)
- Responder mensagem (quote), apagar mensagem
- Indicador "digitando" e "lido"
- Chat suporte: badge "Admin" ao lado do nome
- Layout responsivo mobile

**Bloco D — Melhorias empresariais**
- Máscaras CPF/telefone em tempo real no formulário
- Auditoria completa (quem aprovou, quem trocou cargo, quem viu documento sensível)
- Dashboard de métricas (crescimento, pagamentos semanais, formulários pendentes)
- Exportação CSV/Excel (membros, pagamentos, formulários)
- Backup/restore para Dono
- Sistema de badges/conquistas
- PWA (instalável no celular)

**Adiado (precisa conversa antes):**
- Multi-organização white-label (grande refactor, dias de trabalho)
- Configurações avançadas (temas customizados, domínios, CRM)

## Detalhes técnicos

- Stack mantido: TanStack Start + Supabase (Lovable Cloud), sem trocar nada.
- Migrations consolidadas em um único arquivo para minimizar approvals.
- Chat responsivo com breakpoints; sidebar vira drawer no mobile.
- PIX por admin: nova tabela `admin_pix_keys` + `pix_repasses` com status `pendente/aprovado/rejeitado`.
- Auditoria: tabela `audit_log` + trigger genérico + página `/dashboard/dono/auditoria` já existe, preencher.
- PWA: manifest.json + service worker excluindo `/api/*` e `/~oauth/*`.

## O que preciso de você depois da Fase 1

- Um "usuário teste" — você prefere que eu crie via signup normal (você me dá um email/senha descartável) ou via seed direto? Você mencionou "dps eu apago".
- Confirmar Bloco A → D nessa ordem, ou reordenar.
