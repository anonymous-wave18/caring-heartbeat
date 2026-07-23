import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/admin/cargos")({
  component: AdminCargos,
});

type Cargo = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  weekly_amount: number | null;
  sort_order: number;
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function AdminCargos() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Cargo> | null>(null);

  const cargosQ = useQuery({
    queryKey: ["cargos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cargos").select("*").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Cargo[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (c: Partial<Cargo>) => {
      const payload = {
        name: c.name!.trim(),
        slug: (c.slug || slugify(c.name!)).trim(),
        description: c.description ?? null,
        color: c.color || "#f97316",
        weekly_amount: c.weekly_amount ?? null,
        sort_order: c.sort_order ?? 0,
      };
      if (c.id) {
        const { error } = await supabase.from("cargos").update(payload).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cargos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cargo salvo.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cargos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo excluído.");
      qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Cargos</h2>
          <p className="text-xs text-muted-foreground">Crie e gerencie os cargos exibidos no formulário e usados para agrupar os membros.</p>
        </div>
        <button onClick={() => setEditing({ name: "", color: "#f97316", sort_order: 0 })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> Novo cargo
        </button>
      </div>

      {cargosQ.isLoading ? <Loader2 className="size-5 animate-spin" /> : (
        <div className="overflow-x-auto rounded-lg bg-surface ring-1 ring-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Valor semanal (opcional)</th>
                <th className="px-4 py-3">Ordem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(cargosQ.data ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-surface-muted/50">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block size-3 rounded-full ring-1 ring-border" style={{ background: c.color }} />
                      <span className="font-medium">{c.name}</span>
                    </span>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.slug}</td>
                  <td className="px-4 py-2.5">{c.weekly_amount == null ? "—" : `R$ ${Number(c.weekly_amount).toFixed(2)}`}</td>
                  <td className="px-4 py-2.5">{c.sort_order}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => setEditing(c)} className="text-primary hover:underline inline-flex items-center gap-1">
                        <Pencil className="size-3.5" /> editar
                      </button>
                      <button onClick={() => { if (confirm(`Excluir cargo "${c.name}"?`)) delMut.mutate(c.id); }}
                        className="text-destructive hover:underline inline-flex items-center gap-1">
                        <Trash2 className="size-3.5" /> excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {cargosQ.data && cargosQ.data.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum cargo cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-lg bg-card p-6 ring-1 ring-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">{editing.id ? "Editar cargo" : "Novo cargo"}</h3>
              <button onClick={() => setEditing(null)}><X className="size-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Nome</span>
                <input className="input" value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Slug</span>
                <input className="input" value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Descrição</span>
                <input className="input" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Cor</span>
                  <input type="color" className="h-10 w-full rounded-md ring-1 ring-border bg-transparent"
                    value={editing.color ?? "#f97316"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Ordem</span>
                  <input type="number" className="input" value={editing.sort_order ?? 0}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Valor semanal</span>
                  <input type="number" step="0.01" className="input" placeholder="padrão"
                    value={editing.weekly_amount ?? ""}
                    onChange={(e) => setEditing({ ...editing, weekly_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditing(null)} className="rounded-md bg-surface px-3 py-2 text-sm ring-1 ring-border hover:bg-surface-muted">Cancelar</button>
                <button onClick={() => saveMut.mutate(editing)} disabled={!editing.name?.trim() || saveMut.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  <Check className="size-4" /> Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}