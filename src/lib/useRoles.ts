import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "admin" | "member";

export function useRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function computeRoleFlags(roles: AppRole[] | undefined) {
  const set = new Set(roles ?? []);
  return {
    isOwner: set.has("owner"),
    isStaff: set.has("owner") || set.has("admin"),
    primary: (set.has("owner") ? "owner" : set.has("admin") ? "admin" : "member") as AppRole,
  };
}