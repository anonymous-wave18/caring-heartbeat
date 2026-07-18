import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, GripVertical, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_FORM_CONFIG, DEFAULT_FIELD_LABELS,
  mergeFormConfig, type FormConfig, type FieldKey, type DocCfg, type CustomQuestion,
} from "@/lib/formConfig";

export const Route = createFileRoute("/_authenticated/dashboard/admin/form-editor")({
  component: FormEditor,
});

function FormEditor() {
  const qc = useQueryClient();
  const cfgQ = useQuery({
    queryKey: ["form_config", "editor"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("form_config").eq("id", 1).maybeSingle();
      return mergeFormConfig((data as any)?.form_config);
    },
  });
  const [cfg, setCfg] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  useEffect(() => { if (cfgQ.data) setCfg(cfgQ.data); }, [cfgQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("site_settings").update({ form_config: cfg as any }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Formulário atualizado.");
      qc.invalidateQueries({ queryKey: ["form_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (cfgQ.isLoading) return <Loader2 className="size-5 animate-spin" />;

  const fieldKeys = Object.keys(DEFAULT_FIELD_LABELS) as FieldKey[];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-medium">Editor do formulário</h2>
          <p className="text-sm text-muted-foreground">Renomeie campos, defina obrigatoriedade, oculte itens e adicione perguntas personalizadas.</p>
        </div>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar alterações
        </button>
      </div>

      <section className="rounded-lg bg-surface p-5 ring-1 ring-border space-y-3">
        <h3 className="font-medium">Cabeçalho</h3>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Título</span>
          <input className="input" value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Subtítulo</span>
          <input className="input" value={cfg.subtitle} onChange={(e) => setCfg({ ...cfg, subtitle: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Aviso de rodapé</span>
          <textarea rows={3} className="input" value={cfg.warning} onChange={(e) => setCfg({ ...cfg, warning: e.target.value })} />
        </label>
      </section>

      <section className="rounded-lg bg-surface p-5 ring-1 ring-border space-y-3">
        <h3 className="font-medium">Campos fixos</h3>
        <p className="text-xs text-muted-foreground">Não é possível remover campos padrão, mas você pode renomear, ocultar ou tornar opcionais.</p>
        <div className="divide-y divide-border rounded-md ring-1 ring-border overflow-hidden">
          {fieldKeys.map((k) => {
            const f = cfg.fields[k];
            return (
              <div key={k} className="grid grid-cols-12 items-center gap-2 p-2 text-sm bg-background/40">
                <div className="col-span-4 text-xs text-muted-foreground truncate" title={k}>{k}</div>
                <input className="input col-span-4" value={f.label}
                  onChange={(e) => setCfg({ ...cfg, fields: { ...cfg.fields, [k]: { ...f, label: e.target.value } } })} />
                <label className="col-span-2 inline-flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={f.required}
                    onChange={(e) => setCfg({ ...cfg, fields: { ...cfg.fields, [k]: { ...f, required: e.target.checked } } })} />
                  Obrigatório
                </label>
                <label className="col-span-2 inline-flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={f.hidden}
                    onChange={(e) => setCfg({ ...cfg, fields: { ...cfg.fields, [k]: { ...f, hidden: e.target.checked } } })} />
                  Ocultar
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg bg-surface p-5 ring-1 ring-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Documentos</h3>
          <button
            onClick={() => setCfg({ ...cfg, docs: [...cfg.docs, { key: `doc_${Date.now()}`, label: "Novo documento", accept: "*", required: false }] })}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary ring-1 ring-primary/30 hover:bg-primary/20">
            <Plus className="size-3.5" /> Adicionar
          </button>
        </div>
        <div className="space-y-2">
          {cfg.docs.map((d, i) => (
            <DocRow key={d.key + i} doc={d}
              onChange={(nd) => { const arr = [...cfg.docs]; arr[i] = nd; setCfg({ ...cfg, docs: arr }); }}
              onDelete={() => setCfg({ ...cfg, docs: cfg.docs.filter((_, j) => j !== i) })}
              onMove={(dir) => {
                const arr = [...cfg.docs]; const j = i + dir;
                if (j < 0 || j >= arr.length) return;
                [arr[i], arr[j]] = [arr[j], arr[i]]; setCfg({ ...cfg, docs: arr });
              }} />
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-surface p-5 ring-1 ring-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Perguntas personalizadas</h3>
          <button
            onClick={() => setCfg({ ...cfg, customQuestions: [...cfg.customQuestions, { id: `q_${Date.now()}`, label: "Nova pergunta", type: "text", required: false }] })}
            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary ring-1 ring-primary/30 hover:bg-primary/20">
            <Plus className="size-3.5" /> Adicionar
          </button>
        </div>
        <div className="space-y-2">
          {cfg.customQuestions.map((q, i) => (
            <QuestionRow key={q.id} q={q}
              onChange={(nq) => { const arr = [...cfg.customQuestions]; arr[i] = nq; setCfg({ ...cfg, customQuestions: arr }); }}
              onDelete={() => setCfg({ ...cfg, customQuestions: cfg.customQuestions.filter((_, j) => j !== i) })}
              onMove={(dir) => {
                const arr = [...cfg.customQuestions]; const j = i + dir;
                if (j < 0 || j >= arr.length) return;
                [arr[i], arr[j]] = [arr[j], arr[i]]; setCfg({ ...cfg, customQuestions: arr });
              }} />
          ))}
          {cfg.customQuestions.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Nenhuma pergunta personalizada.
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar alterações
        </button>
      </div>
    </div>
  );
}

function DocRow({ doc, onChange, onDelete, onMove }: {
  doc: DocCfg; onChange: (d: DocCfg) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-md bg-background/40 p-3 ring-1 ring-border space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button onClick={() => onMove(-1)} className="text-muted-foreground hover:text-foreground text-xs">▲</button>
          <button onClick={() => onMove(1)} className="text-muted-foreground hover:text-foreground text-xs">▼</button>
        </div>
        <GripVertical className="size-4 text-muted-foreground" />
        <input className="input flex-1" value={doc.label} onChange={(e) => onChange({ ...doc, label: e.target.value })} placeholder="Rótulo" />
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Chave (identificador)</span>
          <input className="input" value={doc.key} onChange={(e) => onChange({ ...doc, key: e.target.value.replace(/[^\w-]+/g, "_") })} />
        </label>
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Tipos aceitos</span>
          <select className="input" value={doc.accept} onChange={(e) => onChange({ ...doc, accept: e.target.value })}>
            <option value="image/*">Imagens</option>
            <option value="video/*">Vídeos</option>
            <option value="application/pdf">PDF</option>
            <option value="*">Todos</option>
          </select>
        </label>
        <label className="text-xs inline-flex items-end gap-1">
          <input type="checkbox" checked={doc.required} onChange={(e) => onChange({ ...doc, required: e.target.checked })} />
          Obrigatório
        </label>
      </div>
      <label className="text-xs space-y-1 block">
        <span className="text-muted-foreground">Dica (opcional)</span>
        <input className="input" value={doc.hint ?? ""} onChange={(e) => onChange({ ...doc, hint: e.target.value })} />
      </label>
    </div>
  );
}

function QuestionRow({ q, onChange, onDelete, onMove }: {
  q: CustomQuestion; onChange: (q: CustomQuestion) => void; onDelete: () => void; onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="rounded-md bg-background/40 p-3 ring-1 ring-border space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button onClick={() => onMove(-1)} className="text-muted-foreground hover:text-foreground text-xs">▲</button>
          <button onClick={() => onMove(1)} className="text-muted-foreground hover:text-foreground text-xs">▼</button>
        </div>
        <input className="input flex-1" value={q.label} onChange={(e) => onChange({ ...q, label: e.target.value })} placeholder="Pergunta" />
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs space-y-1">
          <span className="text-muted-foreground">Tipo</span>
          <select className="input" value={q.type} onChange={(e) => onChange({ ...q, type: e.target.value as CustomQuestion["type"] })}>
            <option value="text">Texto curto</option>
            <option value="textarea">Texto longo</option>
            <option value="number">Número</option>
            <option value="select">Seleção</option>
          </select>
        </label>
        <label className="text-xs inline-flex items-end gap-1">
          <input type="checkbox" checked={q.required} onChange={(e) => onChange({ ...q, required: e.target.checked })} />
          Obrigatório
        </label>
        <label className="text-xs inline-flex items-end gap-1">
          <input type="checkbox" checked={q.hidden ?? false} onChange={(e) => onChange({ ...q, hidden: e.target.checked })} />
          Ocultar
        </label>
      </div>
      {q.type === "select" && (
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">Opções (uma por linha)</span>
          <textarea rows={3} className="input" value={(q.options ?? []).join("\n")}
            onChange={(e) => onChange({ ...q, options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
        </label>
      )}
    </div>
  );
}