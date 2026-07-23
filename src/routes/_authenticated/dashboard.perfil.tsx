import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Upload, KeyRound, Save, Trophy, Send, Trash2, Heart, MessageCircle } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/lib/useAvatarUrl";
import { useRoles, computeRoleFlags } from "@/lib/useRoles";
import type { Profile } from "./dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/perfil")({
  validateSearch: (search) => z.object({ view_id: z.string().optional() }).parse(search),
  component: PerfilPage,
});

function PerfilPage() {
  const { user } = Route.useRouteContext();
  const { view_id: searchViewId } = Route.useSearch();
  const viewId = searchViewId || user.id;
  const isViewingSelf = viewId === user.id;
  
  const queryClient = useQueryClient();
  const rolesQ = useRoles(user.id);
  const { isStaff } = computeRoleFlags(rolesQ.data);

  const profileQuery = useQuery({
    queryKey: ["profile", viewId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", viewId).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const profile = profileQuery.data;

  if (!profile) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-medium tracking-tight">{isViewingSelf ? "Meu perfil" : `Perfil de ${profile.first_name}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{isViewingSelf ? "Atualize suas informações pessoais e credenciais." : "Veja informações sobre este membro."}</p>
      </div>

      <AvatarSection profile={profile} isOwner={isViewingSelf} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["profile", viewId] })} />
      {isViewingSelf ? (
        <>
          <SocialStatsBar profileId={user.id} />
          <ProfileForm profile={profile} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["profile", user.id] })} />
          {isStaff && <AdminPixForm profile={profile} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["profile", user.id] })} />}
          <PostsSection profileId={user.id} canPost={true} />
          <AchievementsSection userId={user.id} />
          <PasswordForm />
        </>
      ) : (
        <PublicProfileView profile={profile} currentUserId={user.id} />
      )}
    </div>
  );
}

function SocialStatsBar({ profileId }: { profileId: string }) {
  const statsQ = useQuery({
    queryKey: ["social-stats", profileId],
    queryFn: async () => {
      const [followers, following, achievements] = await Promise.all([
        (supabase.from("user_follows" as any) as any).select("*", { count: "exact", head: true }).eq("following_id", profileId),
        (supabase.from("user_follows" as any) as any).select("*", { count: "exact", head: true }).eq("follower_id", profileId),
        (supabase.from("user_achievements" as any) as any).select("*", { count: "exact", head: true }).eq("user_id", profileId),
      ]);
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        achievements: achievements.count ?? 0,
      };
    },
  });
  return (
    <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface p-4 ring-1 ring-border text-center">
      <div>
        <div className="text-2xl font-semibold">{statsQ.data?.followers ?? 0}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Seguidores</div>
      </div>
      <div>
        <div className="text-2xl font-semibold">{statsQ.data?.following ?? 0}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Seguindo</div>
      </div>
      <div>
        <div className="text-2xl font-semibold">{statsQ.data?.achievements ?? 0}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Conquistas</div>
      </div>
    </div>
  );
}

