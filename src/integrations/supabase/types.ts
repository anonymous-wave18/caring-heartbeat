export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["announcement_audience"]
          author_id: string | null
          body: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          pinned?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["announcement_audience"]
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      cargos: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
          weekly_amount: number | null
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          weekly_amount?: number | null
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          weekly_amount?: number | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["chat_thread_kind"]
          member_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["chat_thread_kind"]
          member_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["chat_thread_kind"]
          member_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          notes: string | null
          payment_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          notes?: string | null
          payment_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          notes?: string | null
          payment_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          recruiter_admin_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          transfer_confirmed_at: string | null
          transfer_confirmed_by: string | null
          transfer_notes: string | null
          transfer_status: Database["public"]["Enums"]["transfer_status"]
          updated_at: string
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          recruiter_admin_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transfer_confirmed_at?: string | null
          transfer_confirmed_by?: string | null
          transfer_notes?: string | null
          transfer_status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          recruiter_admin_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transfer_confirmed_at?: string | null
          transfer_confirmed_by?: string | null
          transfer_notes?: string | null
          transfer_status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          billing_anchor_date: string | null
          cargo_id: string | null
          city: string | null
          created_at: string
          discord_id: string | null
          discord_username: string | null
          email: string
          first_name: string | null
          form_status: Database["public"]["Enums"]["form_status"]
          id: string
          last_name: string | null
          phone: string | null
          pix_beneficiary: string | null
          pix_key: string | null
          pix_key_type: string | null
          recruited_by: string | null
          state: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          billing_anchor_date?: string | null
          cargo_id?: string | null
          city?: string | null
          created_at?: string
          discord_id?: string | null
          discord_username?: string | null
          email: string
          first_name?: string | null
          form_status?: Database["public"]["Enums"]["form_status"]
          id: string
          last_name?: string | null
          phone?: string | null
          pix_beneficiary?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          recruited_by?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          billing_anchor_date?: string | null
          cargo_id?: string | null
          city?: string | null
          created_at?: string
          discord_id?: string | null
          discord_username?: string | null
          email?: string
          first_name?: string | null
          form_status?: Database["public"]["Enums"]["form_status"]
          id?: string
          last_name?: string | null
          phone?: string | null
          pix_beneficiary?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          recruited_by?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          form_id: string | null
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          form_id?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          form_id?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_documents_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "recruitment_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_forms: {
        Row: {
          age: number | null
          availability: string | null
          bank_holder: string | null
          bank_name: string | null
          birth_date: string | null
          cargo_desejado_id: string | null
          cpf: string | null
          created_at: string
          custom_answers: Json
          discord_avatar_url: string | null
          discord_contact: string | null
          experience: string | null
          extra: Json
          full_name: string | null
          id: string
          location_captured_at: string | null
          location_lat: number | null
          location_lng: number | null
          motivation: string | null
          phone_father: string | null
          phone_mother: string | null
          phone_self: string | null
          referred_by: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["form_status"]
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          availability?: string | null
          bank_holder?: string | null
          bank_name?: string | null
          birth_date?: string | null
          cargo_desejado_id?: string | null
          cpf?: string | null
          created_at?: string
          custom_answers?: Json
          discord_avatar_url?: string | null
          discord_contact?: string | null
          experience?: string | null
          extra?: Json
          full_name?: string | null
          id?: string
          location_captured_at?: string | null
          location_lat?: number | null
          location_lng?: number | null
          motivation?: string | null
          phone_father?: string | null
          phone_mother?: string | null
          phone_self?: string | null
          referred_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["form_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          availability?: string | null
          bank_holder?: string | null
          bank_name?: string | null
          birth_date?: string | null
          cargo_desejado_id?: string | null
          cpf?: string | null
          created_at?: string
          custom_answers?: Json
          discord_avatar_url?: string | null
          discord_contact?: string | null
          experience?: string | null
          extra?: Json
          full_name?: string | null
          id?: string
          location_captured_at?: string | null
          location_lat?: number | null
          location_lng?: number | null
          motivation?: string | null
          phone_father?: string | null
          phone_mother?: string | null
          phone_self?: string | null
          referred_by?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["form_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_forms_cargo_desejado_id_fkey"
            columns: ["cargo_desejado_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          created_at: string
          discord_webhook_url: string | null
          form_config: Json
          id: number
          org_name: string
          payment_due_day: number
          pix_beneficiary: string | null
          pix_key: string | null
          pix_key_type: string | null
          updated_at: string
          weekly_amount: number
        }
        Insert: {
          created_at?: string
          discord_webhook_url?: string | null
          form_config?: Json
          id?: number
          org_name?: string
          payment_due_day?: number
          pix_beneficiary?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          weekly_amount?: number
        }
        Update: {
          created_at?: string
          discord_webhook_url?: string | null
          form_config?: Json
          id?: number
          org_name?: string
          payment_due_day?: number
          pix_beneficiary?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          updated_at?: string
          weekly_amount?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_rec_cargo: { Args: { _user_id: string }; Returns: undefined }
      ensure_current_payment: { Args: { _user_id: string }; Returns: undefined }
      generate_weekly_payments_all: { Args: never; Returns: number }
      get_profiles_basic: {
        Args: { _ids: string[] }
        Returns: {
          avatar_url: string
          cargo_id: string
          first_name: string
          id: string
          is_staff: boolean
          last_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      announcement_audience: "all" | "members" | "staff"
      app_role: "owner" | "admin" | "member"
      approval_status: "pending" | "approved" | "rejected"
      chat_thread_kind: "general" | "direct"
      form_status: "not_submitted" | "submitted" | "approved" | "rejected"
      payment_status: "pending" | "submitted" | "approved" | "overdue"
      transfer_status: "none" | "pending" | "confirmed" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_audience: ["all", "members", "staff"],
      app_role: ["owner", "admin", "member"],
      approval_status: ["pending", "approved", "rejected"],
      chat_thread_kind: ["general", "direct"],
      form_status: ["not_submitted", "submitted", "approved", "rejected"],
      payment_status: ["pending", "submitted", "approved", "overdue"],
      transfer_status: ["none", "pending", "confirmed", "rejected"],
    },
  },
} as const
