import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Hash, User as UserIcon, Loader2, Shield, Menu, X, ArrowLeft, Trash2, Mic, Reply } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, computeRoleFlags } from "@/lib/useRoles";
import { useAvatarUrl } from "@/lib/useAvatarUrl";

export const Route = createFileRoute("/_authenticated/dashboard/chat")({
  component: ChatPage,
});

type BasicProfile = { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; cargo_id: string | null; is_staff: boolean };

function initials(p?: BasicProfile | null) {
  const a = (p?.first_name ?? "").trim()[0] ?? "";
  const b = (p?.last_name ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}
function displayName(p?: BasicProfile | null) {
  const n = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return n || "Usuário";
}

function useProfilesBasic(ids: string[]) {
  const key = useMemo(() => Array.from(new Set(ids)).sort(), [ids]);
  return useQuery({
    queryKey: ["profiles-basic", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_basic", { _ids: key });
      if (error) throw error;
      const map = new Map<string, BasicProfile>();
      for (const r of (data ?? []) as BasicProfile[]) map.set(r.id, r);
      return map;
    },
  });
}

function ChatPage() {
  const qc = useQueryClient();
  const userQ = useQuery({ queryKey: ["auth-user"], queryFn: async () => (await supabase.auth.getUser()).data.user! });
  const userId = userQ.data?.id;
  const rolesQ = useRoles(userId);
  const { isStaff } = computeRoleFlags(rolesQ.data);

  const threadsQ = useQuery({
    queryKey: ["threads", userId],
    enabled: !!userId,
    queryFn: async () => {
      // For staff: see all threads. For members: see threads they are part of (member_id = userId) or general
      let q = supabase.from("chat_threads").select("*");
      if (!isStaff) {
        q = q.or(`member_id.eq.${userId},kind.eq.general`);
      }
      const { data } = await q.order("kind").order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  // Ensure #geral thread exists (staff)
  useEffect(() => {
    if (!isStaff) return;
    if (threadsQ.data && !threadsQ.data.find((t) => t.kind === "general")) {
      supabase.from("chat_threads").insert({ kind: "general", title: "geral" }).then(() => {
        qc.invalidateQueries({ queryKey: ["threads"] });
      });
    }
  }, [isStaff, threadsQ.data, qc]);

  // Member: ensure their direct thread exists
  useEffect(() => {
    if (!userId || isStaff) return;
    if (threadsQ.data && !threadsQ.data.find((t) => t.kind === "direct" && t.member_id === userId)) {
      supabase.from("chat_threads").insert({ kind: "direct", member_id: userId, title: "Suporte" }).then(() => {
        qc.invalidateQueries({ queryKey: ["threads"] });
      });
    }
  }, [userId, isStaff, threadsQ.data, qc]);

  const [selected, setSelected] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (!selected && threadsQ.data && threadsQ.data.length > 0) setSelected(threadsQ.data[0].id);
  }, [threadsQ.data, selected]);

  // Load basic profile info for thread member_ids (to show name on the sidebar)
  const memberIds = (threadsQ.data ?? []).map((t) => t.member_id).filter(Boolean) as string[];
  const sidebarProfilesQ = useProfilesBasic(memberIds);

  return (
    <div className="relative flex h-[calc(100vh-140px)] md:h-[calc(100vh-160px)] gap-4">
      {/* Sidebar */}
      <aside className={`
        ${sidebarOpen ? "fixed inset-y-0 left-0 z-40 w-72 translate-x-0" : "fixed inset-y-0 left-0 z-40 w-72 -translate-x-full"}
        md:relative md:z-auto md:w-64 md:translate-x-0 md:shrink-0
        rounded-none md:rounded-lg bg-surface ring-1 ring-border overflow-hidden transition-transform
      `}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-medium">
          Conversas
          <div className="flex items-center gap-1">
            <button title="Enviar Feedback" className="rounded-md p-1 hover:bg-primary/10 text-primary" onClick={() => toast.info("Feedback: Envie sua mensagem no chat de Suporte.")}><Shield className="size-4" /></button>
            <button className="md:hidden rounded-md p-1 hover:bg-surface-muted" onClick={() => setSidebarOpen(false)}><X className="size-4" /></button>
          </div>
        </div>
        <ul className="divide-y divide-border overflow-y-auto max-h-[calc(100vh-220px)]">
          {(threadsQ.data ?? []).map((t) => {
            const memberProf = t.member_id ? sidebarProfilesQ.data?.get(t.member_id) : null;
            let label = t.title ?? "Conversa";
            
            if (t.kind === "general") {
              label = "geral";
            } else if (t.kind === "direct") {
              if (isStaff && memberProf) {
                label = displayName(memberProf);
              } else if (!isStaff) {
                label = "Suporte Administrativo";
              }
            }

            return (
              <li key={t.id}>
                <button onClick={() => { setSelected(t.id); setSidebarOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 ${
                    selected === t.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-surface-muted"
                  }`}>
                  <div className="size-8 shrink-0 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border grid place-items-center text-[10px]">
                    {t.kind === "general" ? <Hash className="size-4" /> : (memberProf?.avatar_url ? <img src={memberProf.avatar_url} alt="" className="size-full object-cover" /> : <UserIcon className="size-4" />)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{label}</div>
                  </div>
                </button>
              </li>
            );
          })}
          {threadsQ.data && threadsQ.data.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground text-center">Nenhuma conversa encontrada.</li>
          )}
        </ul>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 min-w-0 rounded-lg bg-surface ring-1 ring-border overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <button className="rounded-md p-1.5 hover:bg-surface-muted" onClick={() => setSidebarOpen(true)}>
            <Menu className="size-4" />
          </button>
          <span className="text-sm font-medium truncate flex-1">
            {selected ? (threadsQ.data?.find((t) => t.id === selected)?.title === 'Suporte' && !isStaff ? 'Suporte' : (threadsQ.data?.find((t) => t.id === selected)?.title ?? "Conversa")) : "Conversas"}
          </span>
          {selected && (
            <button className="rounded-md p-1.5 hover:bg-surface-muted" onClick={() => setSelected(null)}>
              <ArrowLeft className="size-4" />
            </button>
          )}
        </div>
        {selected && userId
          ? <ThreadView threadId={selected} userId={userId} />
          : <div className="grid h-full place-items-center text-sm text-muted-foreground">Selecione uma conversa.</div>}
      </div>
    </div>
  );
}

function ThreadView({ threadId, userId }: { threadId: string; userId: string }) {
  const qc = useQueryClient();
  const msgsQ = useQuery({
    queryKey: ["messages", threadId],
    queryFn: async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at");
      return data ?? [];
    },
  });
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  const senderIds = (msgsQ.data ?? []).map((m) => m.sender_id);
  const uniqueSenderIds = Array.from(new Set(senderIds));
  const profsQ = useProfilesBasic(uniqueSenderIds);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgsQ.data]);

  useEffect(() => {
    const ch = supabase.channel(`msg-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", threadId] }))
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const typing = new Set<string>();
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.isTyping && p.userId !== userId) typing.add(p.userId);
          });
        });
        setTypingUsers(typing);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ userId, isTyping });
        }
      });
    return () => { supabase.removeChannel(ch); };
  }, [threadId, qc, userId, isTyping]);

  function handleTyping() {
    if (!isTyping) setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
  }

  const sendMut = useMutation({
    mutationFn: async () => {
      const body = text.trim(); if (!body) return;
      const { error } = await supabase.from("chat_messages").insert({ thread_id: threadId, sender_id: userId, body });
      if (error) throw error;
      setText("");
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {msgsQ.isLoading ? <Loader2 className="size-5 animate-spin" /> : (msgsQ.data ?? []).map((m) => {
          const isMe = m.sender_id === userId;
          const p = profsQ.data?.get(m.sender_id);
          return (
            <div key={m.id} className={`flex items-end gap-2 group ${isMe ? "justify-end" : "justify-start"}`}>
              {!isMe && (
                <button 
                  onClick={() => window.location.href = `/dashboard/membros?id=${m.sender_id}`}
                  className="size-8 shrink-0 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border grid place-items-center text-[11px] font-medium text-muted-foreground hover:ring-primary/50 transition-all focus:ring-2"
                >
                  <AvatarImage path={p?.avatar_url} fallback={initials(p)} />
                </button>
              )}
              <div className="relative group/msg max-w-[85%] sm:max-w-[75%]">
                <div className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-surface-muted text-foreground rounded-bl-sm"
                }`}>
                  {!isMe && (
                    <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium">
                      <span className="text-foreground/80">{p?.is_staff ? (p.first_name || "Admin") : displayName(p)}</span>
                      {p?.is_staff && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary ring-1 ring-primary/30">
                          <Shield className="size-2.5" /> ADM
                        </span>
                      )}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className={`mt-0.5 flex items-center justify-between gap-2 text-[10px] ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    {isMe && <span className="opacity-0 group-hover/msg:opacity-100 transition-opacity">Lido</span>}
                  </div>
                </div>
                
                {/* Ações de mensagem (simuladas UI) */}
                <div className={`absolute top-0 ${isMe ? "-left-12" : "-right-12"} hidden group-hover/msg:flex items-center gap-1 p-1 transition-all`}>
                   <button className="p-1.5 hover:bg-surface-muted rounded-full text-muted-foreground transition-colors" title="Responder"><Reply className="size-3.5" /></button>
                   {isMe && <button className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-full text-muted-foreground transition-colors" title="Apagar"><Trash2 className="size-3.5" /></button>}
                </div>
              </div>
              {isMe && (
                <button 
                  onClick={() => window.location.href = `/dashboard/perfil`}
                  className="size-8 shrink-0 overflow-hidden rounded-full bg-primary/20 ring-1 ring-primary/40 grid place-items-center text-[11px] font-medium text-primary hover:ring-primary transition-all focus:ring-2"
                >
                  <AvatarImage path={p?.avatar_url} fallback={initials(p)} />
                </button>
              )}
            </div>
          );
        })}
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground animate-pulse">
            <div className="flex gap-0.5">
              <span className="size-1 rounded-full bg-muted-foreground/50" />
              <span className="size-1 rounded-full bg-muted-foreground/50" />
              <span className="size-1 rounded-full bg-muted-foreground/50" />
            </div>
            {Array.from(typingUsers).map(id => displayName(profsQ.data?.get(id))).join(", ")} está digitando...
          </div>
        )}
        {msgsQ.data && msgsQ.data.length === 0 && <div className="text-center text-sm text-muted-foreground">Sem mensagens ainda.</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); sendMut.mutate(); }}
        className="flex items-center gap-2 border-t border-border p-2 sm:p-3 bg-surface">
        <button type="button" className="p-2 text-muted-foreground hover:text-primary rounded-full hover:bg-primary/5 transition-colors" title="Gravar áudio">
          <Mic className="size-5" />
        </button>
        <div className="relative flex-1">
          <input value={text} onChange={(e) => { setText(e.target.value); handleTyping(); }} placeholder="Digite uma mensagem…" className="input pr-10" />
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-primary/50 hover:text-primary">GIF</button>
        </div>
        <button type="submit" disabled={!text.trim() || sendMut.isPending}
          className="inline-flex items-center gap-1 rounded-full bg-primary p-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-primary/20">
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}

function AvatarImage({ path, fallback }: { path: string | null | undefined; fallback: string }) {
  const url = useAvatarUrl(path ?? null);
  if (url) return <img src={url} alt="" className="size-full object-cover" />;
  if (path && (path.startsWith("http") || path.startsWith("blob:"))) return <img src={path} alt="" className="size-full object-cover" />;
  return <>{fallback}</>;
}