export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      balances: {
        Row: {
          available_balance: string
          created_at: string
          id: string
          locked_balance: string
          pending_withdrawal: string
          updated_at: string
          user_address: string
        }
        Insert: {
          available_balance?: string
          created_at?: string
          id?: string
          locked_balance?: string
          pending_withdrawal?: string
          updated_at?: string
          user_address: string
        }
        Update: {
          available_balance?: string
          created_at?: string
          id?: string
          locked_balance?: string
          pending_withdrawal?: string
          updated_at?: string
          user_address?: string
        }
        Relationships: []
      }
      deposits: {
        Row: {
          amount: string
          created_at: string
          credited_at: string | null
          id: string
          raw_data: Json | null
          sender_address: string | null
          status: string
          token_address: string
          transaction_id: string
          updated_at: string
          user_address: string | null
        }
        Insert: {
          amount: string
          created_at?: string
          credited_at?: string | null
          id?: string
          raw_data?: Json | null
          sender_address?: string | null
          status?: string
          token_address?: string
          transaction_id: string
          updated_at?: string
          user_address?: string | null
        }
        Update: {
          amount?: string
          created_at?: string
          credited_at?: string | null
          id?: string
          raw_data?: Json | null
          sender_address?: string | null
          status?: string
          token_address?: string
          transaction_id?: string
          updated_at?: string
          user_address?: string | null
        }
        Relationships: []
      }
      private_bids: {
        Row: {
          amount: string
          auction_id: string
          bidder_address: string
          created_at: string
          id: string
          outbid_at: string | null
          refunded_at: string | null
          status: string
          updated_at: string
          won_at: string | null
        }
        Insert: {
          amount: string
          auction_id: string
          bidder_address: string
          created_at?: string
          id?: string
          outbid_at?: string | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          amount?: string
          auction_id?: string
          bidder_address?: string
          created_at?: string
          id?: string
          outbid_at?: string | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
          won_at?: string | null
        }
        Relationships: []
      }
      private_withdrawals: {
        Row: {
          amount: string
          completed_at: string | null
          created_at: string
          failed_reason: string | null
          id: string
          recipient_address: string | null
          status: string
          token_address: string
          transfer_tx_id: string | null
          updated_at: string
          user_address: string
        }
        Insert: {
          amount: string
          completed_at?: string | null
          created_at?: string
          failed_reason?: string | null
          id?: string
          recipient_address?: string | null
          status?: string
          token_address?: string
          transfer_tx_id?: string | null
          updated_at?: string
          user_address: string
        }
        Update: {
          amount?: string
          completed_at?: string | null
          created_at?: string
          failed_reason?: string | null
          id?: string
          recipient_address?: string | null
          status?: string
          token_address?: string
          transfer_tx_id?: string | null
          updated_at?: string
          user_address?: string
        }
        Relationships: []
      }
      secrets: {
        Row: {
          auction_id: string
          buyer: string | null
          created_at: string
          id: string
          market_data: Json | null
          secret_data: Json
          seller: string
          updated_at: string
        }
        Insert: {
          auction_id: string
          buyer?: string | null
          created_at?: string
          id?: string
          market_data?: Json | null
          secret_data: Json
          seller: string
          updated_at?: string
        }
        Update: {
          auction_id?: string
          buyer?: string | null
          created_at?: string
          id?: string
          market_data?: Json | null
          secret_data?: Json
          seller?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

