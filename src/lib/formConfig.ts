import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FieldKey =
  | "cargo_desejado_id" | "full_name" | "birth_date" | "cpf"
  | "bank_name" | "bank_holder" | "discord_contact" | "discord_avatar_url"
  | "phone_self" | "phone_father" | "phone_mother"
  | "availability" | "experience" | "motivation" | "referred_by" | "location" | "address_proof";

export type FieldCfg = { label: string; required: boolean; hidden: boolean };
export type DocCfg = { key: string; label: string; accept: string; required: boolean; hint?: string };
export type CustomQuestion = {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  options?: string[];
  required: boolean;
  hidden?: boolean;
};

export type FormConfig = {
  title: string;
  subtitle: string;
  warning: string;
  fields: Record<FieldKey, FieldCfg>;
  docs: DocCfg[];
  customQuestions: CustomQuestion[];
};

export const DEFAULT_FIELD_LABELS: Record<FieldKey, string> = {
  cargo_desejado_id: "Cargo pretendido",
  full_name: "Nome completo",
  birth_date: "Data de nascimento",
  cpf: "CPF",
  bank_name: "Banco utilizado",
  bank_holder: "Nome do titular do banco",
  discord_contact: "Discord (usuário)",
  discord_avatar_url: "URL da foto de perfil do Discord",
  phone_self: "Seu número",
  phone_father: "Número do pai",
  phone_mother: "Número da mãe",
  availability: "Disponibilidade (dias/horários)",
  experience: "Experiência anterior",
  motivation: "Motivação para entrar",
  referred_by: "Indicado por (opcional)",
  location: "Localização em tempo real",
  address_proof: "Comprovante de residência",
};

export const DEFAULT_FORM_CONFIG: FormConfig = {
  title: "📝 Formulário de Documentos — MALTA",
  subtitle: "Preencha os dados e anexe todos os documentos solicitados.",
  warning:
    "O preenchimento incorreto, informações falsas ou qualquer tentativa de golpe resultarão em medidas externas, incluindo boletim de ocorrência, além de desclassificação imediata. ATENÇÃO: NÃO REEMBOLSAMOS.",
  fields: Object.fromEntries(
    (Object.keys(DEFAULT_FIELD_LABELS) as FieldKey[]).map((k) => [
      k,
      { label: DEFAULT_FIELD_LABELS[k], required: ["cargo_desejado_id","full_name","birth_date","cpf","bank_name","bank_holder","phone_self","location"].includes(k), hidden: false },
    ]),
  ) as Record<FieldKey, FieldCfg>,
  docs: [
    { key: "rg_front", label: "Foto do RG (frente)", accept: "image/*", required: true },
    { key: "rg_back", label: "Foto do RG (verso)", accept: "image/*", required: true },
    { key: "selfie_rg", label: "Selfie segurando o RG", accept: "image/*", required: true },
    { key: "discord_avatar", label: "Foto do perfil do Discord", accept: "image/*", required: true },
    { key: "video", label: "Vídeo obrigatório de compromisso", accept: "video/*", required: true, hint: "Leia o texto abaixo antes de gravar." },
    { key: "other", label: "Outros documentos (opcional)", accept: "*", required: false },
  ],
  customQuestions: [],
};

export function mergeFormConfig(raw: unknown): FormConfig {
  const r = (raw ?? {}) as Partial<FormConfig>;
  return {
    title: r.title ?? DEFAULT_FORM_CONFIG.title,
    subtitle: r.subtitle ?? DEFAULT_FORM_CONFIG.subtitle,
    warning: r.warning ?? DEFAULT_FORM_CONFIG.warning,
    fields: { ...DEFAULT_FORM_CONFIG.fields, ...(r.fields ?? {}) } as Record<FieldKey, FieldCfg>,
    docs: (r.docs && r.docs.length ? r.docs : DEFAULT_FORM_CONFIG.docs) as DocCfg[],
    customQuestions: (r.customQuestions ?? []) as CustomQuestion[],
  };
}

export function useFormConfig() {
  return useQuery({
    queryKey: ["form_config"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("form_config").eq("id", 1).maybeSingle();
      return mergeFormConfig((data as any)?.form_config);
    },
    staleTime: 60_000,
  });
}