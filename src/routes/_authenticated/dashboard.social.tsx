import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Heart, MessageCircle, Send, Loader2, UserPlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/lib/useAvatarUrl";

export const Route = createFileRoute("/_authenticated/dashboard/social")({
  head: () => ({
    meta: [
      { title: "Rede Social — Malta" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SocialFeed,
});

type BasicProf = {
  id: string; first_name: string | null; last_name: string | null;
  avatar_url: string | null; discord_username: string | null; email: string | null;
};

function displayName(p?: BasicProf | null) {
  const n = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return n || p?.discord_username || p?.email?.split("@")[0] || "Usuário";
}

function SocialFeed() {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["auth-user-id"], queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null });
  const meId = meQ.data;
  const [body, setBody] = useState("");

  // 1) IDs que eu sigo
  const followingIdsQ = useQuery({
    queryKey: ["my-following-ids", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await (supabase.from("user_follows" as any) as any)
        .select("following_id").eq("follower_id", meId);
      return ((data ?? []) as { following_id: string }[]).map((r) => r.following_id);
    },
  });

  // 2) Feed: posts meus + de quem eu sigo
  const feedQ = useQuery({
    queryKey: ["social-feed", meId, followingIdsQ.data],
    enabled: !!meId && followingIdsQ.data !== undefined,
    queryFn: async () => {
      const authorIds = Array.from(new Set([meId!, ...(followingIdsQ.data ?? [])]));
      const { data: posts } = await (supabase.from("profile_posts" as any) as any)
        .select("id, body, created_at, user_id")
        .in("user_id", authorIds)
        .order("created_at", { ascending: false })
        .limit(80);
      const rows = (posts ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const map = new Map<string, BasicProf>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, avatar_url, discord_username, email")
          .in("id", ids);
        for (const p of profs ?? []) map.set(p.id, p as any);
      }
      return rows.map((r) => ({ ...r, author: map.get(r.user_id) ?? null }));
    },
  });

  // 3) Sugestões — perfis com posts que eu ainda não sigo
  const suggestionsQ = useQuery({
    queryKey: ["social-suggestions", meId, followingIdsQ.data],
    enabled: !!meId && followingIdsQ.data !== undefined,
    queryFn: async () => {
      const excluded = new Set([meId!, ...(followingIdsQ.data ?? [])]);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, avatar_url, discord_username, email, created_at")
        .order("created_at", { ascending: false })
        .limit(24);
      return ((profs ?? []) as any[]).filter((p) => !excluded.has(p.id)).slice(0, 6);
    },
  });

  const createPostMut = useMutation({
    mutationFn: async () => {
      const t = body.trim();
      if (!t) throw new Error("Escreva algo.");
      if (t.length > 500) throw new Error("Máximo 500 caracteres.");
      if (!meId) throw new Error("Sessão expirada.");
      const { error } = await (supabase.from("profile_posts" as any) as any).insert({ user_id: meId, body: t });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      toast.success("Publicado no seu feed!");
      qc.invalidateQueries({ queryKey: ["social-feed"] });
      qc.invalidateQueries({ queryKey: ["profile-posts", meId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const followMut = useMutation({
    mutationFn: async (targetId: string) => {
      if (!meId) throw new Error("Sessão expirada.");
      const { error } = await (supabase.from("user_follows" as any) as any)
        .insert({ follower_id: meId, following_id: targetId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agora você está seguindo.");
      qc.invalidateQueries({ queryKey: ["my-following-ids", meId] });
      qc.invalidateQueries({ queryKey: ["social-suggestions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4 min-w-0">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Rede Social</h1>
          <p className="mt-1 text-sm text-muted-foreground">Feed de quem você segue e da comunidade Malta.</p>
        </div>

        {/* Composer */}
        <section className="rounded-xl bg-surface p-4 ring-1 ring-border">
          <form onSubmit={(e) => { e.preventDefault(); createPostMut.mutate(); }} className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="O que você quer compartilhar com a Malta?"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-2 ring-primary/30"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{body.length}/500</span>
              <button type="submit" disabled={createPostMut.isPending || !body.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors cursor-pointer">
                {createPostMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Publicar
              </button>
            </div>
          </form>
        </section>

        {/* Feed */}
        {feedQ.isLoading ? (
          <div className="grid place-items-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : (feedQ.data ?? []).length === 0 ? (
          <div className="rounded-xl bg-surface p-8 text-center ring-1 ring-border">
            <Sparkles className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Seu feed está vazio. Siga membros nas sugestões ao lado ou publique algo pra começar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(feedQ.data ?? []).map((p: any) => (
              <FeedPost key={p.id} post={p} meId={meId ?? null} />
            ))}
          </div>
        )}
      </div>

      {/* Sugestões */}
      <aside className="space-y-3">
        <div className="rounded-xl bg-surface p-4 ring-1 ring-border">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            Sugestões pra seguir
          </div>
          {suggestionsQ.isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (suggestionsQ.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma sugestão no momento.</p>
          ) : (
            <ul className="space-y-3">
              {(suggestionsQ.data ?? []).map((p: any) => (
                <SuggestionRow key={p.id} p={p} onFollow={() => followMut.mutate(p.id)} pending={followMut.isPending} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function AuthorAvatar({ path, name }: { path: string | null; name: string }) {
  const url = useAvatarUrl(path ?? null);
  const init = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="size-9 shrink-0 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border grid place-items-center text-xs font-medium">
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : init}
    </div>
  );
}

function SuggestionRow({ p, onFollow, pending }: { p: any; onFollow: () => void; pending: boolean }) {
  const name = displayName(p);
  return (
    <li className="flex items-center gap-3">
      <Link to="/dashboard/perfil" search={{ view_id: p.id } as any} className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
        <AuthorAvatar path={p.avatar_url} name={name} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          {p.discord_username && <div className="truncate text-[11px] text-muted-foreground">@{p.discord_username}</div>}
        </div>
      </Link>
      <button onClick={onFollow} disabled={pending}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition-colors">
        <UserPlus className="size-3" /> Seguir
      </button>
    </li>
  );
}

function FeedPost({ post, meId }: { post: any; meId: string | null }) {
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [comment, setComment] = useState("");
  const author = post.author as BasicProf | null;
  const authorName = displayName(author);

  const likesQ = useQuery({
    queryKey: ["post-likes", post.id],
    queryFn: async () => {
      const { data } = await (supabase.from("post_likes" as any) as any).select("user_id").eq("post_id", post.id);
      return (data ?? []) as { user_id: string }[];
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
  const commentsQ = useQuery({
    queryKey: ["post-comments", post.id],
    enabled: showComments,
    queryFn: async () => {
      const { data } = await (supabase.from("post_comments" as any) as any)
        .select("id, body, created_at, user_id").eq("post_id", post.id).order("created_at");
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const map = new Map<string, any>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, first_name, last_name, avatar_url, discord_username, email").in("id", ids);
        for (const p of profs ?? []) map.set(p.id, p);
      }
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
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
      const t = comment.trim();
      if (!t) throw new Error("Escreva um comentário.");
      if (!meId) throw new Error("Sessão expirada.");
      const { error } = await (supabase.from("post_comments" as any) as any)
        .insert({ post_id: post.id, user_id: meId, body: t });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["post-comments", post.id] });
      qc.invalidateQueries({ queryKey: ["post-comments-count", post.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const relativeTime = useMemo(() => {
    const diff = Date.now() - new Date(post.created_at).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "agora";
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    return new Date(post.created_at).toLocaleDateString("pt-BR");
  }, [post.created_at]);

  return (
    <article className="rounded-xl bg-surface p-4 ring-1 ring-border space-y-3">
      <header className="flex items-center gap-3">
        <Link to="/dashboard/perfil" search={{ view_id: post.user_id } as any} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <AuthorAvatar path={author?.avatar_url ?? null} name={authorName} />
          <div>
            <div className="text-sm font-medium">{authorName}</div>
            <div className="text-[11px] text-muted-foreground">{relativeTime}</div>
          </div>
        </Link>
      </header>
      <p className="text-sm whitespace-pre-wrap break-words">{post.body}</p>
      <div className="flex items-center gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
        <button onClick={() => likeMut.mutate()} disabled={likeMut.isPending}
          className={`inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer ${liked ? "text-red-500" : ""}`}>
          <Heart className={`size-4 ${liked ? "fill-current" : ""}`} />
          <span>{likeCount}</span>
        </button>
        <button onClick={() => setShowComments((s) => !s)}
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer">
          <MessageCircle className="size-4" />
          <span>{commentsCountQ.data ?? 0}</span>
        </button>
      </div>
      {showComments && (
        <div className="space-y-2 border-t border-border pt-3">
          {(commentsQ.data ?? []).map((c: any) => (
            <div key={c.id} className="flex items-start gap-2 text-sm">
              <AuthorAvatar path={c.profile?.avatar_url ?? null} name={displayName(c.profile)} />
              <div className="rounded-md bg-surface-muted/40 px-3 py-1.5 flex-1 ring-1 ring-border/50">
                <div className="text-xs font-medium">{displayName(c.profile)}</div>
                <div className="whitespace-pre-wrap break-words">{c.body}</div>
              </div>
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); commentMut.mutate(); }} className="flex gap-2">
            <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300}
              placeholder="Escreva um comentário…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary/60 focus:ring-2 ring-primary/30" />
            <button type="submit" disabled={commentMut.isPending || !comment.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 cursor-pointer transition-colors">
              <Send className="size-3.5" />
            </button>
          </form>
        </div>
      )}
    </article>
  );
}