function PostsSection({ profileId, canPost }: { profileId: string; canPost: boolean }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const postsQ = useQuery({
    queryKey: ["profile-posts", profileId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("profile_posts" as any) as any)
        .select("id, body, created_at, user_id")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return [];
      return data ?? [];
    },
  });
  const createMut = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) throw new Error("Escreva algo antes de publicar.");
      if (text.length > 500) throw new Error("Máximo 500 caracteres.");
      const { error } = await (supabase.from("profile_posts" as any) as any).insert({ user_id: profileId, body: text });
      if (error) throw error;
    },
    onSuccess: () => { setBody(""); toast.success("Publicado!"); qc.invalidateQueries({ queryKey: ["profile-posts", profileId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("profile_posts" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-posts", profileId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl bg-surface p-6 ring-1 ring-border space-y-4">
      <h2 className="font-medium">Publicações</h2>
      {canPost && (
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="O que você quer compartilhar?"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 ring-primary/30"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{body.length}/500</span>
            <button type="submit" disabled={createMut.isPending || !body.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Publicar
            </button>
          </div>
        </form>
      )}
      <div className="space-y-2">
        {(postsQ.data ?? []).length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-6">Nenhuma publicação ainda.</div>
        )}
        {(postsQ.data ?? []).map((p: any) => (
          <PostCard key={p.id} post={p} canDelete={canPost} onDelete={() => delMut.mutate(p.id)} />
        ))}
      </div>
    </section>
  );
}

function PostCard({ post, canDelete, onDelete }: { post: any; canDelete: boolean; onDelete: () => void }) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState("");
  const meQ = useQuery({ queryKey: ["auth-user-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const meId = meQ.data;

  const likesQ = useQuery({
    queryKey: ["post-likes", post.id],
    queryFn: async () => {
      const { data } = await (supabase.from("post_likes" as any) as any).select("user_id").eq("post_id", post.id);
      return (data ?? []) as { user_id: string }[];
    },
  });
  const commentsQ = useQuery({
    queryKey: ["post-comments", post.id],
    enabled: showComments,
    queryFn: async () => {
      const { data } = await (supabase.from("post_comments" as any) as any)
        .select("id, body, created_at, user_id")
        .eq("post_id", post.id).order("created_at");
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const profMap = new Map<string, any>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url, email, discord_username")
          .in("id", ids);
        for (const p of profs ?? []) profMap.set(p.id, p);
      }
      return rows.map((r) => ({ ...r, profile: profMap.get(r.user_id) }));
    },
  });
  const commentsCountQ = useQuery({
    queryKey: ["post-comments-count", post.id],
    queryFn: async () => {
      const { count } = await (supabase.from("post_comments" as any) as any)
        .select("*", { count: "exact", head: true }).eq("post_id", post.id);
      return count ?? 0;
    },
  });

  const liked = !!(meId && likesQ.data?.some((l) => l.user_id === meId));
  const likeCount = likesQ.data?.length ?? 0;

  const likeMut = useMutation({
    mutationFn: async () => {
      if (!meId) throw new Error("Sessão expirada.");
      if (liked) {
        const { error } = await (supabase.from("post_likes" as any) as any).delete().eq("post_id", post.id).eq("user_id", meId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("post_likes" as any) as any).insert({ post_id: post.id, user_id: meId });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-likes", post.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const commentMut = useMutation({
    mutationFn: async () => {
      const text = comment.trim();
      if (!text) throw new Error("Escreva um comentário.");
      if (!meId) throw new Error("Sessão expirada.");
      const { error } = await (supabase.from("post_comments" as any) as any)
        .insert({ post_id: post.id, user_id: meId, body: text });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["post-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["post-comments-count", post.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delCommentMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("post_comments" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["post-comments-count", post.id] });
    },
  });

  return (
    <div className="rounded-lg bg-surface-muted/40 p-3 ring-1 ring-border">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm whitespace-pre-wrap break-words flex-1">{post.body}</p>
        {canDelete && (
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1" title="Apagar">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{new Date(post.created_at).toLocaleString("pt-BR")}</div>

      <div className="mt-2 flex items-center gap-4 border-t border-border/60 pt-2">
        <button
          onClick={() => likeMut.mutate()}
          disabled={likeMut.isPending}
          className={`inline-flex items-center gap-1.5 text-xs transition-colors ${liked ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}
        >
          <Heart className={`size-4 ${liked ? "fill-current" : ""}`} />
          <span>{likeCount}</span>
        </button>
        <button
          onClick={() => setShowComments((s) => !s)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <MessageCircle className="size-4" />
          <span>{commentsCountQ.data ?? 0}</span>
        </button>
      </div>

      {showComments && (
        <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
          {(commentsQ.data ?? []).map((c: any) => {
            const p = c.profile;
            const name =
              `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
              p?.discord_username ||
              (p?.email ? String(p.email).split("@")[0] : "") ||
              "Usuário";
            const canDel = meId && (c.user_id === meId || post.user_id === meId);
            return (
              <div key={c.id} className="flex items-start gap-2 text-xs">
                <div className="flex-1 rounded-md bg-background/60 px-2 py-1.5">
                  <div className="font-medium text-foreground">{name}</div>
                  <div className="whitespace-pre-wrap break-words text-muted-foreground">{c.body}</div>
                </div>
                {canDel && (
                  <button onClick={() => delCommentMut.mutate(c.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Apagar">
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
          {commentsQ.data && commentsQ.data.length === 0 && (
            <div className="text-[11px] text-muted-foreground text-center py-1">Seja o primeiro a comentar.</div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); commentMut.mutate(); }} className="flex gap-1.5">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Escreva um comentário…"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary/60"
            />
            <button type="submit" disabled={commentMut.isPending || !comment.trim()}
              className="inline-flex items-center rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">
              <Send className="size-3" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function AdminPixForm({ profile, onUpdated }: { profile: any; onUpdated: () => void }) {
  const [form, setForm] = useState({
    pix_key: profile.pix_key ?? "",
    pix_key_type: profile.pix_key_type ?? "",
    pix_beneficiary: profile.pix_beneficiary ?? "",
  });
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update(form).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("PIX atualizado."); onUpdated(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4 rounded-lg bg-surface p-6 ring-1 ring-border relative overflow-hidden">
      {mut.isPending && <div className="absolute inset-0 z-10 bg-surface/50 backdrop-blur-[1px] grid place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></div>}
      <div>
        <h2 className="text-lg font-medium">Meu PIX (recrutador)</h2>
        <p className="text-sm text-muted-foreground">Membros que você aprovar verão apenas o seu PIX na cobrança semanal.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Tipo
          <select className="input mt-1" value={form.pix_key_type} onChange={(e) => setForm({ ...form, pix_key_type: e.target.value })}>
            <option value="">—</option>
            <option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
            <option value="email">E-mail</option><option value="telefone">Telefone</option>
            <option value="aleatoria">Aleatória</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">Chave
          <input className="input mt-1" value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} />
        </label>
        <label className="text-sm sm:col-span-3">Beneficiário
          <input className="input mt-1" value={form.pix_beneficiary} onChange={(e) => setForm({ ...form, pix_beneficiary: e.target.value })} />
        </label>
      </div>
      <button type="submit" disabled={mut.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        <Save className="size-4" /> Salvar PIX
      </button>
    </form>
  );
}

function AvatarSection({ profile, isOwner, onUpdated }: { profile: Profile; isOwner: boolean; onUpdated: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const avatarUrl = useAvatarUrl(profile.avatar_url);

  async function handleFile(file: File) {
    if (!/(png|jpe?g|webp)$/i.test(file.name)) {
      toast.error("Envie um arquivo PNG, JPG ou WEBP");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("O arquivo deve ter até 3 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()!.toLowerCase();
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;

      // remove old file
      if (profile.avatar_url) {
        await supabase.storage.from("avatars").remove([profile.avatar_url]);
      }

      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", profile.id);
      if (updErr) throw updErr;

      toast.success("Foto atualizada");
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar foto");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface p-6 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-6">
        <div className="size-20 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-2xl font-semibold text-muted-foreground">
              {(profile.first_name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <h2 className="font-medium">Foto de perfil</h2>
          <p className="mt-1 text-xs text-muted-foreground">PNG, JPG ou WEBP · até 3 MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {isOwner && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-1 ring-primary/60 transition-colors hover:bg-primary-glow disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Enviar foto
          </button>
        )}
      </div>
    </section>
  );
}

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Nome obrigatório").max(60),
  last_name: z.string().trim().min(1, "Sobrenome obrigatório").max(60),
  discord_username: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(1, "Telefone obrigatório").max(30),
  city: z.string().trim().min(1, "Cidade obrigatória").max(80),
  state: z.string().trim().length(2, "UF com 2 letras").transform((s) => s.toUpperCase()),
});

function ProfileForm({ profile, onUpdated }: { profile: Profile; onUpdated: () => void }) {
  const [form, setForm] = useState({
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    discord_username: profile.discord_username ?? "",
    phone: profile.phone ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
  });

  useEffect(() => {
    setForm({
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      discord_username: profile.discord_username ?? "",
      phone: profile.phone ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
    });
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { error } = await supabase.from("profiles").update(parsed.data).eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      onUpdated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl bg-surface p-6 ring-1 ring-border">
      <h2 className="font-medium">Informações pessoais</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-5 grid gap-4 sm:grid-cols-2"
      >
        <Field label="Nome" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
        <Field label="Sobrenome" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
        <Field label="E-mail" value={profile.email} onChange={() => {}} disabled />
        <Field label="Usuário Discord" value={form.discord_username} onChange={(v) => setForm({ ...form, discord_username: v })} />
        <Field label="Telefone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
          <Field label="UF" value={form.state} onChange={(v) => setForm({ ...form, state: v.toUpperCase() })} maxLength={2} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-1 ring-primary/60 transition-colors hover:bg-primary-glow disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar alterações
          </button>
        </div>
      </form>
    </section>
  );
}

function PasswordForm() {
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const change = useMutation({
    mutationFn: async () => {
      if (pw.next.length < 6) throw new Error("Mínimo de 6 caracteres");
      if (pw.next !== pw.confirm) throw new Error("As senhas não coincidem");
      const { error } = await supabase.auth.updateUser({ password: pw.next });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Senha atualizada");
      setPw({ next: "", confirm: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl bg-surface p-6 ring-1 ring-border">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <h2 className="font-medium">Alterar senha</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
        className="mt-5 grid gap-4 sm:grid-cols-2"
      >
        <Field label="Nova senha" type="password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} />
        <Field label="Confirmar nova senha" type="password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} />
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={change.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-4 py-2 text-sm font-medium ring-1 ring-border transition-colors hover:bg-surface disabled:opacity-60"
          >
            {change.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Alterar senha
          </button>
        </div>
      </form>
    </section>
  );
}

function AchievementsSection({ userId }: { userId: string }) {
  const allQ = useQuery({
    queryKey: ["achievements-all"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("achievements" as any) as any).select("*");
      if (error) return [];
      return data ?? [];
    },
  });
  const userQ = useQuery({
    queryKey: ["user-achievements", userId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("user_achievements" as any) as any).select("achievement_id").eq("user_id", userId);
      if (error) return [];
      return data ?? [];
    },
  });

  const unlockedIds = new Set((userQ.data ?? []).map((u: any) => u.achievement_id));
  const badges = (allQ.data ?? []).map((a: any) => ({ name: a.name, desc: a.description, unlocked: unlockedIds.has(a.id) }));

  return (
    <section className="rounded-xl bg-surface p-6 ring-1 ring-border">
      <div className="flex items-center gap-2 mb-6">
        <Trophy className="size-4 text-primary" />
        <h2 className="font-medium">Minhas Conquistas</h2>
      </div>
      {badges.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">Nenhuma conquista cadastrada ainda.</div>
      ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {badges.map((b: any, i: number) => (
          <div key={i} className={`flex flex-col items-center p-4 rounded-xl ring-1 transition-all ${b.unlocked ? "bg-primary/5 ring-primary/20" : "bg-surface-muted/30 ring-border opacity-50 grayscale"}`}>
            <div className="p-3 rounded-full bg-background mb-3 ring-1 ring-border text-primary">
              <Trophy className="size-6" />
            </div>
            <div className="text-sm font-semibold text-center">{b.name}</div>
            <div className="text-[10px] text-muted-foreground text-center mt-1">{b.desc}</div>
            {b.unlocked && (
              <div className="mt-3 px-2 py-0.5 rounded-full bg-success/10 text-[9px] font-bold text-success uppercase tracking-wider">Desbloqueado</div>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/30 transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 disabled:opacity-60"
      />
    </div>
  );
}

function PublicProfileView({ profile, currentUserId }: { profile: Profile; currentUserId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const followingQ = useQuery({
    queryKey: ["is-following", currentUserId, profile.id],
    queryFn: async () => {
      const { data } = await (supabase.from("user_follows" as any) as any)
        .select("follower_id").eq("follower_id", currentUserId).eq("following_id", profile.id).maybeSingle();
      return !!data;
    },
  });

  // Contagens sociais (seguidores, seguindo, conquistas) + cargo
  const statsQ = useQuery({
    queryKey: ["public-profile-stats", profile.id],
    queryFn: async () => {
      const [followers, following, achievements, roles, cargo] = await Promise.all([
        (supabase.from("user_follows" as any) as any)
          .select("*", { count: "exact", head: true }).eq("following_id", profile.id),
        (supabase.from("user_follows" as any) as any)
          .select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
        (supabase.from("user_achievements" as any) as any)
          .select("*", { count: "exact", head: true }).eq("user_id", profile.id),
        supabase.from("user_roles").select("role").eq("user_id", profile.id),
        (profile as any).cargo_id
          ? supabase.from("cargos").select("name").eq("id", (profile as any).cargo_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const roleSet = new Set((roles.data ?? []).map((r: any) => r.role));
      const primaryRole = roleSet.has("owner") ? "Dono" : roleSet.has("admin") ? "Administrador" : "Membro";
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        achievements: achievements.count ?? 0,
        role: primaryRole,
        cargoName: (cargo as any)?.data?.name ?? null,
      };
    },
  });

  const followMut = useMutation({
    mutationFn: async () => {
      if (followingQ.data) {
        const { error } = await (supabase.from("user_follows" as any) as any).delete().eq("follower_id", currentUserId).eq("following_id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("user_follows" as any) as any).insert({ follower_id: currentUserId, following_id: profile.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["is-following", currentUserId, profile.id] });
      qc.invalidateQueries({ queryKey: ["public-profile-stats", profile.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Papel do usuário atual e do alvo — pra decidir quando exibir o botão DM.
  const myRolesQ = useQuery({
    queryKey: ["my-roles", currentUserId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", currentUserId);
      return new Set((data ?? []).map((r: any) => r.role));
    },
  });
  const targetRolesQ = useQuery({
    queryKey: ["target-roles", profile.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", profile.id);
      return new Set((data ?? []).map((r: any) => r.role));
    },
  });
  const iAmStaff = !!(myRolesQ.data && (myRolesQ.data.has("owner") || myRolesQ.data.has("admin")));
  const targetIsStaff = !!(targetRolesQ.data && (targetRolesQ.data.has("owner") || targetRolesQ.data.has("admin")));
  // Staff-staff DM não existe no modelo atual (RLS só aceita member_id do próprio membro).
  const canDM = !(iAmStaff && targetIsStaff) && profile.id !== currentUserId;

  const startDMMut = useMutation({
    mutationFn: async () => {
      navigate({ to: "/dashboard/chat", search: { thread_id: `dm:${profile.id}` } });
    },
  });

  const daysInOrg = Math.max(
    1,
    Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000),
  );

  return (
    <div className="space-y-6">
      {/* Barra estilo Instagram: seguidores / seguindo / conquistas */}
      <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface p-4 ring-1 ring-border text-center">
        <div>
          <div className="text-2xl font-semibold">{statsQ.data?.followers ?? 0}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Seguidores</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{statsQ.data?.following ?? 0}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Seguindo</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{statsQ.data?.achievements ?? 0}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Conquistas</div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => followMut.mutate()} disabled={followMut.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {followingQ.data ? "Seguindo" : "Seguir"}
        </button>
        {canDM && (
          <button onClick={() => startDMMut.mutate()} className="inline-flex items-center gap-2 rounded-md bg-surface-muted px-4 py-2 text-sm font-medium ring-1 ring-border hover:bg-surface-muted/70 transition-colors">
            Enviar Mensagem (DM)
          </button>
        )}
      </div>

      <section className="rounded-xl bg-surface p-6 ring-1 ring-border space-y-4">
        <h3 className="font-medium">Sobre</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><div className="text-xs text-muted-foreground uppercase">Cargo</div><div>{statsQ.data?.role ?? "Membro"}{statsQ.data?.cargoName ? ` · ${statsQ.data.cargoName}` : ""}</div></div>
          <div><div className="text-xs text-muted-foreground uppercase">Discord</div><div>{profile.discord_username || "—"}</div></div>
          <div><div className="text-xs text-muted-foreground uppercase">Membro desde</div><div>{new Date(profile.created_at).toLocaleDateString("pt-BR")}</div></div>
          <div><div className="text-xs text-muted-foreground uppercase">Tempo na organização</div><div>{daysInOrg} dia{daysInOrg > 1 ? "s" : ""}</div></div>
        </div>
      </section>
      <AchievementsSection userId={profile.id} />
      <PostsSection profileId={profile.id} canPost={false} />
    </div>
  );
}