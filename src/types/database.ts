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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accidents: {
        Row: {
          accident_date: string
          accident_description: string | null
          accident_number: string
          accident_time: string | null
          accident_type: string
          actual_repair_cost: number
          attachments: Json
          company_contribution: number
          company_id: string
          created_at: string
          damage_description: string | null
          driver_name: string | null
          estimated_repair_cost: number
          id: string
          insurance_claim_number: string | null
          insurance_contribution: number
          legacy_id: string | null
          location: string | null
          net_cost_to_company: number | null
          notes: string | null
          police_report_number: string | null
          repair_completion_date: string | null
          repair_start_date: string | null
          status: string
          supplier_id: string | null
          third_party_contribution: number
          third_party_details: string | null
          vehicle_downtime_days: number
          vehicle_id: string
          workshop: string | null
        }
        Insert: {
          accident_date: string
          accident_description?: string | null
          accident_number?: string | null  // assigned by the DB numbering trigger when null/''
          accident_time?: string | null
          accident_type: string
          actual_repair_cost?: number
          attachments?: Json
          company_contribution?: number
          company_id: string
          created_at?: string
          damage_description?: string | null
          driver_name?: string | null
          estimated_repair_cost?: number
          id?: string
          insurance_claim_number?: string | null
          insurance_contribution?: number
          legacy_id?: string | null
          location?: string | null
          net_cost_to_company?: number | null
          notes?: string | null
          police_report_number?: string | null
          repair_completion_date?: string | null
          repair_start_date?: string | null
          status?: string
          supplier_id?: string | null
          third_party_contribution?: number
          third_party_details?: string | null
          vehicle_downtime_days?: number
          vehicle_id: string
          workshop?: string | null
        }
        Update: {
          accident_date?: string
          accident_description?: string | null
          accident_number?: string
          accident_time?: string | null
          accident_type?: string
          actual_repair_cost?: number
          attachments?: Json
          company_contribution?: number
          company_id?: string
          created_at?: string
          damage_description?: string | null
          driver_name?: string | null
          estimated_repair_cost?: number
          id?: string
          insurance_claim_number?: string | null
          insurance_contribution?: number
          legacy_id?: string | null
          location?: string | null
          net_cost_to_company?: number | null
          notes?: string | null
          police_report_number?: string | null
          repair_completion_date?: string | null
          repair_start_date?: string | null
          status?: string
          supplier_id?: string | null
          third_party_contribution?: number
          third_party_details?: string | null
          vehicle_downtime_days?: number
          vehicle_id?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_templates: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["account_category"]
          code: string
          description: string | null
          is_system: boolean
          name: string
          sort_order: number
          subcategory: string
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["account_category"]
          code: string
          description?: string | null
          is_system?: boolean
          name: string
          sort_order?: number
          subcategory: string
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["account_category"]
          code?: string
          description?: string | null
          is_system?: boolean
          name?: string
          sort_order?: number
          subcategory?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          category: Database["public"]["Enums"]["account_category"]
          code: string
          company_id: string
          currency: string
          description: string | null
          is_system: boolean
          name: string
          opening_balance: number
          subcategory: string
        }
        Insert: {
          category: Database["public"]["Enums"]["account_category"]
          code: string
          company_id: string
          currency?: string
          description?: string | null
          is_system?: boolean
          name: string
          opening_balance?: number
          subcategory: string
        }
        Update: {
          category?: Database["public"]["Enums"]["account_category"]
          code?: string
          company_id?: string
          currency?: string
          description?: string | null
          is_system?: boolean
          name?: string
          opening_balance?: number
          subcategory?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_actions: {
        Row: {
          acted_at: string
          action: string
          approver_id: string
          approver_role: Database["public"]["Enums"]["user_role"]
          comment: string
          id: string
          level: number
          request_id: string
        }
        Insert: {
          acted_at?: string
          action: string
          approver_id: string
          approver_role: Database["public"]["Enums"]["user_role"]
          comment: string
          id?: string
          level: number
          request_id: string
        }
        Update: {
          acted_at?: string
          action?: string
          approver_id?: string
          approver_role?: Database["public"]["Enums"]["user_role"]
          comment?: string
          id?: string
          level?: number
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_actions_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_actions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_limits: {
        Row: {
          max_amount: number | null
          module: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          max_amount?: number | null
          module: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          max_amount?: number | null
          module?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      approval_requests: {
        Row: {
          amount: number
          company_id: string
          currency: string
          current_level: number
          id: string
          legacy_id: string | null
          notes: string | null
          reference_id: string
          reference_number: string
          reference_type: string
          requested_at: string
          requested_by: string | null
          required_roles: Database["public"]["Enums"]["user_role"][]
          status: string
          total_levels: number
        }
        Insert: {
          amount: number
          company_id: string
          currency?: string
          current_level?: number
          id?: string
          legacy_id?: string | null
          notes?: string | null
          reference_id: string
          reference_number: string
          reference_type: string
          requested_at?: string
          requested_by?: string | null
          required_roles?: Database["public"]["Enums"]["user_role"][]
          status?: string
          total_levels?: number
        }
        Update: {
          amount?: number
          company_id?: string
          currency?: string
          current_level?: number
          id?: string
          legacy_id?: string | null
          notes?: string | null
          reference_id?: string
          reference_number?: string
          reference_type?: string
          requested_at?: string
          requested_by?: string | null
          required_roles?: Database["public"]["Enums"]["user_role"][]
          status?: string
          total_levels?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_rules: {
        Row: {
          active: boolean
          currency: string
          description: string | null
          id: string
          legacy_id: string | null
          module: string
          required_roles: Database["public"]["Enums"]["user_role"][]
          threshold_amount: number
        }
        Insert: {
          active?: boolean
          currency?: string
          description?: string | null
          id?: string
          legacy_id?: string | null
          module: string
          required_roles: Database["public"]["Enums"]["user_role"][]
          threshold_amount: number
        }
        Update: {
          active?: boolean
          currency?: string
          description?: string | null
          id?: string
          legacy_id?: string | null
          module?: string
          required_roles?: Database["public"]["Enums"]["user_role"][]
          threshold_amount?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          entity_id: string | null
          entity_type: string
          id: number
          new_value: Json | null
          occurred_at: string
          old_value: Json | null
          user_id: string | null
          user_role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          action: string
          company_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: never
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          user_id?: string | null
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          action?: string
          company_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          user_id?: string | null
          user_role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          account_type: string
          active: boolean
          bank_name: string
          company_id: string
          created_at: string
          currency: string
          gl_account_code: string
          iban: string | null
          id: string
          legacy_id: string | null
          opening_balance: number
        }
        Insert: {
          account_name: string
          account_number: string
          account_type: string
          active?: boolean
          bank_name: string
          company_id: string
          created_at?: string
          currency?: string
          gl_account_code?: string
          iban?: string | null
          id?: string
          legacy_id?: string | null
          opening_balance?: number
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string
          active?: boolean
          bank_name?: string
          company_id?: string
          created_at?: string
          currency?: string
          gl_account_code?: string
          iban?: string | null
          id?: string
          legacy_id?: string | null
          opening_balance?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          address: string | null
          bank_details: Json
          city: string | null
          code: string
          created_by: string | null
          country: string | null
          created_at: string
          currency: string
          email: string | null
          financial_year: string | null
          id: string
          legacy_id: string | null
          logo: string | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          registration_number: string | null
          state: string | null
          tax_number: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          bank_details?: Json
          city?: string | null
          code: string
          created_by?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          financial_year?: string | null
          id?: string
          legacy_id?: string | null
          logo?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_number?: string | null
          state?: string | null
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          bank_details?: Json
          city?: string | null
          code?: string
          created_by?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          financial_year?: string | null
          id?: string
          legacy_id?: string | null
          logo?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          registration_number?: string | null
          state?: string | null
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          credit_limit: number
          customer_code: string
          customer_type: string
          email: string | null
          id: string
          legacy_id: string | null
          name: string
          notes: string | null
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          status: string
          tax_number: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          customer_code?: string | null  // assigned by the DB numbering trigger when null/''
          customer_type: string
          email?: string | null
          id?: string
          legacy_id?: string | null
          name: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          customer_code?: string
          customer_type?: string
          email?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      depreciation_run_items: {
        Row: {
          asset_id: string
          depreciation_amount: number
          new_book_value: number
          previous_book_value: number
          run_id: string
        }
        Insert: {
          asset_id: string
          depreciation_amount: number
          new_book_value: number
          previous_book_value: number
          run_id: string
        }
        Update: {
          asset_id?: string
          depreciation_amount?: number
          new_book_value?: number
          previous_book_value?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_run_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "depreciation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_runs: {
        Row: {
          batch_number: string
          company_id: string
          created_at: string
          currency: string
          id: string
          journal_entry_id: string | null
          legacy_id: string | null
          notes: string | null
          period: string
          period_label: string
          processed_by: string | null
          run_date: string
          status: string
          total_amount: number
          total_assets: number
        }
        Insert: {
          batch_number?: string | null  // assigned by the DB numbering trigger when null/''
          company_id: string
          created_at?: string
          currency?: string
          id?: string
          journal_entry_id?: string | null
          legacy_id?: string | null
          notes?: string | null
          period: string
          period_label: string
          processed_by?: string | null
          run_date: string
          status?: string
          total_amount?: number
          total_assets?: number
        }
        Update: {
          batch_number?: string
          company_id?: string
          created_at?: string
          currency?: string
          id?: string
          journal_entry_id?: string | null
          legacy_id?: string | null
          notes?: string | null
          period?: string
          period_label?: string
          processed_by?: string | null
          run_date?: string
          status?: string
          total_amount?: number
          total_assets?: number
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_runs_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_sequences: {
        Row: {
          company_id: string
          last_value: number
          prefix: string
        }
        Insert: {
          company_id: string
          last_value?: number
          prefix: string
        }
        Update: {
          company_id?: string
          last_value?: number
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          company_id: string
          document_name: string
          document_number: string | null
          expiry_date: string | null
          file_size: number | null
          id: string
          issue_date: string | null
          legacy_id: string | null
          mime_type: string | null
          notes: string | null
          storage_path: string | null
          uploaded_at: string
          uploaded_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          category: string
          company_id: string
          document_name: string
          document_number?: string | null
          expiry_date?: string | null
          file_size?: number | null
          id?: string
          issue_date?: string | null
          legacy_id?: string | null
          mime_type?: string | null
          notes?: string | null
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          document_name?: string
          document_number?: string | null
          expiry_date?: string | null
          file_size?: number | null
          id?: string
          issue_date?: string | null
          legacy_id?: string | null
          mime_type?: string | null
          notes?: string | null
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          assigned_vehicle_id: string | null
          avatar: string | null
          bank_account_number: string | null
          bank_name: string | null
          basic_salary: number
          civil_id: string | null
          company_id: string
          created_at: string
          department: string
          designation: string
          email: string | null
          employee_code: string
          housing_allowance: number
          iban: string | null
          id: string
          joining_date: string
          legacy_id: string | null
          name: string
          nationality: string | null
          notes: string | null
          other_allowances: number
          pasi_employee_pct: number
          pasi_employer_pct: number
          passport_number: string | null
          payment_method: string
          phone: string | null
          social_security_number: string | null
          status: string
          total_gross_salary: number | null
          transport_allowance: number
        }
        Insert: {
          assigned_vehicle_id?: string | null
          avatar?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary: number
          civil_id?: string | null
          company_id: string
          created_at?: string
          department: string
          designation: string
          email?: string | null
          employee_code?: string | null  // assigned by the DB numbering trigger when null/''
          housing_allowance?: number
          iban?: string | null
          id?: string
          joining_date: string
          legacy_id?: string | null
          name: string
          nationality?: string | null
          notes?: string | null
          other_allowances?: number
          pasi_employee_pct?: number
          pasi_employer_pct?: number
          passport_number?: string | null
          payment_method?: string
          phone?: string | null
          social_security_number?: string | null
          status?: string
          total_gross_salary?: number | null
          transport_allowance?: number
        }
        Update: {
          assigned_vehicle_id?: string | null
          avatar?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number
          civil_id?: string | null
          company_id?: string
          created_at?: string
          department?: string
          designation?: string
          email?: string | null
          employee_code?: string
          housing_allowance?: number
          iban?: string | null
          id?: string
          joining_date?: string
          legacy_id?: string | null
          name?: string
          nationality?: string | null
          notes?: string | null
          other_allowances?: number
          pasi_employee_pct?: number
          pasi_employer_pct?: number
          passport_number?: string | null
          payment_method?: string
          phone?: string | null
          social_security_number?: string | null
          status?: string
          total_gross_salary?: number | null
          transport_allowance?: number
        }
        Relationships: [
          {
            foreignKeyName: "employees_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          attachment_path: string | null
          category: string
          company_id: string
          cost_centre: string | null
          created_at: string
          date: string
          description: string
          expense_number: string
          gl_account_code: string | null
          id: string
          invoice_number: string | null
          legacy_id: string | null
          notes: string | null
          payment_method: string
          quantity: number
          receipt_number: string | null
          supplier_id: string | null
          tax: number
          total: number
          unit_price: number
          vehicle_id: string | null
        }
        Insert: {
          attachment_path?: string | null
          category: string
          company_id: string
          cost_centre?: string | null
          created_at?: string
          date: string
          description: string
          expense_number?: string | null  // assigned by the DB numbering trigger when null/''
          gl_account_code?: string | null
          id?: string
          invoice_number?: string | null
          legacy_id?: string | null
          notes?: string | null
          payment_method: string
          quantity?: number
          receipt_number?: string | null
          supplier_id?: string | null
          tax?: number
          total: number
          unit_price: number
          vehicle_id?: string | null
        }
        Update: {
          attachment_path?: string | null
          category?: string
          company_id?: string
          cost_centre?: string | null
          created_at?: string
          date?: string
          description?: string
          expense_number?: string
          gl_account_code?: string | null
          id?: string
          invoice_number?: string | null
          legacy_id?: string | null
          notes?: string | null
          payment_method?: string
          quantity?: number
          receipt_number?: string | null
          supplier_id?: string | null
          tax?: number
          total?: number
          unit_price?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          accumulated_depreciation: number
          annual_rate_percentage: number
          asset_code: string
          category: string
          company_id: string
          created_at: string
          current_book_value: number | null
          current_market_value: number | null
          department: string | null
          depreciation_method: string
          gl_accum_dep_account: string
          gl_asset_account: string
          gl_expense_account: string
          id: string
          legacy_id: string | null
          location: string | null
          name: string
          notes: string | null
          purchase_cost: number
          purchase_date: string
          salvage_value: number
          serial_number: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          useful_life_years: number
          vehicle_id: string | null
        }
        Insert: {
          accumulated_depreciation?: number
          annual_rate_percentage: number
          asset_code?: string | null  // assigned by the DB numbering trigger when null/''
          category: string
          company_id: string
          created_at?: string
          current_book_value?: number | null
          current_market_value?: number | null
          department?: string | null
          depreciation_method: string
          gl_accum_dep_account: string
          gl_asset_account: string
          gl_expense_account: string
          id?: string
          legacy_id?: string | null
          location?: string | null
          name: string
          notes?: string | null
          purchase_cost: number
          purchase_date: string
          salvage_value?: number
          serial_number?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          useful_life_years: number
          vehicle_id?: string | null
        }
        Update: {
          accumulated_depreciation?: number
          annual_rate_percentage?: number
          asset_code?: string
          category?: string
          company_id?: string
          created_at?: string
          current_book_value?: number | null
          current_market_value?: number | null
          department?: string | null
          depreciation_method?: string
          gl_accum_dep_account?: string
          gl_asset_account?: string
          gl_expense_account?: string
          id?: string
          legacy_id?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          purchase_cost?: number
          purchase_date?: string
          salvage_value?: number
          serial_number?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          useful_life_years?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          cost_centre: string | null
          description: string
          discount_amount: number | null
          discount_percentage: number
          expense_category: string | null
          gl_account_code: string | null
          id: string
          invoice_id: string
          item_code: string | null
          line_no: number
          line_total: number | null
          quantity: number
          tax_amount: number | null
          tax_rate_percentage: number
          unit: string | null
          unit_price: number
          vehicle_id: string | null
        }
        Insert: {
          cost_centre?: string | null
          description: string
          discount_amount?: number | null
          discount_percentage?: number
          expense_category?: string | null
          gl_account_code?: string | null
          id?: string
          invoice_id: string
          item_code?: string | null
          line_no: number
          line_total?: number | null
          quantity: number
          tax_amount?: number | null
          tax_rate_percentage?: number
          unit?: string | null
          unit_price: number
          vehicle_id?: string | null
        }
        Update: {
          cost_centre?: string | null
          description?: string
          discount_amount?: number | null
          discount_percentage?: number
          expense_category?: string | null
          gl_account_code?: string | null
          id?: string
          invoice_id?: string
          item_code?: string | null
          line_no?: number
          line_total?: number | null
          quantity?: number
          tax_amount?: number | null
          tax_rate_percentage?: number
          unit?: string | null
          unit_price?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          approval_date: string | null
          approval_status: string
          approved_by: string | null
          attachment_path: string | null
          company_id: string
          cost_centre: string | null
          created_at: string
          credited_amount: number
          currency: string
          customer_id: string | null
          discount_total: number
          due_date: string
          exchange_rate: number
          grand_total: number
          id: string
          invoice_date: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          is_credit_note: boolean
          journal_entry_id: string | null
          legacy_id: string | null
          maintenance_record_id: string | null
          notes: string | null
          other_charges: number
          outstanding_amount: number | null
          parent_invoice_id: string | null
          party_snapshot: Json
          party_type: Database["public"]["Enums"]["party_type"]
          payment_status: string
          payment_terms_days: number
          purchase_order_number: string | null
          reference_number: string | null
          subtotal: number
          supplier_id: string | null
          tax_total: number
          terms_and_conditions: string | null
          updated_at: string
          vehicle_id: string | null
          work_order_id: string | null
        }
        Insert: {
          amount_paid?: number
          approval_date?: string | null
          approval_status?: string
          approved_by?: string | null
          attachment_path?: string | null
          company_id: string
          cost_centre?: string | null
          created_at?: string
          credited_amount?: number
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date: string
          exchange_rate?: number
          grand_total?: number
          id?: string
          invoice_date: string
          invoice_number?: string | null  // assigned by the DB numbering trigger when null/''
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          is_credit_note?: boolean
          journal_entry_id?: string | null
          legacy_id?: string | null
          maintenance_record_id?: string | null
          notes?: string | null
          other_charges?: number
          outstanding_amount?: number | null
          parent_invoice_id?: string | null
          party_snapshot?: Json
          party_type: Database["public"]["Enums"]["party_type"]
          payment_status?: string
          payment_terms_days?: number
          purchase_order_number?: string | null
          reference_number?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          terms_and_conditions?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          amount_paid?: number
          approval_date?: string | null
          approval_status?: string
          approved_by?: string | null
          attachment_path?: string | null
          company_id?: string
          cost_centre?: string | null
          created_at?: string
          credited_amount?: number
          currency?: string
          customer_id?: string | null
          discount_total?: number
          due_date?: string
          exchange_rate?: number
          grand_total?: number
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          is_credit_note?: boolean
          journal_entry_id?: string | null
          legacy_id?: string | null
          maintenance_record_id?: string | null
          notes?: string | null
          other_charges?: number
          outstanding_amount?: number | null
          parent_invoice_id?: string | null
          party_snapshot?: Json
          party_type?: Database["public"]["Enums"]["party_type"]
          payment_status?: string
          payment_terms_days?: number
          purchase_order_number?: string | null
          reference_number?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax_total?: number
          terms_and_conditions?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_journal_fk"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_maintenance_record_id_fkey"
            columns: ["maintenance_record_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          attachment_path: string | null
          company_id: string
          created_at: string
          date: string
          description: string
          entry_number: string
          id: string
          legacy_id: string | null
          posted_by: string | null
          reference: string | null
          reverses_entry_id: string | null
          source_id: string | null
          source_module: string
          status: string
        }
        Insert: {
          attachment_path?: string | null
          company_id: string
          created_at?: string
          date: string
          description: string
          entry_number: string
          id?: string
          legacy_id?: string | null
          posted_by?: string | null
          reference?: string | null
          reverses_entry_id?: string | null
          source_id?: string | null
          source_module?: string
          status?: string
        }
        Update: {
          attachment_path?: string | null
          company_id?: string
          created_at?: string
          date?: string
          description?: string
          entry_number?: string
          id?: string
          legacy_id?: string | null
          posted_by?: string | null
          reference?: string | null
          reverses_entry_id?: string | null
          source_id?: string | null
          source_module?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_code: string
          company_id: string
          cost_centre: string | null
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          vehicle_id: string | null
        }
        Insert: {
          account_code: string
          company_id: string
          cost_centre?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          vehicle_id?: string | null
        }
        Update: {
          account_code?: string
          company_id?: string
          cost_centre?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_company_id_account_code_fkey"
            columns: ["company_id", "account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["company_id", "code"]
          },
          {
            foreignKeyName: "journal_lines_company_id_account_code_fkey"
            columns: ["company_id", "account_code"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["company_id", "code"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          attachments: Json
          category: string
          company_id: string
          created_at: string
          description: string
          discount: number
          id: string
          invoice_number: string | null
          labour_cost: number
          legacy_id: string | null
          maintenance_date: string
          maintenance_type: string
          next_service_date: string | null
          next_service_mileage: number | null
          notes: string | null
          odometer_reading: number | null
          other_charges: number
          parts_cost: number
          parts_used: Json
          payment_method: string | null
          payment_status: string
          record_number: string
          service_centre: string | null
          supplier_id: string | null
          tax: number
          technician: string | null
          total_cost: number
          vehicle_id: string
          warranty_expiry_date: string | null
          warranty_period_months: number | null
          work_order_id: string | null
        }
        Insert: {
          attachments?: Json
          category: string
          company_id: string
          created_at?: string
          description: string
          discount?: number
          id?: string
          invoice_number?: string | null
          labour_cost?: number
          legacy_id?: string | null
          maintenance_date: string
          maintenance_type: string
          next_service_date?: string | null
          next_service_mileage?: number | null
          notes?: string | null
          odometer_reading?: number | null
          other_charges?: number
          parts_cost?: number
          parts_used?: Json
          payment_method?: string | null
          payment_status?: string
          record_number?: string | null  // assigned by the DB numbering trigger when null/''
          service_centre?: string | null
          supplier_id?: string | null
          tax?: number
          technician?: string | null
          total_cost: number
          vehicle_id: string
          warranty_expiry_date?: string | null
          warranty_period_months?: number | null
          work_order_id?: string | null
        }
        Update: {
          attachments?: Json
          category?: string
          company_id?: string
          created_at?: string
          description?: string
          discount?: number
          id?: string
          invoice_number?: string | null
          labour_cost?: number
          legacy_id?: string | null
          maintenance_date?: string
          maintenance_type?: string
          next_service_date?: string | null
          next_service_mileage?: number | null
          notes?: string | null
          odometer_reading?: number | null
          other_charges?: number
          parts_cost?: number
          parts_used?: Json
          payment_method?: string | null
          payment_status?: string
          record_number?: string
          service_centre?: string | null
          supplier_id?: string | null
          tax?: number
          technician?: string | null
          total_cost?: number
          vehicle_id?: string
          warranty_expiry_date?: string | null
          warranty_period_months?: number | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: true
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id?: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          legacy_id: string | null
          link: string | null
          message: string
          reference_id: string | null
          severity: string
          title: string
          type: string
          user_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          link?: string | null
          message: string
          reference_id?: string | null
          severity: string
          title: string
          type: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          link?: string | null
          message?: string
          reference_id?: string | null
          severity?: string
          title?: string
          type?: string
          user_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      oil_changes: {
        Row: {
          company_id: string
          created_at: string
          date: string
          filter_cost: number
          id: string
          invoice_number: string | null
          labour_cost: number
          legacy_id: string | null
          next_oil_change_date: string | null
          next_oil_change_mileage: number | null
          notes: string | null
          odometer: number
          oil_brand: string | null
          oil_cost: number
          oil_grade: string | null
          oil_type: string | null
          performed_by: string | null
          quantity_litres: number | null
          supplier_id: string | null
          tax: number
          total_cost: number
          vehicle_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          filter_cost?: number
          id?: string
          invoice_number?: string | null
          labour_cost?: number
          legacy_id?: string | null
          next_oil_change_date?: string | null
          next_oil_change_mileage?: number | null
          notes?: string | null
          odometer: number
          oil_brand?: string | null
          oil_cost?: number
          oil_grade?: string | null
          oil_type?: string | null
          performed_by?: string | null
          quantity_litres?: number | null
          supplier_id?: string | null
          tax?: number
          total_cost: number
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          filter_cost?: number
          id?: string
          invoice_number?: string | null
          labour_cost?: number
          legacy_id?: string | null
          next_oil_change_date?: string | null
          next_oil_change_mileage?: number | null
          notes?: string | null
          odometer?: number
          oil_brand?: string | null
          oil_cost?: number
          oil_grade?: string | null
          oil_type?: string | null
          performed_by?: string | null
          quantity_litres?: number | null
          supplier_id?: string | null
          tax?: number
          total_cost?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oil_changes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oil_changes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oil_changes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          attachment_path: string | null
          bank_account_id: string
          cheque_number: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          journal_entry_id: string | null
          legacy_id: string | null
          notes: string | null
          payment_date: string
          payment_method: string
          payment_number: string
          transaction_reference: string | null
        }
        Insert: {
          amount: number
          attachment_path?: string | null
          bank_account_id: string
          cheque_number?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id: string
          journal_entry_id?: string | null
          legacy_id?: string | null
          notes?: string | null
          payment_date: string
          payment_method: string
          payment_number: string
          transaction_reference?: string | null
        }
        Update: {
          amount?: number
          attachment_path?: string | null
          bank_account_id?: string
          cheque_number?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          journal_entry_id?: string | null
          legacy_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string
          payment_number?: string
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "v_bank_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          basic_salary: number
          bonus_amount: number
          employee_id: string
          gross_pay: number | null
          housing_allowance: number
          id: string
          loan_advance_deduction: number
          net_pay: number | null
          other_allowances: number
          other_deductions: number
          overtime_amount: number
          pasi_employee_deduction: number
          run_id: string
          status: string
          total_deductions: number | null
          transport_allowance: number
          unpaid_leave_deduction: number
        }
        Insert: {
          basic_salary: number
          bonus_amount?: number
          employee_id: string
          gross_pay?: number | null
          housing_allowance?: number
          id?: string
          loan_advance_deduction?: number
          net_pay?: number | null
          other_allowances?: number
          other_deductions?: number
          overtime_amount?: number
          pasi_employee_deduction?: number
          run_id: string
          status?: string
          total_deductions?: number | null
          transport_allowance?: number
          unpaid_leave_deduction?: number
        }
        Update: {
          basic_salary?: number
          bonus_amount?: number
          employee_id?: string
          gross_pay?: number | null
          housing_allowance?: number
          id?: string
          loan_advance_deduction?: number
          net_pay?: number | null
          other_allowances?: number
          other_deductions?: number
          overtime_amount?: number
          pasi_employee_deduction?: number
          run_id?: string
          status?: string
          total_deductions?: number | null
          transport_allowance?: number
          unpaid_leave_deduction?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_by: string | null
          approved_date: string | null
          bank_account_id: string | null
          company_id: string
          created_at: string
          id: string
          journal_entry_id: string | null
          legacy_id: string | null
          month: number
          notes: string | null
          payment_date: string | null
          payroll_number: string
          status: string
          year: number
        }
        Insert: {
          approved_by?: string | null
          approved_date?: string | null
          bank_account_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          legacy_id?: string | null
          month: number
          notes?: string | null
          payment_date?: string | null
          payroll_number?: string | null  // assigned by the DB numbering trigger when null/''
          status?: string
          year: number
        }
        Update: {
          approved_by?: string | null
          approved_date?: string | null
          bank_account_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          legacy_id?: string | null
          month?: number
          notes?: string | null
          payment_date?: string | null
          payroll_number?: string
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "v_bank_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: string | null
          created_at: string
          department: string | null
          email: string
          id: string
          legacy_id: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: string
          updated_at: string
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          department?: string | null
          email: string
          id: string
          legacy_id?: string | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          updated_at?: string
        }
        Update: {
          avatar?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          legacy_id?: string | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reconciliations: {
        Row: {
          company_id: string
          created_at: string
          difference_amount: number
          discrepancy_reason: string | null
          goods_received_amount: number | null
          id: string
          invoice_amount: number
          invoice_id: string
          legacy_id: string | null
          matching_type: string
          notes: string | null
          purchase_order_amount: number | null
          purchase_order_number: string | null
          reconciled_by: string | null
          reconciled_date: string | null
          reconciliation_number: string
          status: string
          variance_percentage: number
          work_order_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          difference_amount: number
          discrepancy_reason?: string | null
          goods_received_amount?: number | null
          id?: string
          invoice_amount: number
          invoice_id: string
          legacy_id?: string | null
          matching_type: string
          notes?: string | null
          purchase_order_amount?: number | null
          purchase_order_number?: string | null
          reconciled_by?: string | null
          reconciled_date?: string | null
          reconciliation_number?: string | null  // assigned by the DB numbering trigger when null/''
          status: string
          variance_percentage: number
          work_order_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          difference_amount?: number
          discrepancy_reason?: string | null
          goods_received_amount?: number | null
          id?: string
          invoice_amount?: number
          invoice_id?: string
          legacy_id?: string | null
          matching_type?: string
          notes?: string | null
          purchase_order_amount?: number | null
          purchase_order_number?: string | null
          reconciled_by?: string | null
          reconciled_date?: string | null
          reconciliation_number?: string
          status?: string
          variance_percentage?: number
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          module: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          module: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          module?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          bank_details: Json
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          credit_limit: number
          email: string | null
          id: string
          legacy_id: string | null
          name: string
          notes: string | null
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          status: string
          supplier_code: string
          supplier_type: string
          tax_number: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          bank_details?: Json
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          legacy_id?: string | null
          name: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          supplier_code?: string | null  // assigned by the DB numbering trigger when null/''
          supplier_type: string
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          bank_details?: Json
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number
          email?: string | null
          id?: string
          legacy_id?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          status?: string
          supplier_code?: string
          supplier_type?: string
          tax_number?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      tyre_events: {
        Row: {
          company_id: string
          cost: number
          created_at: string
          date: string
          event_type: string
          id: string
          invoice_number: string | null
          legacy_id: string | null
          notes: string | null
          odometer: number | null
          positions_affected: string[]
          supplier_id: string | null
          technician: string | null
          vehicle_id: string
        }
        Insert: {
          company_id: string
          cost?: number
          created_at?: string
          date: string
          event_type: string
          id?: string
          invoice_number?: string | null
          legacy_id?: string | null
          notes?: string | null
          odometer?: number | null
          positions_affected?: string[]
          supplier_id?: string | null
          technician?: string | null
          vehicle_id: string
        }
        Update: {
          company_id?: string
          cost?: number
          created_at?: string
          date?: string
          event_type?: string
          id?: string
          invoice_number?: string | null
          legacy_id?: string | null
          notes?: string | null
          odometer?: number | null
          positions_affected?: string[]
          supplier_id?: string | null
          technician?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tyre_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tyre_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tyre_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tyres: {
        Row: {
          brand: string
          company_id: string
          created_at: string
          current_mileage: number | null
          expected_life_km: number | null
          id: string
          installation_date: string | null
          installation_mileage: number | null
          invoice_number: string | null
          legacy_id: string | null
          model: string | null
          notes: string | null
          position: string
          purchase_cost: number
          purchase_date: string | null
          replacement_date: string | null
          replacement_mileage: number | null
          serial_number: string | null
          size: string | null
          status: string
          supplier_id: string | null
          tread_depth_mm: number | null
          vehicle_id: string
        }
        Insert: {
          brand: string
          company_id: string
          created_at?: string
          current_mileage?: number | null
          expected_life_km?: number | null
          id?: string
          installation_date?: string | null
          installation_mileage?: number | null
          invoice_number?: string | null
          legacy_id?: string | null
          model?: string | null
          notes?: string | null
          position: string
          purchase_cost?: number
          purchase_date?: string | null
          replacement_date?: string | null
          replacement_mileage?: number | null
          serial_number?: string | null
          size?: string | null
          status: string
          supplier_id?: string | null
          tread_depth_mm?: number | null
          vehicle_id: string
        }
        Update: {
          brand?: string
          company_id?: string
          created_at?: string
          current_mileage?: number | null
          expected_life_km?: number | null
          id?: string
          installation_date?: string | null
          installation_mileage?: number | null
          invoice_number?: string | null
          legacy_id?: string | null
          model?: string | null
          notes?: string | null
          position?: string
          purchase_cost?: number
          purchase_date?: string | null
          replacement_date?: string | null
          replacement_mileage?: number | null
          serial_number?: string | null
          size?: string | null
          status?: string
          supplier_id?: string | null
          tread_depth_mm?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tyres_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tyres_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tyres_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_timeline: {
        Row: {
          amount: number | null
          category: string
          company_id: string
          created_at: string
          currency: string | null
          date: string
          description: string | null
          id: string
          legacy_id: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          vehicle_id: string
        }
        Insert: {
          amount?: number | null
          category: string
          company_id: string
          created_at?: string
          currency?: string | null
          date: string
          description?: string | null
          id?: string
          legacy_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          vehicle_id: string
        }
        Update: {
          amount?: number | null
          category?: string
          company_id?: string
          created_at?: string
          currency?: string | null
          date?: string
          description?: string | null
          id?: string
          legacy_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_timeline_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_timeline_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_driver: string | null
          brand: string
          color: string | null
          company_id: string
          country_of_registration: string | null
          created_at: string
          current_market_value: number
          current_mileage: number
          department: string | null
          depreciation: Json
          engine_capacity_cc: number | null
          engine_number: string | null
          fuel_type: string
          id: string
          initial_odometer: number
          insurance_expiry_date: string | null
          insurance_policy_number: string | null
          insurance_premium_annual: number
          insurance_provider: string | null
          legacy_id: string | null
          location: string | null
          manufacturer: string | null
          manufacturing_year: number | null
          market_value_updated_date: string | null
          model: string
          notes: string | null
          number_of_seats: number | null
          oil_config: Json
          photo_url: string | null
          plate_number: string
          purchase: Json
          registration_date: string | null
          registration_expiry_date: string | null
          registration_number: string | null
          status: string
          transmission: string
          updated_at: string
          variant: string | null
          vehicle_category: string
          vehicle_code: string
          vehicle_type: string
          vin: string | null
        }
        Insert: {
          assigned_driver?: string | null
          brand: string
          color?: string | null
          company_id: string
          country_of_registration?: string | null
          created_at?: string
          current_market_value?: number
          current_mileage?: number
          department?: string | null
          depreciation?: Json
          engine_capacity_cc?: number | null
          engine_number?: string | null
          fuel_type: string
          id?: string
          initial_odometer?: number
          insurance_expiry_date?: string | null
          insurance_policy_number?: string | null
          insurance_premium_annual?: number
          insurance_provider?: string | null
          legacy_id?: string | null
          location?: string | null
          manufacturer?: string | null
          manufacturing_year?: number | null
          market_value_updated_date?: string | null
          model: string
          notes?: string | null
          number_of_seats?: number | null
          oil_config?: Json
          photo_url?: string | null
          plate_number: string
          purchase?: Json
          registration_date?: string | null
          registration_expiry_date?: string | null
          registration_number?: string | null
          status?: string
          transmission: string
          updated_at?: string
          variant?: string | null
          vehicle_category: string
          vehicle_code?: string | null  // assigned by the DB numbering trigger when null/''
          vehicle_type: string
          vin?: string | null
        }
        Update: {
          assigned_driver?: string | null
          brand?: string
          color?: string | null
          company_id?: string
          country_of_registration?: string | null
          created_at?: string
          current_market_value?: number
          current_mileage?: number
          department?: string | null
          depreciation?: Json
          engine_capacity_cc?: number | null
          engine_number?: string | null
          fuel_type?: string
          id?: string
          initial_odometer?: number
          insurance_expiry_date?: string | null
          insurance_policy_number?: string | null
          insurance_premium_annual?: number
          insurance_provider?: string | null
          legacy_id?: string | null
          location?: string | null
          manufacturer?: string | null
          manufacturing_year?: number | null
          market_value_updated_date?: string | null
          model?: string
          notes?: string | null
          number_of_seats?: number | null
          oil_config?: Json
          photo_url?: string | null
          plate_number?: string
          purchase?: Json
          registration_date?: string | null
          registration_expiry_date?: string | null
          registration_number?: string | null
          status?: string
          transmission?: string
          updated_at?: string
          variant?: string | null
          vehicle_category?: string
          vehicle_code?: string
          vehicle_type?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_completion: string | null
          additional_charges: number
          approval_status: string
          assigned_technician: string | null
          company_id: string
          created_at: string
          estimated_cost: number
          expected_completion: string | null
          final_cost: number
          id: string
          invoice_number: string | null
          labour_charges: number
          legacy_id: string | null
          notes: string | null
          parts_charges: number
          parts_required: string | null
          priority: string
          problem_description: string
          reported_date: string
          requested_by: string | null
          status: string
          supplier_id: string | null
          tax: number
          updated_at: string
          vehicle_id: string
          work_order_number: string
          workshop: string | null
        }
        Insert: {
          actual_completion?: string | null
          additional_charges?: number
          approval_status?: string
          assigned_technician?: string | null
          company_id: string
          created_at?: string
          estimated_cost?: number
          expected_completion?: string | null
          final_cost?: number
          id?: string
          invoice_number?: string | null
          labour_charges?: number
          legacy_id?: string | null
          notes?: string | null
          parts_charges?: number
          parts_required?: string | null
          priority: string
          problem_description: string
          reported_date: string
          requested_by?: string | null
          status?: string
          supplier_id?: string | null
          tax?: number
          updated_at?: string
          vehicle_id: string
          work_order_number?: string | null  // assigned by the DB numbering trigger when null/''
          workshop?: string | null
        }
        Update: {
          actual_completion?: string | null
          additional_charges?: number
          approval_status?: string
          assigned_technician?: string | null
          company_id?: string
          created_at?: string
          estimated_cost?: number
          expected_completion?: string | null
          final_cost?: number
          id?: string
          invoice_number?: string | null
          labour_charges?: number
          legacy_id?: string | null
          notes?: string | null
          parts_charges?: number
          parts_required?: string | null
          priority?: string
          problem_description?: string
          reported_date?: string
          requested_by?: string | null
          status?: string
          supplier_id?: string | null
          tax?: number
          updated_at?: string
          vehicle_id?: string
          work_order_number?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_account_balances: {
        Row: {
          balance: number | null
          category: Database["public"]["Enums"]["account_category"] | null
          code: string | null
          company_id: string | null
          name: string | null
          subcategory: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bank_balances: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_name: string | null
          company_id: string | null
          current_balance: number | null
          id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_aging: {
        Row: {
          company_id: string | null
          current_due: number | null
          days_1_30: number | null
          days_31_60: number | null
          days_61_90: number | null
          days_90_plus: number | null
          invoice_type: Database["public"]["Enums"]["invoice_type"] | null
          party_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      v_party_balances: {
        Row: {
          company_id: string | null
          invoice_count: number | null
          outstanding: number | null
          party_id: string | null
          party_type: Database["public"]["Enums"]["party_type"] | null
          total_credited: number | null
          total_invoiced: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      can_approve: {
        Args: { p_amount: number; p_module: string }
        Returns: boolean
      }
      complete_work_order: {
        Args: { p_final_cost: number; p_work_order: string }
        Returns: string
      }
      decide_approval: {
        Args: { p_action: string; p_comment: string; p_request: string }
        Returns: undefined
      }
      has_company_access: { Args: { cid: string }; Returns: boolean }
      has_perm: {
        Args: {
          p_action: Database["public"]["Enums"]["permission_action"]
          p_module: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      next_doc_number: {
        Args: { p_company: string; p_pad?: number; p_prefix: string }
        Returns: string
      }
      post_invoice: { Args: { p_invoice: string }; Returns: string }
      post_journal_entry: {
        Args: {
          p_company: string
          p_date: string
          p_description: string
          p_lines: Json
          p_reference?: string
          p_source?: string
          p_source_id?: string
        }
        Returns: string
      }
      // recalc_invoice_settlement / recalc_invoice_totals are internal (EXECUTE revoked in 20261026000000_platform.sql)
      record_payment: {
        Args: {
          p_amount: number
          p_bank_account: string
          p_cheque?: string
          p_date: string
          p_invoice: string
          p_method: string
          p_notes?: string
          p_reference?: string
        }
        Returns: string
      }
      seed_chart_of_accounts: { Args: { p_company: string }; Returns: number }
      shares_company_with: { Args: { p_user: string }; Returns: boolean }
      storage_company: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      account_category: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense"
      invoice_type: "Purchase" | "Sales"
      party_type: "Supplier" | "Customer"
      permission_action:
        | "view"
        | "create"
        | "edit"
        | "delete"
        | "approve"
        | "export"
        | "print"
      user_role:
        | "Super Admin"
        | "Company Admin"
        | "Fleet Manager"
        | "Maintenance Manager"
        | "Accountant"
        | "Finance Manager"
        | "Procurement"
        | "Management"
        | "Viewer"
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
    Enums: {
      account_category: ["Asset", "Liability", "Equity", "Revenue", "Expense"],
      invoice_type: ["Purchase", "Sales"],
      party_type: ["Supplier", "Customer"],
      permission_action: [
        "view",
        "create",
        "edit",
        "delete",
        "approve",
        "export",
        "print",
      ],
      user_role: [
        "Super Admin",
        "Company Admin",
        "Fleet Manager",
        "Maintenance Manager",
        "Accountant",
        "Finance Manager",
        "Procurement",
        "Management",
        "Viewer",
      ],
    },
  },
} as const
