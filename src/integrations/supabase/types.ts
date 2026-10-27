export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bodega_audit_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          entity: string
          entity_id: string | null
          id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bodega_brands: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      bodega_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      bodega_customers: {
        Row: {
          address: string | null
          categoria_mayorista: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          tipo: string | null
        }
        Insert: {
          address?: string | null
          categoria_mayorista?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          tipo?: string | null
        }
        Update: {
          address?: string | null
          categoria_mayorista?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      bodega_documents: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodega_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "bodega_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string | null
          quantity: number
          reference_id: string | null
          reference_type: string
          type: string
          unit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string
          type?: string
          unit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string
          type?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodega_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bodega_products"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_order_item_units: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          unit_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          unit_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodega_order_item_units_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "bodega_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          subtotal: number
          unit_condition: string | null
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          quantity?: number
          subtotal?: number
          unit_condition?: string | null
          unit_price?: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          subtotal?: number
          unit_condition?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bodega_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "bodega_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bodega_products"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_orders: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivery_date: string | null
          id: string
          notes: string | null
          order_date: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bodega_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "bodega_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_previous_serials: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notas: string | null
          serial: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notas?: string | null
          serial: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notas?: string | null
          serial?: string
        }
        Relationships: []
      }
      bodega_product_types: {
        Row: {
          created_at: string
          id: string
          key: string
          mayorista_group: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          mayorista_group: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          mayorista_group?: string
          name?: string
        }
        Relationships: []
      }
      bodega_products: {
        Row: {
          brand_id: string | null
          categoria: string | null
          category_id: string | null
          control_started_at: string | null
          control_started_by: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          min_stock: number
          name: string
          price: number
          sku: string
          technical_specs: Json
          tipo_repuesto: string | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          categoria?: string | null
          category_id?: string | null
          control_started_at?: string | null
          control_started_by?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          name: string
          price?: number
          sku?: string
          technical_specs?: Json
          tipo_repuesto?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          categoria?: string | null
          category_id?: string | null
          control_started_at?: string | null
          control_started_by?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          name?: string
          price?: number
          sku?: string
          technical_specs?: Json
          tipo_repuesto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bodega_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "bodega_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "bodega_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          role: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
        }
        Relationships: []
      }
      bodega_reception_items: {
        Row: {
          cost: number | null
          created_at: string
          id: string
          product_id: string | null
          reception_id: string
          serial: string
          unit_condition: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          id?: string
          product_id?: string | null
          reception_id: string
          serial: string
          unit_condition?: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          id?: string
          product_id?: string | null
          reception_id?: string
          serial?: string
          unit_condition?: string
        }
        Relationships: [
          {
            foreignKeyName: "bodega_reception_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bodega_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_reception_items_reception_id_fkey"
            columns: ["reception_id"]
            isOneToOne: false
            referencedRelation: "bodega_receptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_receptions: {
        Row: {
          code: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          received_at: string
          reference: string | null
          status: string
          supplier_id: string | null
        }
        Insert: {
          code: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          received_at?: string
          reference?: string | null
          status?: string
          supplier_id?: string | null
        }
        Update: {
          code?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          received_at?: string
          reference?: string | null
          status?: string
          supplier_id?: string | null
        }
        Relationships: []
      }
      bodega_settings: {
        Row: {
          company_name: string
          currency: string
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string
          currency?: string
          id?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          currency?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bodega_technicians: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      bodega_units: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          cost: number | null
          created_by: string | null
          id: string
          location: string | null
          notes: string | null
          product_id: string | null
          received_at: string
          reception_id: string | null
          serial: string
          status: string
          unit_condition: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          cost?: number | null
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          product_id?: string | null
          received_at?: string
          reception_id?: string | null
          serial: string
          status: string
          unit_condition?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          cost?: number | null
          created_by?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          product_id?: string | null
          received_at?: string
          reception_id?: string | null
          serial?: string
          status?: string
          unit_condition?: string
        }
        Relationships: [
          {
            foreignKeyName: "bodega_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bodega_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_units_reception_id_fkey"
            columns: ["reception_id"]
            isOneToOne: false
            referencedRelation: "bodega_receptions"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_warranties: {
        Row: {
          cliente_manual: string | null
          code: string
          costo: number | null
          created_by: string | null
          customer_id: string | null
          diagnostico: string | null
          fecha_venta_manual: string | null
          id: string
          imei_manual: string | null
          notes: string | null
          order_id: string | null
          product_id: string | null
          reason: string
          received_at: string
          referencia_manual: string | null
          replacement_unit_id: string | null
          resolucion: string | null
          resolved_at: string | null
          status: string
          tecnico_id: string | null
          unit_id: string | null
        }
        Insert: {
          cliente_manual?: string | null
          code: string
          costo?: number | null
          created_by?: string | null
          customer_id?: string | null
          diagnostico?: string | null
          fecha_venta_manual?: string | null
          id?: string
          imei_manual?: string | null
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          reason?: string
          received_at?: string
          referencia_manual?: string | null
          replacement_unit_id?: string | null
          resolucion?: string | null
          resolved_at?: string | null
          status?: string
          tecnico_id?: string | null
          unit_id?: string | null
        }
        Update: {
          cliente_manual?: string | null
          code?: string
          costo?: number | null
          created_by?: string | null
          customer_id?: string | null
          diagnostico?: string | null
          fecha_venta_manual?: string | null
          id?: string
          imei_manual?: string | null
          notes?: string | null
          order_id?: string | null
          product_id?: string | null
          reason?: string
          received_at?: string
          referencia_manual?: string | null
          replacement_unit_id?: string | null
          resolucion?: string | null
          resolved_at?: string | null
          status?: string
          tecnico_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodega_warranties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "bodega_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_warranties_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "bodega_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_warranties_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bodega_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_warranties_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "bodega_technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_warranties_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "bodega_units"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_warranty_documents: {
        Row: {
          created_at: string
          document_id: string
          id: string
          warranty_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          warranty_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          warranty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bodega_warranty_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "bodega_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_warranty_documents_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "bodega_warranties"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_warranty_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          status: string
          warranty_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status: string
          warranty_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          warranty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bodega_warranty_events_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "bodega_warranties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
      suppliers: {
        Row: {
          id: string
          name: string
          tax_id: string | null
          contact_name: string | null
          phone: string | null
          email: string | null
          address: string | null
          notes: string | null
          is_active: boolean
          created_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          tax_id?: string | null
          contact_name?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          tax_id?: string | null
          contact_name?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bodega_aplicar_cambios: { Args: { p_cambios: Json }; Returns: Json }
      bodega_control_finalizar: {
        Args: { p_product_id: string; p_resumen: string }
        Returns: Json
      }
      bodega_control_iniciar: { Args: { p_product_id: string }; Returns: Json }
      bodega_control_marcar_serial: {
        Args: { p_product_id: string; p_serial: string }
        Returns: Json
      }
      bodega_control_marcar_unidad: {
        Args: { p_unit_id: string; p_verificada: boolean }
        Returns: Json
      }
      bodega_is_admin: { Args: never; Returns: boolean }
      bodega_is_staff: { Args: never; Returns: boolean }
      bodega_siguiente_codigo: { Args: { p_tabla: string }; Returns: string }
      bodega_uso_almacenamiento: { Args: never; Returns: Json }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
