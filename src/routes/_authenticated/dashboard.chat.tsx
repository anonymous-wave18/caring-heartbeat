import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Send, Hash, User as UserIcon, Loader2, Shield, Menu, X, ArrowLeft, Trash2, Mic, Reply, UserPlus, Square, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, computeRoleFlags } from "@/lib/useRoles";
import { useAvatarUrl } from "@/lib/useAvatarUrl";

import { z } from "zod";

export const Route = createFileRoute("/_authenticated/dashboard/chat")({
  validateSearch: (search) => z.object({ thread_id: z.string().optional() }).parse(search),
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
      const map = new Map<string, BasicProfile>();
      // 1) tenta a RPC (rápida, já traz is_staff)
      const rpc = await supabase.rpc("get_profiles_basic", { _ids: key });
      if (!rpc.error && rpc.data && rpc.data.length > 0) {
        for (const r of rpc.data as BasicProfile[]) map.set(r.id, r);
        return map;
      }
      // 2) fallback direto: profiles + user_roles
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name, avatar_url, cargo_id").in("id", key),
        supabase.from("user_roles").select("user_id, role").in("user_id", key),
      ]);
      const staffSet = new Set(
        (roles ?? []).filter((r: any) => r.role === "owner" || r.role === "admin").map((r: any) => r.user_id),
      );
      for (const p of profs ?? []) {
        map.set(p.id, {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar_url: p.avatar_url,
          cargo_id: (p as any).cargo_id ?? null,
          is_staff: staffSet.has(p.id),
        });
      }
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

  const { thread_id: threadFromUrl } = Route.useSearch();
  const navigate = useNavigate();
  // Nunca selecionamos um pseudo-id "dm:..." como thread real — só um UUID válido.
  const [selected, setSelected] = useState<string | null>(
    threadFromUrl && !threadFromUrl.startsWith("dm:") ? threadFromUrl : null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  useEffect(() => {
    async function resolveThread() {
      if (threadFromUrl?.startsWith("dm:")) {
        const memberId = threadFromUrl.split(":")[1];
        if (!memberId) return;

        // Se a thread desse membro já existe, usa; senão tenta criar.
        const existing = threadsQ.data?.find((t) => t.kind === "direct" && t.member_id === memberId);
        if (existing) {
          setSelected(existing.id);
          navigate({ to: "/dashboard/chat", search: {}, replace: true });
          return;
        }
        const { data, error } = await supabase
          .from("chat_threads")
          .insert({ kind: "direct", member_id: memberId, title: "Privado" })
          .select()
          .single();
        if (error) {
          toast.error("Não foi possível abrir esta conversa.");
          navigate({ to: "/dashboard/chat", search: {}, replace: true });
          return;
        }
        qc.invalidateQueries({ queryKey: ["threads"] });
        setSelected(data.id);
        navigate({ to: "/dashboard/chat", search: {}, replace: true });
      } else if (!selected && threadsQ.data && threadsQ.data.length > 0) {
        setSelected(threadsQ.data[0].id);
      }
    }
    
    if (threadsQ.data) {
      resolveThread();
    }
  }, [threadsQ.data, selected, threadFromUrl, isStaff, qc, navigate]);

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
            <FeedbackButton />
            <button className="md:hidden rounded-md p-1 hover:bg-surface-muted" onClick={() => setSidebarOpen(false)}><X className="size-4" /></button>
          </div>
        </div>
        <ul className="divide-y divide-border overflow-y-auto no-scrollbar max-h-[calc(100vh-220px)]">
          {(threadsQ.data ?? []).map((t) => {
            const memberProf = t.member_id ? sidebarProfilesQ.data?.get(t.member_id) : null;
            let label = t.title ?? "Conversa";
            
            if (t.kind === "general") {
              label = "Geral";
            } else if (t.kind === "direct") {
              if (isStaff && memberProf) {
                label = displayName(memberProf);
              } else if (!isStaff) {
                 label = "Suporte Malta";
              } else if (isStaff && !memberProf && t.member_id) {
                 label = "Aguardando Contato";
              }
            }

            return (
              <li key={t.id}>
                <button onClick={() => { setSelected(t.id); setSidebarOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 ${
                    selected === t.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-surface-muted"
                  }`}>
                  <div className="size-8 shrink-0 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border grid place-items-center text-[10px]">
                    {t.kind === "general" ? <Hash className="size-4" /> : <AvatarImage path={memberProf?.avatar_url} fallback={initials(memberProf)} />}
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
        {selected && !selected.startsWith("dm:") && userId
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
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);

  const senderIds = (msgsQ.data ?? []).map((m) => m.sender_id);
  const uniqueSenderIds = Array.from(new Set(senderIds));
  const profsQ = useProfilesBasic(uniqueSenderIds);
  const msgsById = useMemo(() => {
    const m = new Map<string, any>();
    (msgsQ.data ?? []).forEach((x: any) => m.set(x.id, x));
    return m;
  }, [msgsQ.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgsQ.data]);

  useEffect(() => {
    const ch = supabase.channel(`msg-${threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: ["messages", threadId] }))
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const typing = new Set<string>();
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => { if (p.isTyping && p.userId !== userId) typing.add(p.userId); });
        });
        setTypingUsers(typing);
      })
      .subscribe(async (status) => { if (status === "SUBSCRIBED") await ch.track({ userId, isTyping }); });
    return () => { supabase.removeChannel(ch); };
  }, [threadId, qc, userId, isTyping]);

  function handleTyping() {
    if (!isTyping) setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
  }

  const sendMut = useMutation({
    mutationFn: async (payload?: { body?: string; attachment_url?: string; attachment_type?: string; duration_ms?: number }) => {
      const body = (payload?.body ?? text).trim();
      if (!body && !payload?.attachment_url) return;
      const insert: any = {
        thread_id: threadId,
        sender_id: userId,
        body: body || null,
        reply_to_id: replyingTo?.id ?? null,
      };
      if (payload?.attachment_url) {
        insert.attachment_url = payload.attachment_url;
        insert.attachment_type = payload.attachment_type;
        insert.duration_ms = payload.duration_ms ?? null;
      }
      const { error } = await supabase.from("chat_messages").insert(insert);
      if (error) throw error;
      setText(""); setReplyingTo(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_messages").update({ deleted_at: new Date().toISOString(), body: null } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messages", threadId] }); toast.success("Mensagem apagada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      recordStartRef.current = Date.now();
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const dur = Date.now() - recordStartRef.current;
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const path = `${userId}/${threadId}/${Date.now()}.webm`;
        const up = await supabase.storage.from("chat-attachments").upload(path, blob, { contentType: "audio/webm" });
        if (up.error) { toast.error(up.error.message); return; }
        const { data: pub } = supabase.storage.from("chat-attachments").getPublicUrl(path);
        await sendMut.mutateAsync({ attachment_url: pub.publicUrl, attachment_type: "audio", duration_ms: dur });
      };
      mediaRecRef.current = mr; mr.start(); setRecording(true);
    } catch (e: any) { toast.error("Permissão de microfone negada"); }
  }
  function stopRecording() {
    if (mediaRecRef.current && recording) { mediaRecRef.current.stop(); setRecording(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar p-3 sm:p-4 space-y-3">
        {msgsQ.isLoading ? <Loader2 className="size-5 animate-spin" /> : (msgsQ.data ?? []).map((m: any) => {
          const isMe = m.sender_id === userId;
          const p = profsQ.data?.get(m.sender_id);
          const replied = m.reply_to_id ? msgsById.get(m.reply_to_id) : null;
          const repliedP = replied ? profsQ.data?.get(replied.sender_id) : null;
          return (
            <SwipeableRow key={m.id} onSwipeReply={() => setReplyingTo(m)}>
              <div className={`flex items-end gap-2 group ${isMe ? "justify-end" : "justify-start"}`}>
                {!isMe && (
                  <button onClick={() => { window.location.href = `/dashboard/perfil?view_id=${m.sender_id}`; }}
                    className="size-8 shrink-0 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border grid place-items-center text-[11px] font-medium text-muted-foreground hover:ring-primary/50 transition-all">
                    <AvatarImage path={p?.avatar_url} fallback={initials(p)} />
                  </button>
                )}
                <div className="relative group/msg max-w-[85%] sm:max-w-[75%]">
                  <div className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-surface-muted text-foreground rounded-bl-sm"}`}>
                    {!isMe && (
                      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium">
                        <span className="text-foreground/80 hover:text-primary cursor-pointer" onClick={() => { window.location.href = `/dashboard/perfil?view_id=${m.sender_id}`; }}>{displayName(p)}</span>
                        {p?.is_staff && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary ring-1 ring-primary/30">
                            <Shield className="size-2.5" /> ADM
                          </span>
                        )}
                      </div>
                    )}
                    {replied && (
                      <div className={`mb-1 rounded-md border-l-2 px-2 py-1 text-[11px] ${isMe ? "border-primary-foreground/40 bg-primary-foreground/10" : "border-primary/40 bg-background/50"}`}>
                        <div className="font-medium opacity-80">{displayName(repliedP)}</div>
                        <div className="truncate opacity-70">{replied.body || (replied.attachment_type === "audio" ? "🎤 Áudio" : "Anexo")}</div>
                      </div>
                    )}
                    {m.deleted_at ? (
                      <div className="italic opacity-60">Mensagem apagada</div>
                    ) : m.attachment_type === "audio" ? (
                      <audio controls src={m.attachment_url} className="max-w-[240px]" />
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    )}
                    <div className={`mt-0.5 flex items-center justify-between gap-2 text-[10px] ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  {!m.deleted_at && (
                    <div className={`absolute top-0 ${isMe ? "-left-12" : "-right-12"} hidden group-hover/msg:flex items-center gap-1 p-1`}>
                      <button className="p-1.5 hover:bg-surface-muted rounded-full text-muted-foreground" title="Responder" onClick={() => setReplyingTo(m)}><Reply className="size-3.5" /></button>
                      {isMe && (
                        <button className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-full text-muted-foreground" title="Apagar" onClick={() => { if (confirm("Deseja apagar esta mensagem?")) deleteMut.mutate(m.id); }}>
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {isMe && (
                  <button onClick={() => window.location.href = `/dashboard/perfil`}
                    className="size-8 shrink-0 overflow-hidden rounded-full bg-primary/20 ring-1 ring-primary/40 grid place-items-center text-[11px] font-medium text-primary">
                    <AvatarImage path={p?.avatar_url} fallback={initials(p)} />
                  </button>
                )}
              </div>
            </SwipeableRow>
          );
        })}
        {typingUsers.size > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground animate-pulse">
            {Array.from(typingUsers).map(id => displayName(profsQ.data?.get(id))).join(", ")} está digitando...
          </div>
        )}
        {msgsQ.data && msgsQ.data.length === 0 && <div className="text-center text-sm text-muted-foreground">Sem mensagens ainda.</div>}
      </div>
      {replyingTo && (
        <div className="flex items-center gap-2 border-t border-border bg-primary/5 px-3 py-2 text-xs">
          <Reply className="size-3.5 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-primary">Respondendo a {displayName(profsQ.data?.get(replyingTo.sender_id))}</div>
            <div className="truncate text-muted-foreground">{replyingTo.body || "Anexo"}</div>
          </div>
          <button onClick={() => setReplyingTo(null)} className="p-1 rounded hover:bg-surface-muted"><X className="size-3.5" /></button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); sendMut.mutate(undefined); }}
        className="flex items-center gap-2 border-t border-border p-2 sm:p-3 bg-surface">
        <button type="button"
          className={`p-2 rounded-full transition-colors ${recording ? "bg-destructive text-white animate-pulse" : "text-muted-foreground hover:text-primary hover:bg-primary/5"}`}
          title={recording ? "Parar" : "Gravar áudio"}
          onClick={recording ? stopRecording : startRecording}>
          {recording ? <Square className="size-5" /> : <Mic className="size-5" />}
        </button>
        <input value={text} onChange={(e) => { setText(e.target.value); handleTyping(); }} placeholder="Digite uma mensagem…" className="input flex-1" />
        <button type="submit" disabled={!text.trim() || sendMut.isPending}
          className="inline-flex items-center rounded-full bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-lg shadow-primary/20">
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}

function SwipeableRow({ children, onSwipeReply }: { children: ReactNode; onSwipeReply: () => void }) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  return (
    <div
      onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
      onTouchMove={(e) => {
        if (startX.current == null) return;
        const d = e.touches[0].clientX - startX.current;
        if (d > 0 && d < 100) setDx(d);
      }}
      onTouchEnd={() => {
        if (dx > 60) onSwipeReply();
        setDx(0); startX.current = null;
      }}
      style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 0.2s" : "none" }}
      className="relative"
    >
      {dx > 20 && <Reply className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-primary" />}
      {children}
    </div>
  );
}

function AvatarImage({ path, fallback }: { path: string | null | undefined; fallback: string }) {
  const url = useAvatarUrl(path ?? null);
  if (url) return <img src={url} alt="" className="size-full object-cover" />;
  if (path && (path.startsWith("http") || path.startsWith("blob:"))) return <img src={path} alt="" className="size-full object-cover" />;
  return <>{fallback}</>;
}

function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [cat, setCat] = useState("geral");
  const [sending, setSending] = useState(false);
  async function send() {
    if (!msg.trim()) return;
    setSending(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) throw new Error("Sessão expirada. Faça login novamente.");
      const { error } = await (supabase.from("feedback" as any) as any)
        .insert({ user_id: u.user.id, category: cat, message: msg.trim() })
        .select()
        .single();
      if (error) throw error;
      toast.success("Feedback enviado. Obrigado!");
      setMsg(""); setOpen(false);
    } catch (e: any) {
      console.error("[feedback] insert error", e);
      toast.error(e?.message || "Erro ao enviar feedback");
    }
    finally { setSending(false); }
  }
  return (
    <>
      <button title="Enviar Feedback" className="rounded-md p-1 hover:bg-primary/10 text-primary" onClick={() => setOpen(true)}>
        <MessageSquarePlus className="size-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-surface p-5 ring-1 ring-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-3">Enviar Feedback</h3>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="input w-full mb-2">
              <option value="geral">Geral</option><option value="bug">Bug</option><option value="ideia">Ideia</option><option value="reclamacao">Reclamação</option>
            </select>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder="Descreva…" className="input w-full mb-3" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm rounded-md hover:bg-surface-muted">Cancelar</button>
              <button onClick={send} disabled={sending || !msg.trim()} className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50">
                {sending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
