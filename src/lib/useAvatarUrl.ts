import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Cache signed URLs by path for the session
const cache = new Map<string, { url: string; expiresAt: number }>();

export function useAvatarUrl(path: string | null) {
  // URLs completas (Discord CDN, etc.) são usadas diretamente — não passam pelo Storage.
  const isFullUrl = !!path && (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:") || path.startsWith("data:"));

  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    if (isFullUrl) return path;
    const c = cache.get(path);
    return c && c.expiresAt > Date.now() ? c.url : null;
  });

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    if (isFullUrl) {
      setUrl(path);
      return;
    }
    const cached = cache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (cancelled || !data) return;
        cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path, isFullUrl]);

  return url;
}