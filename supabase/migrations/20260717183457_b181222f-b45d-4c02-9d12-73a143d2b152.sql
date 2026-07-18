
-- Form configuration & custom answers
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS form_config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.recruitment_forms ADD COLUMN IF NOT EXISTS custom_answers JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Seed default form_config if empty
UPDATE public.site_settings
SET form_config = jsonb_build_object(
  'title', '📝 Formulário de Documentos — MALTA',
  'subtitle', 'Preencha os dados e anexe todos os documentos solicitados.',
  'warning', 'O preenchimento incorreto, informações falsas ou qualquer tentativa de golpe resultarão em medidas externas, incluindo boletim de ocorrência, além de desclassificação imediata. ATENÇÃO: NÃO REEMBOLSAMOS.',
  'fields', jsonb_build_object(
    'cargo_desejado_id', jsonb_build_object('label','Cargo pretendido','required',true,'hidden',false),
    'full_name',         jsonb_build_object('label','Nome completo','required',true,'hidden',false),
    'birth_date',        jsonb_build_object('label','Data de nascimento','required',true,'hidden',false),
    'cpf',               jsonb_build_object('label','CPF','required',true,'hidden',false),
    'bank_name',         jsonb_build_object('label','Banco utilizado','required',true,'hidden',false),
    'bank_holder',       jsonb_build_object('label','Nome do titular do banco','required',true,'hidden',false),
    'discord_contact',   jsonb_build_object('label','Discord (usuário)','required',false,'hidden',false),
    'discord_avatar_url',jsonb_build_object('label','URL da foto de perfil do Discord','required',false,'hidden',false),
    'phone_self',        jsonb_build_object('label','Seu número','required',true,'hidden',false),
    'phone_father',      jsonb_build_object('label','Número do pai','required',false,'hidden',false),
    'phone_mother',      jsonb_build_object('label','Número da mãe','required',false,'hidden',false),
    'availability',      jsonb_build_object('label','Disponibilidade (dias/horários)','required',false,'hidden',false),
    'experience',        jsonb_build_object('label','Experiência anterior','required',false,'hidden',false),
    'motivation',        jsonb_build_object('label','Motivação para entrar','required',false,'hidden',false),
    'referred_by',       jsonb_build_object('label','Indicado por (opcional)','required',false,'hidden',false),
    'location',          jsonb_build_object('label','Localização em tempo real','required',true,'hidden',false)
  ),
  'docs', jsonb_build_array(
    jsonb_build_object('key','rg_front','label','Foto do RG (frente)','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','rg_back','label','Foto do RG (verso)','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','selfie_rg','label','Selfie segurando o RG','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','discord_avatar','label','Foto do perfil do Discord','accept','image/*','required',true,'hint',''),
    jsonb_build_object('key','video','label','Vídeo obrigatório de compromisso','accept','video/*','required',true,'hint','Leia o texto abaixo antes de gravar.'),
    jsonb_build_object('key','other','label','Outros documentos (opcional)','accept','*','required',false,'hint','')
  ),
  'customQuestions', '[]'::jsonb
)
WHERE id = 1 AND (form_config = '{}'::jsonb OR form_config IS NULL);

-- Allow staff to update site_settings.form_config (already covered by existing staff update policy on site_settings; no change needed)
