import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cache signed URLs by path for the session
const cache = new Map<string, { url: string; expiresAt: number }>();

function normalizeAvatarPath(path: string) {
  const clean = path.trim();
  if (!clean) return clean;
  if (clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("blob:") || clean.startsWith("data:")) {
    return clean;
  }

  // Aceita formatos antigos/salvos por engano como:
  // "avatars/user/file.png", "/avatars/user/file.png" ou paths vindos da Storage API.
  const withoutQuery = clean.split("?")[0].replace(/^\/+/, "");
  const marker = "/avatars/";
  const markerIndex = withoutQuery.indexOf(marker);
  if (markerIndex >= 0) return withoutQuery.slice(markerIndex + marker.length);
  if (withoutQuery.startsWith("avatars/")) return withoutQuery.slice("avatars/".length);
  return withoutQuery;
}

export function useAvatarUrl(path: string | null) {
  const normalizedPath = path ? normalizeAvatarPath(path) : null;
  // URLs completas (Discord CDN, etc.) são usadas diretamente — não passam pelo Storage.
  const isFullUrl = !!normalizedPath && (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://") || normalizedPath.startsWith("blob:") || normalizedPath.startsWith("data:"));

  const [url, setUrl] = useState<string | null>(() => {
    if (!normalizedPath) return null;
    if (isFullUrl) return normalizedPath;
    const c = cache.get(normalizedPath);
    return c && c.expiresAt > Date.now() ? c.url : null;
  });

  useEffect(() => {
    if (!normalizedPath) {
      setUrl(null);
      return;
    }
    if (isFullUrl) {
      setUrl(normalizedPath);
      return;
    }
    const cached = cache.get(normalizedPath);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("avatars")
      .createSignedUrl(normalizedPath, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.signedUrl) {
          cache.set(normalizedPath, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
          setUrl(data.signedUrl);
          return;
        }
        // Se o bucket estiver público ou o valor salvo era de um setup antigo, ainda tenta URL pública.
        // Caso o bucket seja privado e a policy bloqueie leitura, o SQL de correção libera leitura autenticada.
        if (error) {
          const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(normalizedPath);
          setUrl(publicData.publicUrl || null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedPath, isFullUrl]);

  return url;
}