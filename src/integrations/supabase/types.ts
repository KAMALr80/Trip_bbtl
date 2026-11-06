export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };

  public: {
    Tables: {
      account_consents: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          founding_member: boolean;
          legal_version: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          founding_member?: boolean;
          legal_version?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          founding_member?: boolean;
          legal_version?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      admin_actions: {
        Row: {
          action: string;
          actor: string;
          created_at: string;
          id: number;
          note: string | null;
          target_content: string | null;
          target_user: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor: string;
          created_at?: string;
          id?: never;
          note?: string | null;
          target_content?: string | null;
          target_user?: string | null;
        };
        Update: {
          action?: string;
          actor?: string;
          created_at?: string;
          id?: never;
          note?: string | null;
          target_content?: string | null;
          target_user?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_actions_target_content_fkey";
            columns: ["target_content"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
        ];
      };
      age_guesses: {
        Row: {
          created_at: string;
          guess: number;
          trip_id: string;
          updated_at: string;
          user_id: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          guess: number;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          guess?: number;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "age_guesses_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_credit_purchases: {
        Row: {
          created_at: string;
          credits: number;
          id: string;
          pack: string;
          provider_ref: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          credits: number;
          id?: string;
          pack: string;
          provider_ref: string;
          trip_id: string;
        };
        Update: {
          created_at?: string;
          credits?: number;
          id?: string;
          pack?: string;
          provider_ref?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_credit_purchases_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          created_at: string;
          credits: number;
          est_cost_usd: number | null;
          id: string;
          input_tokens: number | null;
          kind: string;
          model: string | null;
          output_tokens: number | null;
          trip_id: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          credits?: number;
          est_cost_usd?: number | null;
          id?: string;
          input_tokens?: number | null;
          kind: string;
          model?: string | null;
          output_tokens?: number | null;
          trip_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          credits?: number;
          est_cost_usd?: number | null;
          id?: string;
          input_tokens?: number | null;
          kind?: string;
          model?: string | null;
          output_tokens?: number | null;
          trip_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      airport_claims: {
        Row: {
          created_at: string;
          day_date: string;
          guess: string | null;
          mission: number;
          photo_path: string | null;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_date: string;
          guess?: string | null;
          mission: number;
          photo_path?: string | null;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          guess?: string | null;
          mission?: number;
          photo_path?: string | null;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "airport_claims_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      app_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          ai_daily_global_cap: number;
          ai_daily_user_cap: number;
          ai_enabled: boolean;
          ai_updated_at: string | null;
          beta_free: boolean;
          boarding_tile: string;
          founder_intro: string;
          founding_closed_at: string | null;
          founding_open: boolean;
          id: boolean;
          public_launch: boolean;
          updated_at: string;
          welcome_faq: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          ai_daily_global_cap?: number;
          ai_daily_user_cap?: number;
          ai_enabled?: boolean;
          ai_updated_at?: string | null;
          beta_free?: boolean;
          boarding_tile?: string;
          founder_intro?: string;
          founding_closed_at?: string | null;
          founding_open?: boolean;
          id?: boolean;
          public_launch?: boolean;
          updated_at?: string;
          welcome_faq?: NonNullable<Json>;
        };
        Update: {
          ai_daily_global_cap?: number;
          ai_daily_user_cap?: number;
          ai_enabled?: boolean;
          ai_updated_at?: string | null;
          beta_free?: boolean;
          boarding_tile?: string;
          founder_intro?: string;
          founding_closed_at?: string | null;
          founding_open?: boolean;
          id?: boolean;
          public_launch?: boolean;
          updated_at?: string;
          welcome_faq?: NonNullable<Json>;
        };
        Relationships: [];
      };
      at_home_activities: {
        Row: {
          created_at: string;
          day_date: string;
          extra_item_id: number | null;
          game_number: number | null;
          id: string;
          item_id: number | null;
          kind: string;
          revealed_at: string | null;
          starts_at: string | null;
          trip_id: string;
          updated_at: string;
          winner_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_date: string;
          extra_item_id?: number | null;
          game_number?: number | null;
          id?: string;
          item_id?: number | null;
          kind: string;
          revealed_at?: string | null;
          starts_at?: string | null;
          trip_id: string;
          updated_at?: string;
          winner_id?: string | null;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          extra_item_id?: number | null;
          game_number?: number | null;
          id?: string;
          item_id?: number | null;
          kind?: string;
          revealed_at?: string | null;
          starts_at?: string | null;
          trip_id?: string;
          updated_at?: string;
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "at_home_activities_extra_item_id_fkey";
            columns: ["extra_item_id"];
            isOneToOne: false;
            referencedRelation: "at_home_pack_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "at_home_activities_game_number_fkey";
            columns: ["game_number"];
            isOneToOne: false;
            referencedRelation: "game_catalog";
            referencedColumns: ["number"];
          },
          {
            foreignKeyName: "at_home_activities_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "at_home_pack_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "at_home_activities_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      at_home_answers: {
        Row: {
          activity_id: string;
          answer: string;
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          answer: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          answer?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "at_home_answers_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "at_home_activities";
            referencedColumns: ["id"];
          },
        ];
      };
      at_home_pack_items: {
        Row: {
          adult: boolean;
          alt: string | null;
          backstory: string | null;
          body: string;
          category: string;
          created_at: string;
          id: number;
          pack: string;
          search_keywords: string[] | null;
          title: string;
          want: string | null;
        };
        ComputedFields: never;
        Insert: {
          adult?: boolean;
          alt?: string | null;
          backstory?: string | null;
          body: string;
          category: string;
          created_at?: string;
          id?: number;
          pack: string;
          search_keywords?: string[] | null;
          title: string;
          want?: string | null;
        };
        Update: {
          adult?: boolean;
          alt?: string | null;
          backstory?: string | null;
          body?: string;
          category?: string;
          created_at?: string;
          id?: number;
          pack?: string;
          search_keywords?: string[] | null;
          title?: string;
          want?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "at_home_pack_items_pack_fkey";
            columns: ["pack"];
            isOneToOne: false;
            referencedRelation: "at_home_packs";
            referencedColumns: ["key"];
          },
        ];
      };
      at_home_packs: {
        Row: {
          created_at: string;
          emoji: string;
          key: string;
          name: string;
          overview: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          emoji: string;
          key: string;
          name: string;
          overview: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          key?: string;
          name?: string;
          overview?: string;
        };
        Relationships: [];
      };
      at_home_song_winners: {
        Row: {
          activity_id: string;
          created_at: string;
          picked_by: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          created_at?: string;
          picked_by: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          picked_by?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "at_home_song_winners_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: true;
            referencedRelation: "at_home_activities";
            referencedColumns: ["id"];
          },
        ];
      };
      at_home_votes: {
        Row: {
          activity_id: string;
          created_at: string;
          target_id: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          activity_id: string;
          created_at?: string;
          target_id: string;
          voter_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          target_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "at_home_votes_activity_id_fkey";
            columns: ["activity_id"];
            isOneToOne: false;
            referencedRelation: "at_home_activities";
            referencedColumns: ["id"];
          },
        ];
      };
      beta_access: {
        Row: {
          created_at: string;
          source: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          source?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          source?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      beta_codes: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          note: string | null;
          revoked_at: string | null;
          used_at: string | null;
          used_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          note?: string | null;
          revoked_at?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          note?: string | null;
          revoked_at?: string | null;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [];
      };
      bingo_marks: {
        Row: {
          created_at: string;
          day_date: string;
          photo_path: string | null;
          square: number;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_date: string;
          photo_path?: string | null;
          square: number;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          photo_path?: string | null;
          square?: number;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bingo_marks_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      bug_issues: {
        Row: {
          created_at: string;
          founder_note: string | null;
          id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          founder_note?: string | null;
          id?: string;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          founder_note?: string | null;
          id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      bug_reports: {
        Row: {
          app_version: string | null;
          created_at: string;
          description: string;
          founder_note: string | null;
          id: string;
          issue_id: string | null;
          kind: string;
          page: string;
          screenshot_path: string | null;
          status: string;
          status_changed_at: string | null;
          trip_id: string | null;
          update_seen_at: string | null;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          app_version?: string | null;
          created_at?: string;
          description: string;
          founder_note?: string | null;
          id?: string;
          issue_id?: string | null;
          kind?: string;
          page?: string;
          screenshot_path?: string | null;
          status?: string;
          status_changed_at?: string | null;
          trip_id?: string | null;
          update_seen_at?: string | null;
          user_agent?: string | null;
          user_id?: string;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          description?: string;
          founder_note?: string | null;
          id?: string;
          issue_id?: string | null;
          kind?: string;
          page?: string;
          screenshot_path?: string | null;
          status?: string;
          status_changed_at?: string | null;
          trip_id?: string | null;
          update_seen_at?: string | null;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bug_reports_issue_fk";
            columns: ["issue_id"];
            isOneToOne: false;
            referencedRelation: "bug_issues";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bug_reports_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      call_nights: {
        Row: {
          call_link: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          second_link: string | null;
          starts_at: string;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          call_link?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          second_link?: string | null;
          starts_at: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          call_link?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          second_link?: string | null;
          starts_at?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_nights_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      checkin_responses: {
        Row: {
          answers: NonNullable<Json>;
          context: string;
          context_key: string;
          created_at: string;
          id: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          answers?: NonNullable<Json>;
          context: string;
          context_key: string;
          created_at?: string;
          id?: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          answers?: NonNullable<Json>;
          context?: string;
          context_key?: string;
          created_at?: string;
          id?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checkin_responses_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      content_feedback: {
        Row: {
          created_at: string;
          id: string;
          item_key: string;
          item_text: string;
          kind: string;
          vote: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          item_key: string;
          item_text: string;
          kind: string;
          vote: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_key?: string;
          item_text?: string;
          kind?: string;
          vote?: number;
        };
        Relationships: [];
      };
      content_items: {
        Row: {
          active: boolean;
          alcohol: boolean;
          answer: number | null;
          body: string;
          choices: string[];
          created_at: string;
          culture: string | null;
          difficulty: string | null;
          focus: string | null;
          id: string;
          insight: string | null;
          items: string[];
          kind: string;
          locale: string;
          min_age: number;
          modes: string[];
          review_note: string | null;
          reviewed: boolean;
          rooms: string[];
          source: string;
          source_ref: string;
          title: string | null;
          updated_at: string;
          vibe: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          alcohol?: boolean;
          answer?: number | null;
          body: string;
          choices?: string[];
          created_at?: string;
          culture?: string | null;
          difficulty?: string | null;
          focus?: string | null;
          id?: string;
          insight?: string | null;
          items?: string[];
          kind: string;
          locale?: string;
          min_age?: number;
          modes: string[];
          review_note?: string | null;
          reviewed?: boolean;
          rooms: string[];
          source?: string;
          source_ref?: string;
          title?: string | null;
          updated_at?: string;
          vibe?: string | null;
        };
        Update: {
          active?: boolean;
          alcohol?: boolean;
          answer?: number | null;
          body?: string;
          choices?: string[];
          created_at?: string;
          culture?: string | null;
          difficulty?: string | null;
          focus?: string | null;
          id?: string;
          insight?: string | null;
          items?: string[];
          kind?: string;
          locale?: string;
          min_age?: number;
          modes?: string[];
          review_note?: string | null;
          reviewed?: boolean;
          rooms?: string[];
          source?: string;
          source_ref?: string;
          title?: string | null;
          updated_at?: string;
          vibe?: string | null;
        };
        Relationships: [];
      };
      content_seen: {
        Row: {
          created_at: string;
          item_key: string;
          kind: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          item_key: string;
          kind: string;
          trip_id: string;
        };
        Update: {
          created_at?: string;
          item_key?: string;
          kind?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_seen_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      content_topups: {
        Row: {
          kind: string;
          last_at: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          kind: string;
          last_at?: string;
          trip_id: string;
        };
        Update: {
          kind?: string;
          last_at?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_topups_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      content_variants: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          text: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          text: string;
          trip_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          text?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_variants_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_items: {
        Row: {
          category: string;
          created_at: string;
          custom_category: string | null;
          due_date: string | null;
          id: string;
          is_estimate: boolean;
          needs_review: boolean;
          split: string;
          title: string;
          total_cents: number;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          created_at?: string;
          custom_category?: string | null;
          due_date?: string | null;
          id?: string;
          is_estimate?: boolean;
          needs_review?: boolean;
          split: string;
          title: string;
          total_cents: number;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          custom_category?: string | null;
          due_date?: string | null;
          id?: string;
          is_estimate?: boolean;
          needs_review?: boolean;
          split?: string;
          title?: string;
          total_cents?: number;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cost_items_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_log: {
        Row: {
          action: string;
          actor: string;
          amount_cents: number | null;
          created_at: string;
          detail: string | null;
          id: string;
          item_id: string | null;
          target_user: string | null;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor: string;
          amount_cents?: number | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          item_id?: string | null;
          target_user?: string | null;
          trip_id: string;
        };
        Update: {
          action?: string;
          actor?: string;
          amount_cents?: number | null;
          created_at?: string;
          detail?: string | null;
          id?: string;
          item_id?: string | null;
          target_user?: string | null;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cost_log_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_notes: {
        Row: {
          created_at: string;
          dismissed_at: string | null;
          id: string;
          message: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          message: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          message?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cost_notes_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      cost_shares: {
        Row: {
          created_at: string;
          item_id: string;
          paid_cents: number;
          report_note: string | null;
          reported_at: string | null;
          reported_cents: number | null;
          share_cents: number;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          item_id: string;
          paid_cents?: number;
          report_note?: string | null;
          reported_at?: string | null;
          reported_cents?: number | null;
          share_cents: number;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          item_id?: string;
          paid_cents?: number;
          report_note?: string | null;
          reported_at?: string | null;
          reported_cents?: number | null;
          share_cents?: number;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cost_shares_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "cost_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cost_shares_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      cultural_inspirations: {
        Row: {
          backstory: string;
          captain_approved_at: string | null;
          category: string;
          city: string | null;
          country: string | null;
          created_at: string;
          creator_id: string;
          feature_later: boolean;
          hidden_at: string | null;
          id: string;
          meaning: string;
          mode: string;
          needs: string;
          partner_id: string | null;
          photo_path: string | null;
          public_approved_at: string | null;
          quest_length: string;
          region: string | null;
          reveal_on: string;
          song_artist: string | null;
          song_url: string | null;
          steps: string;
          title: string;
          trip_id: string;
          updated_at: string;
          votes_revealed_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          backstory?: string;
          captain_approved_at?: string | null;
          category: string;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          creator_id: string;
          feature_later?: boolean;
          hidden_at?: string | null;
          id?: string;
          meaning?: string;
          mode?: string;
          needs?: string;
          partner_id?: string | null;
          photo_path?: string | null;
          public_approved_at?: string | null;
          quest_length?: string;
          region?: string | null;
          reveal_on?: string;
          song_artist?: string | null;
          song_url?: string | null;
          steps?: string;
          title?: string;
          trip_id: string;
          updated_at?: string;
          votes_revealed_at?: string | null;
        };
        Update: {
          backstory?: string;
          captain_approved_at?: string | null;
          category?: string;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          creator_id?: string;
          feature_later?: boolean;
          hidden_at?: string | null;
          id?: string;
          meaning?: string;
          mode?: string;
          needs?: string;
          partner_id?: string | null;
          photo_path?: string | null;
          public_approved_at?: string | null;
          quest_length?: string;
          region?: string | null;
          reveal_on?: string;
          song_artist?: string | null;
          song_url?: string | null;
          steps?: string;
          title?: string;
          trip_id?: string;
          updated_at?: string;
          votes_revealed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cultural_inspirations_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_exp_days: {
        Row: {
          backstory: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          day_number: number;
          done_at: string | null;
          experience_id: string;
          fact: string | null;
          id: string;
          keywords: string[];
          note: string | null;
          photos: string[];
          place: string | null;
          points: number;
          ref_url: string | null;
          review_stars: number | null;
          review_text: string | null;
          source: string;
          title: string;
          what_to_do: string;
          with_users: string[];
        };
        ComputedFields: never;
        Insert: {
          backstory?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          day_number: number;
          done_at?: string | null;
          experience_id: string;
          fact?: string | null;
          id?: string;
          keywords?: string[];
          note?: string | null;
          photos?: string[];
          place?: string | null;
          points?: number;
          ref_url?: string | null;
          review_stars?: number | null;
          review_text?: string | null;
          source?: string;
          title: string;
          what_to_do: string;
          with_users?: string[];
        };
        Update: {
          backstory?: string;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          day_number?: number;
          done_at?: string | null;
          experience_id?: string;
          fact?: string | null;
          id?: string;
          keywords?: string[];
          note?: string | null;
          photos?: string[];
          place?: string | null;
          points?: number;
          ref_url?: string | null;
          review_stars?: number | null;
          review_text?: string | null;
          source?: string;
          title?: string;
          what_to_do?: string;
          with_users?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "culture_exp_days_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_exp_hidden: {
        Row: {
          created_at: string;
          experience_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          experience_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          experience_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_exp_hidden_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_exp_likes: {
        Row: {
          created_at: string;
          experience_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          experience_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          experience_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_exp_likes_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_experiences: {
        Row: {
          a2e_kind: string | null;
          city: string | null;
          country: string;
          created_at: string;
          creator_id: string;
          culture_layer: string | null;
          days: number;
          finale_format: string | null;
          finished_at: string | null;
          id: string;
          play_mode: string;
          prep_days: number | null;
          region: string | null;
          repeat_layer: boolean;
          showcase_at: string | null;
          showcase_code: string | null;
          showcase_expires_at: string | null;
          showcase_place: string | null;
          showcase_presented_at: string | null;
          showcase_revoked_at: string | null;
          start_date: string;
          started_at: string | null;
          summary: string | null;
          title: string;
          track: string;
          traveler_types: string[];
          trip_id: string | null;
          unlisted_at: string | null;
          updated_at: string;
          vibe: string | null;
          visibility: string;
        };
        ComputedFields: never;
        Insert: {
          a2e_kind?: string | null;
          city?: string | null;
          country: string;
          created_at?: string;
          creator_id: string;
          culture_layer?: string | null;
          days: number;
          finale_format?: string | null;
          finished_at?: string | null;
          id?: string;
          play_mode?: string;
          prep_days?: number | null;
          region?: string | null;
          repeat_layer?: boolean;
          showcase_at?: string | null;
          showcase_code?: string | null;
          showcase_expires_at?: string | null;
          showcase_place?: string | null;
          showcase_presented_at?: string | null;
          showcase_revoked_at?: string | null;
          start_date?: string;
          started_at?: string | null;
          summary?: string | null;
          title: string;
          track: string;
          traveler_types?: string[];
          trip_id?: string | null;
          unlisted_at?: string | null;
          updated_at?: string;
          vibe?: string | null;
          visibility?: string;
        };
        Update: {
          a2e_kind?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          creator_id?: string;
          culture_layer?: string | null;
          days?: number;
          finale_format?: string | null;
          finished_at?: string | null;
          id?: string;
          play_mode?: string;
          prep_days?: number | null;
          region?: string | null;
          repeat_layer?: boolean;
          showcase_at?: string | null;
          showcase_code?: string | null;
          showcase_expires_at?: string | null;
          showcase_place?: string | null;
          showcase_presented_at?: string | null;
          showcase_revoked_at?: string | null;
          start_date?: string;
          started_at?: string | null;
          summary?: string | null;
          title?: string;
          track?: string;
          traveler_types?: string[];
          trip_id?: string | null;
          unlisted_at?: string | null;
          updated_at?: string;
          vibe?: string | null;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_experiences_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_layer_stamps: {
        Row: {
          country: string;
          creator_id: string;
          culture_layer: string;
          earned_at: string;
          experience_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          country: string;
          creator_id: string;
          culture_layer: string;
          earned_at?: string;
          experience_id: string;
          updated_at?: string;
        };
        Update: {
          country?: string;
          creator_id?: string;
          culture_layer?: string;
          earned_at?: string;
          experience_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_layer_stamps_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: true;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_quest_answers: {
        Row: {
          awarded: number;
          choice: number;
          confirmed: boolean;
          created_at: string;
          item_id: string;
          session_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          awarded?: number;
          choice: number;
          confirmed?: boolean;
          created_at?: string;
          item_id: string;
          session_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          awarded?: number;
          choice?: number;
          confirmed?: boolean;
          created_at?: string;
          item_id?: string;
          session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_quest_answers_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "culture_quest_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "culture_quest_answers_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "culture_quest_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_quest_items: {
        Row: {
          answer: number;
          card_id: string;
          challenge: string | null;
          created_at: string;
          id: string;
          options: NonNullable<Json>;
          photo_path: string | null;
          position: number;
          prompt: string;
          round_number: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          answer?: number;
          card_id: string;
          challenge?: string | null;
          created_at?: string;
          id?: string;
          options?: NonNullable<Json>;
          photo_path?: string | null;
          position: number;
          prompt: string;
          round_number: number;
          updated_at?: string;
        };
        Update: {
          answer?: number;
          card_id?: string;
          challenge?: string | null;
          created_at?: string;
          id?: string;
          options?: NonNullable<Json>;
          photo_path?: string | null;
          position?: number;
          prompt?: string;
          round_number?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_quest_items_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cultural_inspirations";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_quest_players: {
        Row: {
          completed_at: string | null;
          created_at: string;
          score: number;
          session_id: string;
          team_number: number | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          score?: number;
          session_id: string;
          team_number?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          score?: number;
          session_id?: string;
          team_number?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_quest_players_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "culture_quest_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_quest_sessions: {
        Row: {
          card_id: string;
          code: string | null;
          created_at: string;
          expires_at: string;
          finished_at: string | null;
          host_id: string;
          id: string;
          position: number;
          revealed: boolean;
          team_count: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          card_id: string;
          code?: string | null;
          created_at?: string;
          expires_at?: string;
          finished_at?: string | null;
          host_id: string;
          id?: string;
          position?: number;
          revealed?: boolean;
          team_count?: number;
          updated_at?: string;
        };
        Update: {
          card_id?: string;
          code?: string | null;
          created_at?: string;
          expires_at?: string;
          finished_at?: string | null;
          host_id?: string;
          id?: string;
          position?: number;
          revealed?: boolean;
          team_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_quest_sessions_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cultural_inspirations";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_showcase_ballots: {
        Row: {
          created_at: string;
          experience_id: string;
          reaction: string;
          updated_at: string;
          viewer_id: string;
          vote: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          experience_id: string;
          reaction: string;
          updated_at?: string;
          viewer_id: string;
          vote: string;
        };
        Update: {
          created_at?: string;
          experience_id?: string;
          reaction?: string;
          updated_at?: string;
          viewer_id?: string;
          vote?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_showcase_ballots_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "culture_showcase_ballots_experience_id_viewer_id_fkey";
            columns: ["experience_id", "viewer_id"];
            isOneToOne: true;
            referencedRelation: "culture_showcase_viewers";
            referencedColumns: ["experience_id", "viewer_id"];
          },
        ];
      };
      culture_showcase_rewards: {
        Row: {
          created_at: string;
          creator_id: string;
          experience_id: string;
          points: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          creator_id: string;
          experience_id: string;
          points?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          experience_id?: string;
          points?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_showcase_rewards_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: true;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_showcase_viewers: {
        Row: {
          experience_id: string;
          joined_at: string;
          updated_at: string;
          viewer_id: string;
        };
        ComputedFields: never;
        Insert: {
          experience_id: string;
          joined_at?: string;
          updated_at?: string;
          viewer_id: string;
        };
        Update: {
          experience_id?: string;
          joined_at?: string;
          updated_at?: string;
          viewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_showcase_viewers_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      culture_stamps: {
        Row: {
          card_id: string;
          champion: boolean;
          created_at: string;
          points: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          card_id: string;
          champion?: boolean;
          created_at?: string;
          points?: number;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          card_id?: string;
          champion?: boolean;
          created_at?: string;
          points?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "culture_stamps_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cultural_inspirations";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_answers: {
        Row: {
          answered_at: string;
          choice: number | null;
          correct: boolean | null;
          points: number;
          schedule_id: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          answered_at?: string;
          choice?: number | null;
          correct?: boolean | null;
          points?: number;
          schedule_id: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          answered_at?: string;
          choice?: number | null;
          correct?: boolean | null;
          points?: number;
          schedule_id?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_answers_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "trip_schedule";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_answers_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      day_votes: {
        Row: {
          choice_id: string;
          created_at: string;
          day_date: string;
          kind: string;
          trip_id: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          choice_id: string;
          created_at?: string;
          day_date: string;
          kind: string;
          trip_id: string;
          voter_id: string;
        };
        Update: {
          choice_id?: string;
          created_at?: string;
          day_date?: string;
          kind?: string;
          trip_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "day_votes_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      experience_previews: {
        Row: {
          checkin_done: number;
          city: string | null;
          country: string | null;
          created_at: string;
          culture_exp_id: string | null;
          culture_public: boolean;
          game_nights: number;
          games_played: number;
          id: string;
          kind: string;
          length_days: number | null;
          month_year: string | null;
          region: string | null;
          squad_size: number | null;
          stamps_earned: number;
          takeoff_done: number;
          task_titles: string[];
          trip_id: string | null;
          unlisted_at: string | null;
          updated_at: string;
          vibe: string | null;
        };
        ComputedFields: never;
        Insert: {
          checkin_done?: number;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          culture_exp_id?: string | null;
          culture_public?: boolean;
          game_nights?: number;
          games_played?: number;
          id?: string;
          kind: string;
          length_days?: number | null;
          month_year?: string | null;
          region?: string | null;
          squad_size?: number | null;
          stamps_earned?: number;
          takeoff_done?: number;
          task_titles?: string[];
          trip_id?: string | null;
          unlisted_at?: string | null;
          updated_at?: string;
          vibe?: string | null;
        };
        Update: {
          checkin_done?: number;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          culture_exp_id?: string | null;
          culture_public?: boolean;
          game_nights?: number;
          games_played?: number;
          id?: string;
          kind?: string;
          length_days?: number | null;
          month_year?: string | null;
          region?: string | null;
          squad_size?: number | null;
          stamps_earned?: number;
          takeoff_done?: number;
          task_titles?: string[];
          trip_id?: string | null;
          unlisted_at?: string | null;
          updated_at?: string;
          vibe?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "experience_previews_culture_exp_id_fkey";
            columns: ["culture_exp_id"];
            isOneToOne: true;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "experience_previews_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      game_cards: {
        Row: {
          answer: string | null;
          category: string;
          created_at: string;
          game_number: number | null;
          id: number;
          prompt: string;
          trip_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          answer?: string | null;
          category: string;
          created_at?: string;
          game_number?: number | null;
          id?: never;
          prompt: string;
          trip_id?: string | null;
          updated_at?: string;
        };
        Update: {
          answer?: string | null;
          category?: string;
          created_at?: string;
          game_number?: number | null;
          id?: never;
          prompt?: string;
          trip_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_cards_game_number_fkey";
            columns: ["game_number"];
            isOneToOne: false;
            referencedRelation: "game_catalog";
            referencedColumns: ["number"];
          },
          {
            foreignKeyName: "game_cards_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      game_catalog: {
        Row: {
          created_at: string;
          how_to_play: string;
          how_to_win: string;
          name: string;
          number: number;
          prep: string;
          twist: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          how_to_play: string;
          how_to_win: string;
          name: string;
          number: number;
          prep: string;
          twist: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          how_to_play?: string;
          how_to_win?: string;
          name?: string;
          number?: number;
          prep?: string;
          twist?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_format_prompts: {
        Row: {
          created_at: string;
          depth: string;
          format: string;
          icon: string;
          id: number;
          prompt: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          depth?: string;
          format: string;
          icon?: string;
          id?: never;
          prompt: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          depth?: string;
          format?: string;
          icon?: string;
          id?: never;
          prompt?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_night_card_skips: {
        Row: {
          created_at: string;
          trip_id: string;
          updated_at: string;
          used: number;
          user_id: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          trip_id: string;
          updated_at?: string;
          used?: number;
          user_id: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          trip_id?: string;
          updated_at?: string;
          used?: number;
          user_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_night_card_skips_trip_id_week_number_fkey";
            columns: ["trip_id", "week_number"];
            isOneToOne: false;
            referencedRelation: "game_nights";
            referencedColumns: ["trip_id", "week_number"];
          },
        ];
      };
      game_night_flow: {
        Row: {
          category: string | null;
          created_at: string;
          first_player: string | null;
          phase: string;
          quest_step_at: string | null;
          rounds_target: number;
          trip_id: string;
          updated_at: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          category?: string | null;
          created_at?: string;
          first_player?: string | null;
          phase?: string;
          quest_step_at?: string | null;
          rounds_target?: number;
          trip_id: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          first_player?: string | null;
          phase?: string;
          quest_step_at?: string | null;
          rounds_target?: number;
          trip_id?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_night_flow_trip_id_week_number_fkey";
            columns: ["trip_id", "week_number"];
            isOneToOne: true;
            referencedRelation: "game_nights";
            referencedColumns: ["trip_id", "week_number"];
          },
        ];
      };
      game_night_moments: {
        Row: {
          actor_id: string | null;
          created_at: string;
          prompt_id: number | null;
          round_number: number;
          stage: string;
          theme: string | null;
          trip_id: string;
          updated_at: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          prompt_id?: number | null;
          round_number?: number;
          stage: string;
          theme?: string | null;
          trip_id: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          prompt_id?: number | null;
          round_number?: number;
          stage?: string;
          theme?: string | null;
          trip_id?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_night_moments_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "game_format_prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_night_moments_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_night_moments_trip_id_week_number_fkey";
            columns: ["trip_id", "week_number"];
            isOneToOne: false;
            referencedRelation: "game_nights";
            referencedColumns: ["trip_id", "week_number"];
          },
        ];
      };
      game_night_polls: {
        Row: {
          confirmed_option: number | null;
          created_at: string;
          options: NonNullable<Json>;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          confirmed_option?: number | null;
          created_at?: string;
          options: NonNullable<Json>;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          confirmed_option?: number | null;
          created_at?: string;
          options?: NonNullable<Json>;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_night_polls_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      game_night_reactions: {
        Row: {
          card_id: number;
          created_at: string;
          emoji: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          card_id: number;
          created_at?: string;
          emoji: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          week_number: number;
        };
        Update: {
          card_id?: number;
          created_at?: string;
          emoji?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_night_reactions_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "game_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_night_reactions_trip_id_week_number_fkey";
            columns: ["trip_id", "week_number"];
            isOneToOne: false;
            referencedRelation: "game_nights";
            referencedColumns: ["trip_id", "week_number"];
          },
        ];
      };
      game_night_turns: {
        Row: {
          active: boolean;
          card_number: number;
          cards_per_person: number;
          created_at: string;
          player_order: string[];
          room: string;
          trip_id: string;
          turn_index: number;
          updated_at: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          card_number?: number;
          cards_per_person: number;
          created_at?: string;
          player_order: string[];
          room?: string;
          trip_id: string;
          turn_index?: number;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          active?: boolean;
          card_number?: number;
          cards_per_person?: number;
          created_at?: string;
          player_order?: string[];
          room?: string;
          trip_id?: string;
          turn_index?: number;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_night_turns_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      game_night_votes: {
        Row: {
          created_at: string;
          option_index: number;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          option_index: number;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          option_index?: number;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_night_votes_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_night_votes_trip_id_fkey1";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "game_night_polls";
            referencedColumns: ["trip_id"];
          },
        ];
      };
      game_nights: {
        Row: {
          created_at: string;
          game_locked: boolean;
          game_number: number | null;
          game_revealed: boolean;
          host_checked_in_at: string | null;
          host_id: string | null;
          place: string | null;
          skipped: boolean;
          starts_at: string;
          trip_id: string;
          updated_at: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          game_locked?: boolean;
          game_number?: number | null;
          game_revealed?: boolean;
          host_checked_in_at?: string | null;
          host_id?: string | null;
          place?: string | null;
          skipped?: boolean;
          starts_at: string;
          trip_id: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          game_locked?: boolean;
          game_number?: number | null;
          game_revealed?: boolean;
          host_checked_in_at?: string | null;
          host_id?: string | null;
          place?: string | null;
          skipped?: boolean;
          starts_at?: string;
          trip_id?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_nights_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_nights_trip_id_host_id_fkey";
            columns: ["trip_id", "host_id"];
            isOneToOne: false;
            referencedRelation: "trip_members";
            referencedColumns: ["trip_id", "user_id"];
          },
        ];
      };
      game_pick_log: {
        Row: {
          actor: string;
          created_at: string;
          game_number: number;
          id: number;
          method: string;
          trip_id: string;
          updated_at: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          actor: string;
          created_at?: string;
          game_number: number;
          id?: never;
          method: string;
          trip_id: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          actor?: string;
          created_at?: string;
          game_number?: number;
          id?: never;
          method?: string;
          trip_id?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_pick_log_game_number_fkey";
            columns: ["game_number"];
            isOneToOne: false;
            referencedRelation: "game_catalog";
            referencedColumns: ["number"];
          },
          {
            foreignKeyName: "game_pick_log_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      game_scores: {
        Row: {
          correct_guesses: number | null;
          created_at: string;
          here: boolean;
          trip_id: string;
          updated_at: string;
          user_id: string;
          week_number: number;
          won: boolean;
        };
        ComputedFields: never;
        Insert: {
          correct_guesses?: number | null;
          created_at?: string;
          here?: boolean;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          week_number: number;
          won?: boolean;
        };
        Update: {
          correct_guesses?: number | null;
          created_at?: string;
          here?: boolean;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          week_number?: number;
          won?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "game_scores_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      guide_prefs: {
        Row: {
          share_photos: boolean;
          show_name: boolean;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          share_photos?: boolean;
          show_name?: boolean;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          share_photos?: boolean;
          show_name?: boolean;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guide_prefs_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      home_day_results: {
        Row: {
          choice: number | null;
          completed_at: string | null;
          created_at: string;
          presented_at: string | null;
          session_id: string;
          updated_at: string;
          user_id: string;
          voted_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          choice?: number | null;
          completed_at?: string | null;
          created_at?: string;
          presented_at?: string | null;
          session_id: string;
          updated_at?: string;
          user_id: string;
          voted_at?: string | null;
        };
        Update: {
          choice?: number | null;
          completed_at?: string | null;
          created_at?: string;
          presented_at?: string | null;
          session_id?: string;
          updated_at?: string;
          user_id?: string;
          voted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "home_day_results_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "home_day_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      home_day_sessions: {
        Row: {
          card_id: number;
          created_at: string;
          day_date: string;
          id: string;
          place: string | null;
          presenter_id: string | null;
          revealed_at: string | null;
          starts_at: string;
          step: string;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          card_id: number;
          created_at?: string;
          day_date: string;
          id?: string;
          place?: string | null;
          presenter_id?: string | null;
          revealed_at?: string | null;
          starts_at: string;
          step?: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          card_id?: number;
          created_at?: string;
          day_date?: string;
          id?: string;
          place?: string | null;
          presenter_id?: string | null;
          revealed_at?: string | null;
          starts_at?: string;
          step?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "home_day_sessions_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "at_home_pack_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "home_day_sessions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      host_penalties: {
        Row: {
          created_at: string;
          stamps: number;
          trip_id: string;
          user_id: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          stamps?: number;
          trip_id: string;
          user_id: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          stamps?: number;
          trip_id?: string;
          user_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "host_penalties_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      host_swaps: {
        Row: {
          accepted_by: string | null;
          created_at: string;
          from_user: string;
          id: string;
          status: string;
          to_user: string | null;
          trip_id: string;
          updated_at: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          accepted_by?: string | null;
          created_at?: string;
          from_user: string;
          id?: string;
          status?: string;
          to_user?: string | null;
          trip_id: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          accepted_by?: string | null;
          created_at?: string;
          from_user?: string;
          id?: string;
          status?: string;
          to_user?: string | null;
          trip_id?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "host_swaps_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      inspiration_votes: {
        Row: {
          card_id: string;
          choice: string;
          created_at: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          card_id: string;
          choice: string;
          created_at?: string;
          voter_id: string;
        };
        Update: {
          card_id?: string;
          choice?: string;
          created_at?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inspiration_votes_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cultural_inspirations";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_entries: {
        Row: {
          body: string;
          created_at: string;
          day: string;
          id: string;
          prompt: string;
          schedule_id: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          day: string;
          id?: string;
          prompt: string;
          schedule_id: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          day?: string;
          id?: string;
          prompt?: string;
          schedule_id?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_entries_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "trip_schedule";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_entries_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      junkie_ranks: {
        Row: {
          best_points: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          best_points?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          best_points?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      live_award_votes: {
        Row: {
          award: string;
          created_at: string;
          nominee_id: string;
          session_id: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          award: string;
          created_at?: string;
          nominee_id: string;
          session_id: string;
          voter_id: string;
        };
        Update: {
          award?: string;
          created_at?: string;
          nominee_id?: string;
          session_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "live_award_votes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "live_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      live_presents: {
        Row: {
          created_at: string;
          presenter_id: string;
          session_id: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          presenter_id: string;
          session_id: string;
          voter_id: string;
        };
        Update: {
          created_at?: string;
          presenter_id?: string;
          session_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "live_presents_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "live_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      live_sessions: {
        Row: {
          auto_close_at: string;
          call_night_id: string | null;
          closed_at: string | null;
          closed_by: string | null;
          id: string;
          is_crowning: boolean;
          opened_at: string;
          opened_by: string | null;
          season: string;
          status: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          auto_close_at: string;
          call_night_id?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          id?: string;
          is_crowning?: boolean;
          opened_at?: string;
          opened_by?: string | null;
          season: string;
          status?: string;
          trip_id: string;
        };
        Update: {
          auto_close_at?: string;
          call_night_id?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          id?: string;
          is_crowning?: boolean;
          opened_at?: string;
          opened_by?: string | null;
          season?: string;
          status?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "live_sessions_call_night_id_fkey";
            columns: ["call_night_id"];
            isOneToOne: false;
            referencedRelation: "call_nights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "live_sessions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      live_vote_ballots: {
        Row: {
          created_at: string;
          option_index: number;
          updated_at: string;
          user_id: string;
          vote_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          option_index: number;
          updated_at?: string;
          user_id: string;
          vote_id: string;
        };
        Update: {
          created_at?: string;
          option_index?: number;
          updated_at?: string;
          user_id?: string;
          vote_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "live_vote_ballots_vote_id_fkey";
            columns: ["vote_id"];
            isOneToOne: false;
            referencedRelation: "live_votes";
            referencedColumns: ["id"];
          },
        ];
      };
      live_votes: {
        Row: {
          ballot_count: number;
          created_at: string;
          created_by: string;
          id: string;
          kind: string;
          options: NonNullable<Json>;
          prompt: string;
          results: Json | null;
          revealed_at: string | null;
          status: string;
          trip_id: string;
          updated_at: string;
          week_number: number | null;
        };
        ComputedFields: never;
        Insert: {
          ballot_count?: number;
          created_at?: string;
          created_by: string;
          id?: string;
          kind: string;
          options: NonNullable<Json>;
          prompt: string;
          results?: Json | null;
          revealed_at?: string | null;
          status?: string;
          trip_id: string;
          updated_at?: string;
          week_number?: number | null;
        };
        Update: {
          ballot_count?: number;
          created_at?: string;
          created_by?: string;
          id?: string;
          kind?: string;
          options?: NonNullable<Json>;
          prompt?: string;
          results?: Json | null;
          revealed_at?: string | null;
          status?: string;
          trip_id?: string;
          updated_at?: string;
          week_number?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "live_votes_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      mission_claims: {
        Row: {
          backstory: string | null;
          category: string;
          created_at: string;
          decided_at: string | null;
          id: string;
          keywords: string[] | null;
          mission_id: string | null;
          mission_text: string;
          phase: string;
          points: number;
          presented_at: string | null;
          revealed_at: string | null;
          slot: number;
          status: string;
          title: string | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
          verified_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          backstory?: string | null;
          category: string;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          keywords?: string[] | null;
          mission_id?: string | null;
          mission_text: string;
          phase?: string;
          points: number;
          presented_at?: string | null;
          revealed_at?: string | null;
          slot: number;
          status?: string;
          title?: string | null;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          verified_by?: string | null;
        };
        Update: {
          backstory?: string | null;
          category?: string;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          keywords?: string[] | null;
          mission_id?: string | null;
          mission_text?: string;
          phase?: string;
          points?: number;
          presented_at?: string | null;
          revealed_at?: string | null;
          slot?: number;
          status?: string;
          title?: string | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mission_claims_mission_id_fkey";
            columns: ["mission_id"];
            isOneToOne: false;
            referencedRelation: "security_missions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mission_claims_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      mission_votes: {
        Row: {
          caught: boolean;
          created_at: string;
          day_date: string;
          owner_id: string;
          trip_id: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          caught: boolean;
          created_at?: string;
          day_date: string;
          owner_id: string;
          trip_id: string;
          voter_id: string;
        };
        Update: {
          caught?: boolean;
          created_at?: string;
          day_date?: string;
          owner_id?: string;
          trip_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mission_votes_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      moderation_log: {
        Row: {
          action: string;
          actor: string | null;
          created_at: string;
          id: number;
          moderation_id: string | null;
          note: string | null;
          subject_user: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor?: string | null;
          created_at?: string;
          id?: never;
          moderation_id?: string | null;
          note?: string | null;
          subject_user?: string | null;
        };
        Update: {
          action?: string;
          actor?: string | null;
          created_at?: string;
          id?: never;
          moderation_id?: string | null;
          note?: string | null;
          subject_user?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "moderation_log_moderation_id_fkey";
            columns: ["moderation_id"];
            isOneToOne: false;
            referencedRelation: "photo_moderation";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_prefs: {
        Row: {
          email: boolean;
          push: boolean;
          type: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          email?: boolean;
          push?: boolean;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          email?: boolean;
          push?: boolean;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notification_queue: {
        Row: {
          attempts: number;
          body: string;
          channel: string | null;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string;
          deep_link: string;
          id: string;
          last_error: string | null;
          planned: boolean;
          send_after: string;
          sent_at: string | null;
          status: string;
          title: string;
          trip_id: string | null;
          type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          body: string;
          channel?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key: string;
          deep_link?: string;
          id?: string;
          last_error?: string | null;
          planned?: boolean;
          send_after: string;
          sent_at?: string | null;
          status?: string;
          title: string;
          trip_id?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          body?: string;
          channel?: string | null;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key?: string;
          deep_link?: string;
          id?: string;
          last_error?: string | null;
          planned?: boolean;
          send_after?: string;
          sent_at?: string | null;
          status?: string;
          title?: string;
          trip_id?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_queue_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          amount_due_cents: number;
          captain_id: string;
          collected_cents: number;
          created_at: string;
          discount_cents: number;
          discount_source: string | null;
          id: string;
          kind: string;
          label: string;
          list_cents: number;
          provider_ref: string | null;
          status: string;
          tier: string;
          trip_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          amount_due_cents: number;
          captain_id: string;
          collected_cents?: number;
          created_at?: string;
          discount_cents?: number;
          discount_source?: string | null;
          id?: string;
          kind: string;
          label: string;
          list_cents: number;
          provider_ref?: string | null;
          status?: string;
          tier: string;
          trip_id?: string | null;
        };
        Update: {
          amount_due_cents?: number;
          captain_id?: string;
          collected_cents?: number;
          created_at?: string;
          discount_cents?: number;
          discount_source?: string | null;
          id?: string;
          kind?: string;
          label?: string;
          list_cents?: number;
          provider_ref?: string | null;
          status?: string;
          tier?: string;
          trip_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      passport_progress: {
        Row: {
          countries: number;
          level: string;
          stars: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          countries?: number;
          level?: string;
          stars?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          countries?: number;
          level?: string;
          stars?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      passport_stamps: {
        Row: {
          city: string | null;
          country: string;
          created_at: string;
          crowns: string[];
          culture: string | null;
          kind: string;
          room: string | null;
          season_label: string | null;
          solo: boolean;
          stamped_on: string;
          state: string | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          city?: string | null;
          country: string;
          created_at?: string;
          crowns?: string[];
          culture?: string | null;
          kind: string;
          room?: string | null;
          season_label?: string | null;
          solo?: boolean;
          stamped_on: string;
          state?: string | null;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          city?: string | null;
          country?: string;
          created_at?: string;
          crowns?: string[];
          culture?: string | null;
          kind?: string;
          room?: string | null;
          season_label?: string | null;
          solo?: boolean;
          stamped_on?: string;
          state?: string | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "passport_stamps_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_moderation: {
        Row: {
          ai_flags: string[];
          created_at: string;
          id: string;
          proof_id: string;
          report_reasons: string[];
          reports: number;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          trip_id: string;
          updated_at: string;
          uploader_id: string;
        };
        ComputedFields: never;
        Insert: {
          ai_flags?: string[];
          created_at?: string;
          id?: string;
          proof_id: string;
          report_reasons?: string[];
          reports?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          trip_id: string;
          updated_at?: string;
          uploader_id: string;
        };
        Update: {
          ai_flags?: string[];
          created_at?: string;
          id?: string;
          proof_id?: string;
          report_reasons?: string[];
          reports?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          trip_id?: string;
          updated_at?: string;
          uploader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_moderation_proof_id_fkey";
            columns: ["proof_id"];
            isOneToOne: true;
            referencedRelation: "proofs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_moderation_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_moderation_reports: {
        Row: {
          created_at: string;
          moderation_id: string;
          reporter_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          moderation_id: string;
          reporter_id: string;
        };
        Update: {
          created_at?: string;
          moderation_id?: string;
          reporter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_moderation_reports_moderation_id_fkey";
            columns: ["moderation_id"];
            isOneToOne: false;
            referencedRelation: "photo_moderation";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_posts: {
        Row: {
          created_at: string;
          day_date: string;
          photo_path: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_date: string;
          photo_path: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          photo_path?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_posts_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_purge_log: {
        Row: {
          created_at: string;
          id: number;
          kept: number;
          remaining: number;
          removed: number;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          kept: number;
          remaining: number;
          removed: number;
          trip_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          kept?: number;
          remaining?: number;
          removed?: number;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_purge_log_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          photo_path: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          emoji: string;
          photo_path: string;
          trip_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          photo_path?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_reactions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_removed: {
        Row: {
          created_at: string;
          photo_path: string;
          removed_by: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          photo_path: string;
          removed_by: string;
          trip_id: string;
        };
        Update: {
          created_at?: string;
          photo_path?: string;
          removed_by?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_removed_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      photo_reports: {
        Row: {
          created_at: string;
          id: string;
          photo_path: string;
          reason: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          photo_path: string;
          reason?: string;
          trip_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          photo_path?: string;
          reason?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_reports_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      player_birthdays: {
        Row: {
          birthday: string;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          birthday: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          birthday?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      player_private: {
        Row: {
          agreed_at: string;
          created_at: string;
          dob: string;
          no_alcohol: boolean;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          agreed_at?: string;
          created_at?: string;
          dob: string;
          no_alcohol?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agreed_at?: string;
          created_at?: string;
          dob?: string;
          no_alcohol?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      player_profiles: {
        Row: {
          avatar_path: string | null;
          avatar_seed: string;
          avatar_style: string;
          created_at: string;
          fun_fact: string | null;
          game_name: string;
          home_country: string | null;
          hometown: string | null;
          next_year_goal: string | null;
          occupation: string | null;
          pronouns: string | null;
          public_leaderboard: boolean;
          real_name: string;
          trip_persona: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          avatar_seed?: string;
          avatar_style?: string;
          created_at?: string;
          fun_fact?: string | null;
          game_name: string;
          home_country?: string | null;
          hometown?: string | null;
          next_year_goal?: string | null;
          occupation?: string | null;
          pronouns?: string | null;
          public_leaderboard?: boolean;
          real_name: string;
          trip_persona?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_path?: string | null;
          avatar_seed?: string;
          avatar_style?: string;
          created_at?: string;
          fun_fact?: string | null;
          game_name?: string;
          home_country?: string | null;
          hometown?: string | null;
          next_year_goal?: string | null;
          occupation?: string | null;
          pronouns?: string | null;
          public_leaderboard?: boolean;
          real_name?: string;
          trip_persona?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      points_ledger: {
        Row: {
          created_at: string;
          created_by: string | null;
          earned_at: string;
          id: number;
          points: number;
          season: string;
          source: string;
          source_ref: string | null;
          status: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          earned_at?: string;
          id?: never;
          points: number;
          season: string;
          source: string;
          source_ref?: string | null;
          status?: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          earned_at?: string;
          id?: never;
          points?: number;
          season?: string;
          source?: string;
          source_ref?: string | null;
          status?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "points_ledger_source_fkey";
            columns: ["source"];
            isOneToOne: false;
            referencedRelation: "points_rules";
            referencedColumns: ["source"];
          },
          {
            foreignKeyName: "points_ledger_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      points_rules: {
        Row: {
          cap_group: string | null;
          cap_per_trip: number | null;
          label: string;
          per_day: number | null;
          points_max: number;
          points_min: number;
          season: string;
          source: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cap_group?: string | null;
          cap_per_trip?: number | null;
          label: string;
          per_day?: number | null;
          points_max: number;
          points_min: number;
          season: string;
          source: string;
          updated_at?: string;
        };
        Update: {
          cap_group?: string | null;
          cap_per_trip?: number | null;
          label?: string;
          per_day?: number | null;
          points_max?: number;
          points_min?: number;
          season?: string;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      postcard_choices: {
        Row: {
          favored: string[];
          swap_in: string | null;
          swap_out: string | null;
          swapped_at: string | null;
          swapped_by: string | null;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          favored?: string[];
          swap_in?: string | null;
          swap_out?: string | null;
          swapped_at?: string | null;
          swapped_by?: string | null;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          favored?: string[];
          swap_in?: string | null;
          swap_out?: string | null;
          swapped_at?: string | null;
          swapped_by?: string | null;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "postcard_choices_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      postcard_hearts: {
        Row: {
          created_at: string;
          proof_id: string;
          trip_id: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          proof_id: string;
          trip_id: string;
          voter_id: string;
        };
        Update: {
          created_at?: string;
          proof_id?: string;
          trip_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "postcard_hearts_proof_id_fkey";
            columns: ["proof_id"];
            isOneToOne: false;
            referencedRelation: "proofs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "postcard_hearts_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      postcard_picks: {
        Row: {
          picked_at: string;
          proof_id: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          picked_at?: string;
          proof_id: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          picked_at?: string;
          proof_id?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "postcard_picks_proof_id_fkey";
            columns: ["proof_id"];
            isOneToOne: true;
            referencedRelation: "proofs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "postcard_picks_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      postcard_stickers: {
        Row: {
          created_at: string;
          pack: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          pack: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          pack?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "postcard_stickers_pack_fkey";
            columns: ["pack"];
            isOneToOne: false;
            referencedRelation: "at_home_packs";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "postcard_stickers_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      preview_hidden: {
        Row: {
          created_at: string;
          preview_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          preview_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          preview_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "preview_hidden_preview_id_fkey";
            columns: ["preview_id"];
            isOneToOne: false;
            referencedRelation: "experience_previews";
            referencedColumns: ["id"];
          },
        ];
      };
      price_rules: {
        Row: {
          cents: number;
          key: string;
          label: string;
          sort: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cents: number;
          key: string;
          label: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          cents?: number;
          key?: string;
          label?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile_prefs: {
        Row: {
          about_me: string | null;
          hidden_trips: string[];
          is_public: boolean;
          top_stamps: string[];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          about_me?: string | null;
          hidden_trips?: string[];
          is_public?: boolean;
          top_stamps?: string[];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          about_me?: string | null;
          hidden_trips?: string[];
          is_public?: boolean;
          top_stamps?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          appearance: string | null;
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          home_layout: string;
          id: string;
          last_seen_at: string;
          onboarding_completed: boolean;
          quiet_end: string;
          quiet_start: string;
          seen_tips: string[];
          time_zone: string | null;
          time_zone_manual: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          appearance?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          home_layout?: string;
          id: string;
          last_seen_at?: string;
          onboarding_completed?: boolean;
          quiet_end?: string;
          quiet_start?: string;
          seen_tips?: string[];
          time_zone?: string | null;
          time_zone_manual?: boolean;
          updated_at?: string;
        };
        Update: {
          appearance?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          home_layout?: string;
          id?: string;
          last_seen_at?: string;
          onboarding_completed?: boolean;
          quiet_end?: string;
          quiet_start?: string;
          seen_tips?: string[];
          time_zone?: string | null;
          time_zone_manual?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      proof_votes: {
        Row: {
          created_at: string;
          proof_id: string;
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          proof_id: string;
          voter_id: string;
        };
        Update: {
          created_at?: string;
          proof_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proof_votes_proof_id_fkey";
            columns: ["proof_id"];
            isOneToOne: false;
            referencedRelation: "proofs";
            referencedColumns: ["id"];
          },
        ];
      };
      proofs: {
        Row: {
          ai_flags: Json | null;
          ai_reason: string | null;
          ai_status: string;
          approved_at: string | null;
          approved_by: string | null;
          body: string | null;
          created_at: string;
          crew_status: string;
          expires_at: string;
          id: string;
          live: boolean;
          part: number;
          photo_path: string | null;
          photo_removed_at: string | null;
          schedule_id: string;
          source: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          ai_flags?: Json | null;
          ai_reason?: string | null;
          ai_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          body?: string | null;
          created_at?: string;
          crew_status?: string;
          expires_at: string;
          id?: string;
          live?: boolean;
          part?: number;
          photo_path?: string | null;
          photo_removed_at?: string | null;
          schedule_id: string;
          source: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          ai_flags?: Json | null;
          ai_reason?: string | null;
          ai_status?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          body?: string | null;
          created_at?: string;
          crew_status?: string;
          expires_at?: string;
          id?: string;
          live?: boolean;
          part?: number;
          photo_path?: string | null;
          photo_removed_at?: string | null;
          schedule_id?: string;
          source?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proofs_schedule_id_fkey";
            columns: ["schedule_id"];
            isOneToOne: false;
            referencedRelation: "trip_schedule";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proofs_source_fkey";
            columns: ["source"];
            isOneToOne: false;
            referencedRelation: "points_rules";
            referencedColumns: ["source"];
          },
          {
            foreignKeyName: "proofs_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      quest_challenges: {
        Row: {
          challenged_by: string;
          created_at: string;
          decided_by: string | null;
          decision: boolean | null;
          post_id: string;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          challenged_by: string;
          created_at?: string;
          decided_by?: string | null;
          decision?: boolean | null;
          post_id: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          challenged_by?: string;
          created_at?: string;
          decided_by?: string | null;
          decision?: boolean | null;
          post_id?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quest_challenges_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: true;
            referencedRelation: "quest_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quest_challenges_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      quest_posts: {
        Row: {
          created_at: string;
          day_date: string;
          id: string;
          photo_path: string | null;
          quest: number;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_date: string;
          id?: string;
          photo_path?: string | null;
          quest: number;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          id?: string;
          photo_path?: string | null;
          quest?: number;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quest_posts_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      quest_thumbs: {
        Row: {
          created_at: string;
          post_id: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          post_id: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quest_thumbs_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "quest_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quest_thumbs_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      reward_codes: {
        Row: {
          cents: number;
          code: string;
          created_at: string;
          expires_at: string;
          id: string;
          source_trip: string | null;
          used_at: string | null;
          used_order: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          cents?: number;
          code: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          source_trip?: string | null;
          used_at?: string | null;
          used_order?: string | null;
          user_id: string;
        };
        Update: {
          cents?: number;
          code?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          source_trip?: string | null;
          used_at?: string | null;
          used_order?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reward_codes_source_trip_fkey";
            columns: ["source_trip"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reward_codes_used_order_fkey";
            columns: ["used_order"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      room_blocks: {
        Row: {
          blocked_by: string;
          created_at: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_by: string;
          created_at?: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          blocked_by?: string;
          created_at?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_blocks_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      room_requests: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          expires_at: string;
          id: string;
          interest: string | null;
          status: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          expires_at: string;
          id?: string;
          interest?: string | null;
          status?: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          expires_at?: string;
          id?: string;
          interest?: string | null;
          status?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_requests_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      sandbox_bots: {
        Row: {
          created_at: string;
          name: string;
          trip_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          name: string;
          trip_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          name?: string;
          trip_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sandbox_bots_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      sandbox_trips: {
        Row: {
          created_at: string;
          days: number;
          size: number;
          trip_id: string;
          window_days: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          days: number;
          size: number;
          trip_id: string;
          window_days: number;
        };
        Update: {
          created_at?: string;
          days?: number;
          size?: number;
          trip_id?: string;
          window_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sandbox_trips_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      sealed_quests: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          backstory: string;
          created_at: string;
          declined_at: string | null;
          declined_by: string | null;
          drop_at: string;
          drop_no: number;
          id: string;
          insight: string | null;
          keywords: string[];
          kind: string;
          mission_text: string;
          opened_at: string | null;
          presentation_tag: string | null;
          proof_mode: string | null;
          proof_path: string | null;
          proof_shared: boolean;
          submitted_at: string | null;
          title: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
          value: number;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          backstory?: string;
          created_at?: string;
          declined_at?: string | null;
          declined_by?: string | null;
          drop_at: string;
          drop_no: number;
          id?: string;
          insight?: string | null;
          keywords?: string[];
          kind: string;
          mission_text?: string;
          opened_at?: string | null;
          presentation_tag?: string | null;
          proof_mode?: string | null;
          proof_path?: string | null;
          proof_shared?: boolean;
          submitted_at?: string | null;
          title: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          value: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          backstory?: string;
          created_at?: string;
          declined_at?: string | null;
          declined_by?: string | null;
          drop_at?: string;
          drop_no?: number;
          id?: string;
          insight?: string | null;
          keywords?: string[];
          kind?: string;
          mission_text?: string;
          opened_at?: string | null;
          presentation_tag?: string | null;
          proof_mode?: string | null;
          proof_path?: string | null;
          proof_shared?: boolean;
          submitted_at?: string | null;
          title?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sealed_quests_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      season_champions: {
        Row: {
          created_at: string;
          score: number;
          season: string;
          stamps: number;
          tie_ids: string[] | null;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          score?: number;
          season: string;
          stamps?: number;
          tie_ids?: string[] | null;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          score?: number;
          season?: string;
          stamps?: number;
          tie_ids?: string[] | null;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "season_champions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      season_quests: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          awarded_points: number | null;
          backstory: string;
          created_at: string;
          id: string;
          keywords: string[];
          mission_text: string;
          night_week: number | null;
          points: number;
          presented_at: string | null;
          quest_kind: string;
          status: string;
          title: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          awarded_points?: number | null;
          backstory: string;
          created_at?: string;
          id?: string;
          keywords: string[];
          mission_text: string;
          night_week?: number | null;
          points: number;
          presented_at?: string | null;
          quest_kind: string;
          status?: string;
          title: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          awarded_points?: number | null;
          backstory?: string;
          created_at?: string;
          id?: string;
          keywords?: string[];
          mission_text?: string;
          night_week?: number | null;
          points?: number;
          presented_at?: string | null;
          quest_kind?: string;
          status?: string;
          title?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "season_quests_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      season_settings: {
        Row: {
          carry_on_meetup_at: string | null;
          carry_on_meetup_place: string | null;
          created_at: string;
          crowning_at: string | null;
          crowning_label: string;
          crowning_mode: string;
          prize: string;
          prize_note: string;
          season: string;
          trip_id: string;
          updated_at: string;
          winners: number;
        };
        ComputedFields: never;
        Insert: {
          carry_on_meetup_at?: string | null;
          carry_on_meetup_place?: string | null;
          created_at?: string;
          crowning_at?: string | null;
          crowning_label?: string;
          crowning_mode?: string;
          prize?: string;
          prize_note?: string;
          season: string;
          trip_id: string;
          updated_at?: string;
          winners?: number;
        };
        Update: {
          carry_on_meetup_at?: string | null;
          carry_on_meetup_place?: string | null;
          created_at?: string;
          crowning_at?: string | null;
          crowning_label?: string;
          crowning_mode?: string;
          prize?: string;
          prize_note?: string;
          season?: string;
          trip_id?: string;
          updated_at?: string;
          winners?: number;
        };
        Relationships: [
          {
            foreignKeyName: "season_settings_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      secret_missions: {
        Row: {
          created_at: string;
          day_date: string;
          mission: string;
          revealed_at: string | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_date: string;
          mission: string;
          revealed_at?: string | null;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          mission?: string;
          revealed_at?: string | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "secret_missions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      security_missions: {
        Row: {
          backstory: string | null;
          budget_note: string | null;
          category: string;
          created_at: string;
          id: string;
          insight: string | null;
          keywords: string[] | null;
          kind: string;
          presentation_tag: string | null;
          text: string;
          title: string | null;
          traveler_tags: string[];
          trip_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          backstory?: string | null;
          budget_note?: string | null;
          category: string;
          created_at?: string;
          id?: string;
          insight?: string | null;
          keywords?: string[] | null;
          kind: string;
          presentation_tag?: string | null;
          text: string;
          title?: string | null;
          traveler_tags?: string[];
          trip_id?: string | null;
        };
        Update: {
          backstory?: string | null;
          budget_note?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          insight?: string | null;
          keywords?: string[] | null;
          kind?: string;
          presentation_tag?: string | null;
          text?: string;
          title?: string | null;
          traveler_tags?: string[];
          trip_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "security_missions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      skip_passes: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          ref: string;
          season: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          ref?: string;
          season: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          ref?: string;
          season?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "skip_passes_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      solo_quests: {
        Row: {
          backstory: string | null;
          budget_note: string | null;
          created_at: string;
          day_number: number;
          experience_id: string;
          finished_at: string | null;
          id: string;
          insight: string | null;
          keywords: string[];
          lens: string | null;
          mission_text: string;
          opened_at: string | null;
          photo_path: string | null;
          presentation: string;
          speed_bonus: boolean;
          story: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          backstory?: string | null;
          budget_note?: string | null;
          created_at?: string;
          day_number: number;
          experience_id: string;
          finished_at?: string | null;
          id?: string;
          insight?: string | null;
          keywords?: string[];
          lens?: string | null;
          mission_text: string;
          opened_at?: string | null;
          photo_path?: string | null;
          presentation?: string;
          speed_bonus?: boolean;
          story?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          backstory?: string | null;
          budget_note?: string | null;
          created_at?: string;
          day_number?: number;
          experience_id?: string;
          finished_at?: string | null;
          id?: string;
          insight?: string | null;
          keywords?: string[];
          lens?: string | null;
          mission_text?: string;
          opened_at?: string | null;
          photo_path?: string | null;
          presentation?: string;
          speed_bonus?: boolean;
          story?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "solo_quests_experience_id_fkey";
            columns: ["experience_id"];
            isOneToOne: false;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      song_discs: {
        Row: {
          artist: string;
          created_at: string;
          title: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          artist: string;
          created_at?: string;
          title: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          artist?: string;
          created_at?: string;
          title?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "song_discs_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      stamp_settings: {
        Row: {
          created_at: string;
          here_stamps: number;
          host_stamps: number;
          trip_id: string;
          updated_at: string;
          win_stamps: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          here_stamps?: number;
          host_stamps?: number;
          trip_id: string;
          updated_at?: string;
          win_stamps?: number;
        };
        Update: {
          created_at?: string;
          here_stamps?: number;
          host_stamps?: number;
          trip_id?: string;
          updated_at?: string;
          win_stamps?: number;
        };
        Relationships: [
          {
            foreignKeyName: "stamp_settings_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_adult_activities: {
        Row: {
          alternative: string;
          created_at: string;
          day_date: string;
          item_index: number;
          kind: string;
          options: Json | null;
          prompt: string;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          alternative: string;
          created_at?: string;
          day_date: string;
          item_index: number;
          kind: string;
          options?: Json | null;
          prompt: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          alternative?: string;
          created_at?: string;
          day_date?: string;
          item_index?: number;
          kind?: string;
          options?: Json | null;
          prompt?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_adult_activities_trip_id_day_date_fkey";
            columns: ["trip_id", "day_date"];
            isOneToOne: false;
            referencedRelation: "trip_day_games";
            referencedColumns: ["trip_id", "day_date"];
          },
        ];
      };
      trip_adult_approvals: {
        Row: {
          approved_by: string;
          created_at: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_by: string;
          created_at?: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approved_by?: string;
          created_at?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_adult_approvals_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_adult_settings: {
        Row: {
          created_at: string;
          enabled: boolean;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          enabled?: boolean;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_adult_settings_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_crownings: {
        Row: {
          decided_at: string;
          how: string;
          season: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          decided_at?: string;
          how: string;
          season: string;
          trip_id: string;
        };
        Update: {
          decided_at?: string;
          how?: string;
          season?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_crownings_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_crowns: {
        Row: {
          crowned_at: string;
          points: number;
          season: string;
          solo_goal: number | null;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          crowned_at?: string;
          points: number;
          season: string;
          solo_goal?: number | null;
          trip_id: string;
          user_id: string;
        };
        Update: {
          crowned_at?: string;
          points?: number;
          season?: string;
          solo_goal?: number | null;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_crowns_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_day_games: {
        Row: {
          airport: NonNullable<Json>;
          bingo: NonNullable<Json>;
          bingo_mode: string;
          city: string;
          created_at: string;
          day_date: string;
          photo_theme: string;
          quests: NonNullable<Json>;
          released_at: string | null;
          tag: string;
          trip_id: string;
          trivia: NonNullable<Json>;
          updated_at: string;
          wheels_up: string | null;
        };
        ComputedFields: never;
        Insert: {
          airport?: NonNullable<Json>;
          bingo?: NonNullable<Json>;
          bingo_mode?: string;
          city?: string;
          created_at?: string;
          day_date: string;
          photo_theme?: string;
          quests?: NonNullable<Json>;
          released_at?: string | null;
          tag: string;
          trip_id: string;
          trivia?: NonNullable<Json>;
          updated_at?: string;
          wheels_up?: string | null;
        };
        Update: {
          airport?: NonNullable<Json>;
          bingo?: NonNullable<Json>;
          bingo_mode?: string;
          city?: string;
          created_at?: string;
          day_date?: string;
          photo_theme?: string;
          quests?: NonNullable<Json>;
          released_at?: string | null;
          tag?: string;
          trip_id?: string;
          trivia?: NonNullable<Json>;
          updated_at?: string;
          wheels_up?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trip_day_games_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_day_tags: {
        Row: {
          created_at: string;
          day_date: string;
          tag: string;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day_date: string;
          tag: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          tag?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_day_tags_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_day_trivia_keys: {
        Row: {
          answers: NonNullable<Json>;
          created_at: string;
          day_date: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          answers?: NonNullable<Json>;
          created_at?: string;
          day_date: string;
          trip_id: string;
        };
        Update: {
          answers?: NonNullable<Json>;
          created_at?: string;
          day_date?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_day_trivia_keys_trip_id_day_date_fkey";
            columns: ["trip_id", "day_date"];
            isOneToOne: true;
            referencedRelation: "trip_day_games";
            referencedColumns: ["trip_id", "day_date"];
          },
        ];
      };
      trip_deletion_log: {
        Row: {
          captain_id: string;
          created_at: string;
          id: string;
          member_count: number;
          trip_id: string;
          trip_name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          captain_id: string;
          created_at?: string;
          id?: string;
          member_count: number;
          trip_id: string;
          trip_name: string;
          updated_at?: string;
        };
        Update: {
          captain_id?: string;
          created_at?: string;
          id?: string;
          member_count?: number;
          trip_id?: string;
          trip_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trip_deletion_notes: {
        Row: {
          captain_id: string;
          created_at: string;
          id: string;
          trip_name: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          captain_id: string;
          created_at?: string;
          id?: string;
          trip_name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          captain_id?: string;
          created_at?: string;
          id?: string;
          trip_name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trip_drafts: {
        Row: {
          data: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          data: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          data?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trip_feedback: {
        Row: {
          change_text: string | null;
          created_at: string;
          favorite: string | null;
          score: number | null;
          skipped: boolean;
          squad_message: string | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          change_text?: string | null;
          created_at?: string;
          favorite?: string | null;
          score?: number | null;
          skipped?: boolean;
          squad_message?: string | null;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          change_text?: string | null;
          created_at?: string;
          favorite?: string | null;
          score?: number | null;
          skipped?: boolean;
          squad_message?: string | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_feedback_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_guides: {
        Row: {
          published_at: string | null;
          published_by: string | null;
          token: string;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          published_at?: string | null;
          published_by?: string | null;
          token?: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          published_at?: string | null;
          published_by?: string | null;
          token?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_guides_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_invites: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          created_by: string;
          expires_at: string;
          guardian_confirmed_at: string | null;
          id: string;
          teen: boolean;
          token: string;
          trip_id: string;
          used_at: string | null;
          used_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
          created_at?: string;
          created_by: string;
          expires_at?: string;
          guardian_confirmed_at?: string | null;
          id?: string;
          teen?: boolean;
          token: string;
          trip_id: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          guardian_confirmed_at?: string | null;
          id?: string;
          teen?: boolean;
          token?: string;
          trip_id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trip_invites_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_item_alternatives: {
        Row: {
          alternative: string;
          created_at: string;
          day_date: string;
          item_index: number;
          kind: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          alternative: string;
          created_at?: string;
          day_date: string;
          item_index: number;
          kind: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          alternative?: string;
          created_at?: string;
          day_date?: string;
          item_index?: number;
          kind?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_item_alternatives_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_itineraries: {
        Row: {
          created_at: string;
          days: NonNullable<Json>;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          days?: NonNullable<Json>;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          days?: NonNullable<Json>;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_itineraries_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_members: {
        Row: {
          approved_at: string | null;
          joined_at: string;
          joined_week: number | null;
          role: string;
          season_closed: boolean;
          start_stamps: number;
          status: string;
          trip_id: string;
          trip_start_stamps: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          joined_at?: string;
          joined_week?: number | null;
          role?: string;
          season_closed?: boolean;
          start_stamps?: number;
          status?: string;
          trip_id: string;
          trip_start_stamps?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          approved_at?: string | null;
          joined_at?: string;
          joined_week?: number | null;
          role?: string;
          season_closed?: boolean;
          start_stamps?: number;
          status?: string;
          trip_id?: string;
          trip_start_stamps?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_play_state: {
        Row: {
          created_at: string;
          draw_at: string | null;
          draw_card_id: number | null;
          draw_category: string | null;
          play_phase_override: number | null;
          spin_at: string | null;
          spin_game: number | null;
          spin_week: number | null;
          timer_ends_at: string | null;
          timer_label: string | null;
          timer_secs: number | null;
          trip_id: string;
          updated_at: string;
          used_games: number[];
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          draw_at?: string | null;
          draw_card_id?: number | null;
          draw_category?: string | null;
          play_phase_override?: number | null;
          spin_at?: string | null;
          spin_game?: number | null;
          spin_week?: number | null;
          timer_ends_at?: string | null;
          timer_label?: string | null;
          timer_secs?: number | null;
          trip_id: string;
          updated_at?: string;
          used_games?: number[];
        };
        Update: {
          created_at?: string;
          draw_at?: string | null;
          draw_card_id?: number | null;
          draw_category?: string | null;
          play_phase_override?: number | null;
          spin_at?: string | null;
          spin_game?: number | null;
          spin_week?: number | null;
          timer_ends_at?: string | null;
          timer_label?: string | null;
          timer_secs?: number | null;
          trip_id?: string;
          updated_at?: string;
          used_games?: number[];
        };
        Relationships: [
          {
            foreignKeyName: "trip_play_state_draw_card_id_fkey";
            columns: ["draw_card_id"];
            isOneToOne: false;
            referencedRelation: "game_cards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_play_state_spin_game_fkey";
            columns: ["spin_game"];
            isOneToOne: false;
            referencedRelation: "game_catalog";
            referencedColumns: ["number"];
          },
          {
            foreignKeyName: "trip_play_state_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_player_cards: {
        Row: {
          avatar_path: string | null;
          avatar_seed: string;
          avatar_style: string;
          created_at: string;
          fun_fact: string | null;
          game_name: string;
          hometown: string | null;
          most_excited: string | null;
          next_year_goal: string | null;
          occupation: string | null;
          pronouns: string | null;
          real_name: string;
          stamp_count: number;
          trip_id: string;
          trip_persona: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          avatar_seed?: string;
          avatar_style?: string;
          created_at?: string;
          fun_fact?: string | null;
          game_name: string;
          hometown?: string | null;
          most_excited?: string | null;
          next_year_goal?: string | null;
          occupation?: string | null;
          pronouns?: string | null;
          real_name: string;
          stamp_count?: number;
          trip_id: string;
          trip_persona?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_path?: string | null;
          avatar_seed?: string;
          avatar_style?: string;
          created_at?: string;
          fun_fact?: string | null;
          game_name?: string;
          hometown?: string | null;
          most_excited?: string | null;
          next_year_goal?: string | null;
          occupation?: string | null;
          pronouns?: string | null;
          real_name?: string;
          stamp_count?: number;
          trip_id?: string;
          trip_persona?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_player_cards_trip_id_user_id_fkey";
            columns: ["trip_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "trip_members";
            referencedColumns: ["trip_id", "user_id"];
          },
        ];
      };
      trip_postcards: {
        Row: {
          answers: NonNullable<Json>;
          crowns: NonNullable<Json>;
          excited: NonNullable<Json>;
          image_path: string | null;
          locked_at: string;
          photos: NonNullable<Json>;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          answers?: NonNullable<Json>;
          crowns?: NonNullable<Json>;
          excited?: NonNullable<Json>;
          image_path?: string | null;
          locked_at?: string;
          photos?: NonNullable<Json>;
          trip_id: string;
        };
        Update: {
          answers?: NonNullable<Json>;
          crowns?: NonNullable<Json>;
          excited?: NonNullable<Json>;
          image_path?: string | null;
          locked_at?: string;
          photos?: NonNullable<Json>;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_postcards_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_role_changes: {
        Row: {
          actor: string | null;
          created_at: string;
          from_user: string | null;
          id: string;
          reason: string;
          role: string;
          to_user: string | null;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          actor?: string | null;
          created_at?: string;
          from_user?: string | null;
          id?: string;
          reason: string;
          role: string;
          to_user?: string | null;
          trip_id: string;
        };
        Update: {
          actor?: string | null;
          created_at?: string;
          from_user?: string | null;
          id?: string;
          reason?: string;
          role?: string;
          to_user?: string | null;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_role_changes_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_schedule: {
        Row: {
          closes_at: string | null;
          content_item_id: string | null;
          created_at: string;
          day: string | null;
          id: string;
          kind: string;
          opens_at: string;
          points: number | null;
          ref_id: string | null;
          revealed_at: string | null;
          settled_at: string | null;
          shared: boolean;
          slot: string;
          tailored_text: string | null;
          trip_id: string;
          updated_at: string;
          user_id: string | null;
          variant: string | null;
        };
        ComputedFields: never;
        Insert: {
          closes_at?: string | null;
          content_item_id?: string | null;
          created_at?: string;
          day?: string | null;
          id?: string;
          kind: string;
          opens_at: string;
          points?: number | null;
          ref_id?: string | null;
          revealed_at?: string | null;
          settled_at?: string | null;
          shared?: boolean;
          slot?: string;
          tailored_text?: string | null;
          trip_id: string;
          updated_at?: string;
          user_id?: string | null;
          variant?: string | null;
        };
        Update: {
          closes_at?: string | null;
          content_item_id?: string | null;
          created_at?: string;
          day?: string | null;
          id?: string;
          kind?: string;
          opens_at?: string;
          points?: number | null;
          ref_id?: string | null;
          revealed_at?: string | null;
          settled_at?: string | null;
          shared?: boolean;
          slot?: string;
          tailored_text?: string | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string | null;
          variant?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trip_schedule_content_fk";
            columns: ["content_item_id"];
            isOneToOne: false;
            referencedRelation: "content_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_schedule_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_season_finds: {
        Row: {
          day_date: string;
          declined_at: string | null;
          game_id: string;
          id: string;
          proof_path: string;
          slot: number;
          submitted_at: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          day_date: string;
          declined_at?: string | null;
          game_id: string;
          id?: string;
          proof_path: string;
          slot: number;
          submitted_at?: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          day_date?: string;
          declined_at?: string | null;
          game_id?: string;
          id?: string;
          proof_path?: string;
          slot?: number;
          submitted_at?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_season_finds_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "trip_season_games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_season_finds_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_season_games: {
        Row: {
          city: string;
          created_at: string;
          day_date: string;
          game: string;
          id: string;
          speed_minutes: number | null;
          tasks: NonNullable<Json>;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          city?: string;
          created_at?: string;
          day_date: string;
          game: string;
          id?: string;
          speed_minutes?: number | null;
          tasks?: NonNullable<Json>;
          trip_id: string;
        };
        Update: {
          city?: string;
          created_at?: string;
          day_date?: string;
          game?: string;
          id?: string;
          speed_minutes?: number | null;
          tasks?: NonNullable<Json>;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_season_games_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_season_reveals: {
        Row: {
          day_date: string;
          revealed_at: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          day_date: string;
          revealed_at?: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          day_date?: string;
          revealed_at?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_season_reveals_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_team_members: {
        Row: {
          created_at: string;
          team_id: string;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          team_id: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          team_id?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_team_members_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "trip_teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_team_members_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_teams: {
        Row: {
          call_link: string | null;
          capacity: number | null;
          color: string;
          created_at: string;
          host_id: string | null;
          id: string;
          name: string;
          trip_id: string;
        };
        ComputedFields: never;
        Insert: {
          call_link?: string | null;
          capacity?: number | null;
          color: string;
          created_at?: string;
          host_id?: string | null;
          id?: string;
          name: string;
          trip_id: string;
        };
        Update: {
          call_link?: string | null;
          capacity?: number | null;
          color?: string;
          created_at?: string;
          host_id?: string | null;
          id?: string;
          name?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_teams_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          a2e_room: boolean;
          arrived_at: string | null;
          arrived_by: string | null;
          at_home_length: string | null;
          at_home_pack: string | null;
          backup_call_link: string | null;
          big_group: boolean;
          bingo_needs_photo: boolean;
          call_link: string | null;
          created_at: string;
          crowning_at: string | null;
          crowning_call_link: string | null;
          crowning_place: string | null;
          cultures: string[];
          dest_lat: number | null;
          dest_lng: number | null;
          dest_place_id: string | null;
          destination: string;
          end_date: string;
          ended_at: string | null;
          extra_seats: boolean;
          finale_at: string | null;
          finale_format: string | null;
          finale_place: string | null;
          focuses: string[];
          game_days_every: number | null;
          game_plan: string | null;
          game_start: string | null;
          guide_published_at: string | null;
          has_minors: boolean;
          home_timezone: string;
          id: string;
          is_sandbox: boolean;
          join_code: string;
          join_code_enabled: boolean;
          join_locked: boolean;
          kind: string;
          leaderboard_public: boolean;
          locked_at: string | null;
          max_squad: number;
          motto: string | null;
          name: string;
          passport_city: string | null;
          passport_country: string | null;
          passport_state: string | null;
          pay_note: string | null;
          photos_purged_at: string | null;
          play_arrangement: string | null;
          play_mode: string;
          preflight_days: number;
          preflight_skipped: boolean;
          require_approval: boolean;
          rest_days: string[];
          room: string;
          room_city: string | null;
          room_country: string | null;
          room_listed: boolean;
          room_nickname: string | null;
          room_region: string | null;
          rules_version: number;
          schedule_every: number;
          season_rule: string;
          season_scoring: boolean;
          setup_completed_at: string | null;
          solo_experience_id: string | null;
          start_date: string;
          surprise_mode: boolean;
          team_mode: string;
          trip_timezone: string;
          unlocked_at: string | null;
          unlocked_by: string | null;
          updated_at: string;
          vibe: string;
        };
        ComputedFields: never;
        Insert: {
          a2e_room?: boolean;
          arrived_at?: string | null;
          arrived_by?: string | null;
          at_home_length?: string | null;
          at_home_pack?: string | null;
          backup_call_link?: string | null;
          big_group?: boolean;
          bingo_needs_photo?: boolean;
          call_link?: string | null;
          created_at?: string;
          crowning_at?: string | null;
          crowning_call_link?: string | null;
          crowning_place?: string | null;
          cultures?: string[];
          dest_lat?: number | null;
          dest_lng?: number | null;
          dest_place_id?: string | null;
          destination: string;
          end_date: string;
          ended_at?: string | null;
          extra_seats?: boolean;
          finale_at?: string | null;
          finale_format?: string | null;
          finale_place?: string | null;
          focuses?: string[];
          game_days_every?: number | null;
          game_plan?: string | null;
          game_start?: string | null;
          guide_published_at?: string | null;
          has_minors?: boolean;
          home_timezone: string;
          id?: string;
          is_sandbox?: boolean;
          join_code: string;
          join_code_enabled?: boolean;
          join_locked?: boolean;
          kind?: string;
          leaderboard_public?: boolean;
          locked_at?: string | null;
          max_squad?: number;
          motto?: string | null;
          name: string;
          passport_city?: string | null;
          passport_country?: string | null;
          passport_state?: string | null;
          pay_note?: string | null;
          photos_purged_at?: string | null;
          play_arrangement?: string | null;
          play_mode?: string;
          preflight_days?: number;
          preflight_skipped?: boolean;
          require_approval?: boolean;
          rest_days?: string[];
          room?: string;
          room_city?: string | null;
          room_country?: string | null;
          room_listed?: boolean;
          room_nickname?: string | null;
          room_region?: string | null;
          rules_version?: number;
          schedule_every?: number;
          season_rule?: string;
          season_scoring?: boolean;
          setup_completed_at?: string | null;
          solo_experience_id?: string | null;
          start_date: string;
          surprise_mode?: boolean;
          team_mode?: string;
          trip_timezone: string;
          unlocked_at?: string | null;
          unlocked_by?: string | null;
          updated_at?: string;
          vibe?: string;
        };
        Update: {
          a2e_room?: boolean;
          arrived_at?: string | null;
          arrived_by?: string | null;
          at_home_length?: string | null;
          at_home_pack?: string | null;
          backup_call_link?: string | null;
          big_group?: boolean;
          bingo_needs_photo?: boolean;
          call_link?: string | null;
          created_at?: string;
          crowning_at?: string | null;
          crowning_call_link?: string | null;
          crowning_place?: string | null;
          cultures?: string[];
          dest_lat?: number | null;
          dest_lng?: number | null;
          dest_place_id?: string | null;
          destination?: string;
          end_date?: string;
          ended_at?: string | null;
          extra_seats?: boolean;
          finale_at?: string | null;
          finale_format?: string | null;
          finale_place?: string | null;
          focuses?: string[];
          game_days_every?: number | null;
          game_plan?: string | null;
          game_start?: string | null;
          guide_published_at?: string | null;
          has_minors?: boolean;
          home_timezone?: string;
          id?: string;
          is_sandbox?: boolean;
          join_code?: string;
          join_code_enabled?: boolean;
          join_locked?: boolean;
          kind?: string;
          leaderboard_public?: boolean;
          locked_at?: string | null;
          max_squad?: number;
          motto?: string | null;
          name?: string;
          passport_city?: string | null;
          passport_country?: string | null;
          passport_state?: string | null;
          pay_note?: string | null;
          photos_purged_at?: string | null;
          play_arrangement?: string | null;
          play_mode?: string;
          preflight_days?: number;
          preflight_skipped?: boolean;
          require_approval?: boolean;
          rest_days?: string[];
          room?: string;
          room_city?: string | null;
          room_country?: string | null;
          room_listed?: boolean;
          room_nickname?: string | null;
          room_region?: string | null;
          rules_version?: number;
          schedule_every?: number;
          season_rule?: string;
          season_scoring?: boolean;
          setup_completed_at?: string | null;
          solo_experience_id?: string | null;
          start_date?: string;
          surprise_mode?: boolean;
          team_mode?: string;
          trip_timezone?: string;
          unlocked_at?: string | null;
          unlocked_by?: string | null;
          updated_at?: string;
          vibe?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_solo_experience_id_fkey";
            columns: ["solo_experience_id"];
            isOneToOne: false;
            referencedRelation: "culture_experiences";
            referencedColumns: ["id"];
          },
        ];
      };
      trivia_answers: {
        Row: {
          choice: number;
          correct: boolean;
          created_at: string;
          day_date: string;
          question: number;
          trip_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          choice: number;
          correct: boolean;
          created_at?: string;
          day_date: string;
          question: number;
          trip_id: string;
          user_id: string;
        };
        Update: {
          choice?: number;
          correct?: boolean;
          created_at?: string;
          day_date?: string;
          question?: number;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trivia_answers_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      user_badges: {
        Row: {
          badge: string;
          earned_at: string;
          progress: number;
          seen_at: string | null;
          tier: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          badge: string;
          earned_at?: string;
          progress?: number;
          seen_at?: string | null;
          tier: number;
          user_id: string;
        };
        Update: {
          badge?: string;
          earned_at?: string;
          progress?: number;
          seen_at?: string | null;
          tier?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      user_blocks: {
        Row: {
          changed_at: string;
          changed_by: string;
          disabled: boolean;
          note: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          changed_by: string;
          disabled: boolean;
          note?: string | null;
          user_id: string;
        };
        Update: {
          changed_at?: string;
          changed_by?: string;
          disabled?: boolean;
          note?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_credits: {
        Row: {
          balance: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          balance?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          balance?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      waitlist: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      weekly_answer_votes: {
        Row: {
          created_at: string;
          target_id: string;
          trip_id: string;
          voter_id: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          target_id: string;
          trip_id: string;
          voter_id: string;
          week_number: number;
        };
        Update: {
          created_at?: string;
          target_id?: string;
          trip_id?: string;
          voter_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_answer_votes_trip_id_week_number_fkey";
            columns: ["trip_id", "week_number"];
            isOneToOne: false;
            referencedRelation: "weekly_questions";
            referencedColumns: ["trip_id", "week_number"];
          },
        ];
      };
      weekly_answers: {
        Row: {
          answer: string;
          created_at: string;
          emoji: string | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
          week_number: number;
        };
        ComputedFields: never;
        Insert: {
          answer: string;
          created_at?: string;
          emoji?: string | null;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          week_number: number;
        };
        Update: {
          answer?: string;
          created_at?: string;
          emoji?: string | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_answers_trip_id_week_number_fkey";
            columns: ["trip_id", "week_number"];
            isOneToOne: false;
            referencedRelation: "weekly_questions";
            referencedColumns: ["trip_id", "week_number"];
          },
        ];
      };
      weekly_question_pool: {
        Row: {
          created_at: string;
          id: number;
          prompt: string;
          spicy: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: number;
          prompt: string;
          spicy?: boolean;
        };
        Update: {
          created_at?: string;
          id?: number;
          prompt?: string;
          spicy?: boolean;
        };
        Relationships: [];
      };
      weekly_questions: {
        Row: {
          created_at: string;
          drops_at: string;
          phase: string;
          prompt: string;
          read_index: number;
          revealed_at: string | null;
          shuffle_salt: string;
          source: string;
          tie_ids: string[];
          tie_spin_at: string | null;
          trip_id: string;
          updated_at: string;
          week_number: number;
          winner_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          drops_at: string;
          phase?: string;
          prompt: string;
          read_index?: number;
          revealed_at?: string | null;
          shuffle_salt?: string;
          source?: string;
          tie_ids?: string[];
          tie_spin_at?: string | null;
          trip_id: string;
          updated_at?: string;
          week_number: number;
          winner_id?: string | null;
        };
        Update: {
          created_at?: string;
          drops_at?: string;
          phase?: string;
          prompt?: string;
          read_index?: number;
          revealed_at?: string | null;
          shuffle_salt?: string;
          source?: string;
          tie_ids?: string[];
          tie_spin_at?: string | null;
          trip_id?: string;
          updated_at?: string;
          week_number?: number;
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_questions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      window_guide_items: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          kind: string;
          photo_path: string | null;
          position: number;
          status: string;
          trip_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          kind: string;
          photo_path?: string | null;
          position?: number;
          status?: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          photo_path?: string | null;
          position?: number;
          status?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "window_guide_items_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      wrapup_answers: {
        Row: {
          answer: string;
          question_key: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          answer: string;
          question_key: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          answer?: string;
          question_key?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wrapup_answers_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      a2c_quest_insights: {
        Args: { p_trip: string };
        Returns: {
          insight: string;
          quest_id: string;
        }[];
      };
      accept_legal: { Args: { p_version: string }; Returns: undefined };
      account_status: {
        Args: Record<PropertyKey, never>;
        Returns: {
          accepted_at: string;
          founding_member: boolean;
          founding_open: boolean;
          legal_version: string;
        }[];
      };
      add_checkin_tasks: { Args: { p_tasks: Json; p_trip: string }; Returns: number };
      add_trip_missions: { Args: { p_texts: string[]; p_trip: string }; Returns: number };
      admin_content_items: {
        Args: { p_kind?: string; p_offset?: number; p_query?: string; p_reviewed?: boolean };
        Returns: {
          active: boolean;
          alcohol: boolean;
          answer: number | null;
          body: string;
          choices: string[];
          created_at: string;
          culture: string | null;
          difficulty: string | null;
          focus: string | null;
          id: string;
          insight: string | null;
          items: string[];
          kind: string;
          locale: string;
          min_age: number;
          modes: string[];
          review_note: string | null;
          reviewed: boolean;
          rooms: string[];
          source: string;
          source_ref: string;
          title: string | null;
          updated_at: string;
          vibe: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "content_items";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      admin_find_trips: {
        Args: { p_query: string };
        Returns: {
          archived: boolean;
          created_at: string;
          destination: string;
          end_date: string;
          id: string;
          is_sandbox: boolean;
          locked_at: string;
          members: number;
          name: string;
          phase: string;
          play_mode: string;
          room: string;
          start_date: string;
        }[];
      };
      admin_find_users: {
        Args: { p_query: string };
        Returns: {
          age_range: string;
          created_at: string;
          disabled: boolean;
          email: string;
          game_name: string;
          last_sign_in_at: string;
          trips: number;
          user_id: string;
        }[];
      };
      admin_save_content_item: {
        Args: { p_id: string; p_patch: Json };
        Returns: {
          active: boolean;
          alcohol: boolean;
          answer: number | null;
          body: string;
          choices: string[];
          created_at: string;
          culture: string | null;
          difficulty: string | null;
          focus: string | null;
          id: string;
          insight: string | null;
          items: string[];
          kind: string;
          locale: string;
          min_age: number;
          modes: string[];
          review_note: string | null;
          reviewed: boolean;
          rooms: string[];
          source: string;
          source_ref: string;
          title: string | null;
          updated_at: string;
          vibe: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "content_items";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      adult_badge: { Args: { p_trip: string; p_user: string }; Returns: boolean };
      advance_play_phase: { Args: { p_current: number; p_trip: string }; Returns: number };
      ai_cost_per_trip: { Args: Record<PropertyKey, never>; Returns: number };
      ai_cost_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          action: string;
          avg_cost_usd: number;
          avg_in: number;
          avg_out: number;
          calls: number;
          credits: number;
          total_cost_usd: number;
        }[];
      };
      ai_credit_status: {
        Args: { p_trip: string };
        Returns: {
          included: number;
          itinerary_today: number;
          purchased: number;
          remaining: number;
          used: number;
        }[];
      };
      ai_daily_counts: {
        Args: Record<PropertyKey, never>;
        Returns: {
          calls: number;
          day: string;
          user_id: string;
        }[];
      };
      ai_gate_server: { Args: { p_kind: string; p_trip: string; p_user: string }; Returns: string };
      ai_guard_report: { Args: Record<PropertyKey, never>; Returns: Json };
      ai_reserve_server: {
        Args: { p_kind: string; p_trip: string; p_user: string };
        Returns: string;
      };
      answer_daily: {
        Args: { p_choice?: number; p_item: string };
        Returns: {
          answer: number;
          correct: boolean;
          points: number;
        }[];
      };
      answer_trivia: {
        Args: { p_choice: number; p_date: string; p_question: number; p_trip: string };
        Returns: boolean;
      };
      answer_weekly_question: {
        Args: { p_answer: string; p_emoji: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      answer_wrapup: {
        Args: { p_answer: string; p_key: string; p_trip: string };
        Returns: undefined;
      };
      apply_game_plan: {
        Args: {
          p_count?: number;
          p_every: number;
          p_plan: string;
          p_start: string;
          p_time: string;
          p_trip: string;
          p_weekday: number;
        };
        Returns: number;
      };
      apply_reschedule: {
        Args: { p_count: number; p_every: number; p_trip: string };
        Returns: number;
      };
      approve_adult_player: {
        Args: { p_approve: boolean; p_trip: string; p_user: string };
        Returns: undefined;
      };
      approve_inspiration: { Args: { p_approve: boolean; p_card: string }; Returns: undefined };
      approve_member: {
        Args: { p_approve: boolean; p_trip: string; p_user: string };
        Returns: undefined;
      };
      approve_proof: { Args: { p_proof: string }; Returns: boolean };
      archive_legacy_trips: {
        Args: { p_created_before: string; p_keep: string[]; p_note: string };
        Returns: number;
      };
      at_home_answer: { Args: { p_activity: string; p_answer: string }; Returns: undefined };
      at_home_mark_winner: { Args: { p_activity: string; p_user: string }; Returns: undefined };
      at_home_move_call: { Args: { p_activity: string; p_at: string }; Returns: undefined };
      at_home_mvp: {
        Args: { p_trip: string };
        Returns: {
          points: number;
          user_id: string;
          votes: number;
          wins: number;
        }[];
      };
      at_home_plan: {
        Args: { p_trip: string };
        Returns: {
          answered: boolean;
          answers: number;
          body: string;
          day_date: string;
          extra_body: string;
          extra_title: string;
          game_how: string;
          game_name: string;
          id: string;
          kind: string;
          released: boolean;
          revealed: boolean;
          starts_at: string;
          title: string;
          today: string;
          voted: boolean;
          want: string;
          winner_id: string;
        }[];
      };
      at_home_question: {
        Args: { p_activity: string };
        Returns: {
          answer: string;
          idx: number;
          mine: boolean;
          my_vote: boolean;
          user_id: string;
          votes: number;
        }[];
      };
      at_home_reveal: { Args: { p_activity: string }; Returns: undefined };
      at_home_vote: { Args: { p_activity: string; p_idx: number }; Returns: undefined };
      boarding_tile: { Args: Record<PropertyKey, never>; Returns: string };
      break_postcard_tie: {
        Args: { p_on?: boolean; p_proof: string; p_trip: string };
        Returns: undefined;
      };
      cancel_trip_invite: { Args: { p_invite: string }; Returns: undefined };
      captain_pass_limit: { Args: { p_trip: string }; Returns: number };
      captain_status: {
        Args: { p_trip: string };
        Returns: {
          can_reclaim: boolean;
          can_take_over: boolean;
          captain_id: string;
          captain_last_seen: string;
          reclaim_until: string;
        }[];
      };
      cast_day_vote: {
        Args: { p_choice: string; p_date: string; p_kind: string; p_trip: string };
        Returns: undefined;
      };
      cast_live_vote: { Args: { p_option: number; p_vote: string }; Returns: undefined };
      check_cron_key: { Args: { p_key: string; p_name: string }; Returns: boolean };
      checkout_beta: { Args: { p_trip: string }; Returns: string };
      claim_airport: {
        Args: {
          p_date: string;
          p_guess: string;
          p_mission: number;
          p_photo: string;
          p_trip: string;
        };
        Returns: undefined;
      };
      claim_drop_live: { Args: { p_item: string }; Returns: string };
      claim_notifications: {
        Args: { p_limit?: number; p_user?: string };
        Returns: {
          attempts: number;
          body: string;
          deep_link: string;
          email: boolean;
          email_address: string;
          id: string;
          push: boolean;
          subscriptions: Json;
          title: string;
          type: string;
          user_id: string;
        }[];
      };
      clear_song_discs: { Args: { p_trip: string }; Returns: undefined };
      close_live: { Args: { p_session: string }; Returns: undefined };
      close_live_vote: { Args: { p_vote: string }; Returns: undefined };
      confirm_cost_payment: {
        Args: { p_item: string; p_paid_cents: number; p_user: string };
        Returns: undefined;
      };
      confirm_departure: { Args: { p_trip: string }; Returns: undefined };
      confirm_game_nights: { Args: { p_option: number; p_trip: string }; Returns: undefined };
      content_feedback_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          downs: number;
          item_text: string;
          kind: string;
          ups: number;
        }[];
      };
      create_at_home: {
        Args: { p_length: string; p_pack: string; p_start: string; p_tz: string; p_vibe: string };
        Returns: string;
      };
      create_at_home_a2c: {
        Args: {
          p_days: number;
          p_format: string;
          p_pack: string;
          p_place?: string;
          p_start: string;
          p_tz: string;
          p_vibe: string;
        };
        Returns: string;
      };
      create_beta_codes: { Args: { p_count: number; p_note: string }; Returns: string[] };
      create_culture_a2e: {
        Args: {
          p_city: string;
          p_country: string;
          p_days: number;
          p_finale: string;
          p_kind: string;
          p_layer: string;
          p_mode: string;
          p_place: string;
          p_prep: number;
          p_region: string;
          p_repeat?: boolean;
          p_start: string;
          p_title: string;
          p_types: string[];
          p_vibe: string;
        };
        Returns: string;
      };
      create_culture_play_mode: {
        Args: {
          p_city: string;
          p_country: string;
          p_days: number;
          p_finale: string;
          p_kind: string;
          p_layer: string;
          p_mode: string;
          p_place: string;
          p_region: string;
          p_repeat?: boolean;
          p_start: string;
          p_title: string;
          p_types: string[];
          p_vibe: string;
        };
        Returns: string;
      };
      create_teen_invite: { Args: { p_guardian: boolean; p_trip: string }; Returns: string };
      create_trip: {
        Args: {
          p_destination: string;
          p_end_date: string;
          p_home_timezone: string;
          p_name: string;
          p_start_date: string;
        };
        Returns: string;
      };
      create_trip_a2c: {
        Args: {
          p_destination: string;
          p_end_date: string;
          p_home_timezone: string;
          p_name: string;
          p_start_date: string;
        };
        Returns: string;
      };
      create_trip_invite: { Args: { p_trip: string }; Returns: string };
      create_trip_play_mode: {
        Args: {
          p_destination: string;
          p_end_date: string;
          p_home_timezone: string;
          p_mode: string;
          p_name: string;
          p_start_date: string;
        };
        Returns: string;
      };
      create_trip_play_mode_v2: {
        Args: {
          p_country: string;
          p_destination: string;
          p_end_date: string;
          p_home_timezone: string;
          p_mode: string;
          p_name: string;
          p_start_date: string;
        };
        Returns: string;
      };
      create_trip_play_mode_v3: {
        Args: {
          p_country: string;
          p_destination: string;
          p_end_date: string;
          p_home_timezone: string;
          p_mode: string;
          p_name: string;
          p_start_date: string;
          p_types: string[];
        };
        Returns: string;
      };
      create_trip_v2: { Args: { p_setup: Json }; Returns: string };
      create_window_play_mode: {
        Args: {
          p_city: string;
          p_country: string;
          p_days: number;
          p_mode: string;
          p_prep: number;
          p_region: string;
          p_start: string;
          p_title: string;
          p_types: string[];
          p_vibe: string;
        };
        Returns: string;
      };
      crew_check: {
        Args: { p_trip: string };
        Returns: {
          ai_status: string;
          body: string;
          created_at: string;
          expires_at: string;
          id: string;
          kind: string;
          photo_path: string;
          schedule_id: string;
          title: string;
          user_id: string;
        }[];
      };
      crown_now: { Args: { p_trip: string }; Returns: undefined };
      culture_a2e_action: {
        Args: { p_action: string; p_cards?: Json; p_exp: string };
        Returns: Json;
      };
      culture_action: { Args: { p?: Json; p_action: string; p_exp?: string }; Returns: Json };
      culture_badges: {
        Args: Record<PropertyKey, never>;
        Returns: {
          earned_at: string;
          track: string;
        }[];
      };
      culture_creator_badge: { Args: { p_user: string }; Returns: string };
      culture_days: {
        Args: { p_exp: string };
        Returns: {
          backstory: string;
          confirmed_at: string | null;
          confirmed_by: string | null;
          day_number: number;
          done_at: string | null;
          experience_id: string;
          fact: string | null;
          id: string;
          keywords: string[];
          note: string | null;
          photos: string[];
          place: string | null;
          points: number;
          ref_url: string | null;
          review_stars: number | null;
          review_text: string | null;
          source: string;
          title: string;
          what_to_do: string;
          with_users: string[];
        }[];
        SetofOptions: {
          from: "*";
          to: "culture_exp_days";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      culture_quest: {
        Args: {
          p_action: string;
          p_card?: string;
          p_choice?: number;
          p_code?: string;
          p_item?: string;
          p_session?: string;
          p_teams?: number;
        };
        Returns: Json;
      };
      culture_quest_card: { Args: { p_session: string }; Returns: string };
      culture_quest_previews: {
        Args: Record<PropertyKey, never>;
        Returns: {
          category: string;
          city: string;
          country: string;
          creator_id: string;
          id: string;
          is_public: boolean;
          partner_id: string;
          photo_path: string;
          quest_length: string;
          region: string;
          title: string;
          trip_id: string;
        }[];
      };
      culture_quest_stats: { Args: { p_card: string }; Returns: Json };
      culture_shared: {
        Args: { p_scope?: string };
        Returns: {
          avatar_seed: string;
          avatar_style: string;
          city: string;
          country: string;
          creator_name: string;
          days: number;
          finished_at: string;
          id: string;
          liked: boolean;
          likes: number;
          mine: boolean;
          region: string;
          summary: string;
          title: string;
          track: string;
          visibility: string;
        }[];
      };
      culture_showcase: {
        Args: { p?: Json; p_action: string; p_code?: string; p_exp?: string };
        Returns: Json;
      };
      culture_switch_group: {
        Args: { p_exp: string; p_format: string; p_trip: string };
        Returns: undefined;
      };
      day_vote_results: {
        Args: { p_date: string; p_trip: string };
        Returns: {
          choice_id: string;
          kind: string;
          votes: number;
        }[];
      };
      decide_room_request: {
        Args: { p_action: string; p_note: string; p_request: string };
        Returns: undefined;
      };
      delete_cost_item: { Args: { p_item: string }; Returns: undefined };
      delete_push_subscription: { Args: { p_endpoint: string }; Returns: undefined };
      delete_trip: { Args: { p_name: string; p_trip: string }; Returns: undefined };
      discard_trip_draft: { Args: Record<PropertyKey, never>; Returns: undefined };
      dismiss_bug_update: { Args: { p_report: string }; Returns: undefined };
      dismiss_cost_note: { Args: { p_note: string }; Returns: undefined };
      draw_game_card: { Args: { p_category: string; p_trip: string }; Returns: number };
      edit_trip: {
        Args: {
          p_destination: string;
          p_end_date: string;
          p_name: string;
          p_start_date: string;
          p_trip: string;
        };
        Returns: undefined;
      };
      edit_trip_day: {
        Args: { p_bingo: Json; p_date: string; p_quests: Json; p_theme: string; p_trip: string };
        Returns: undefined;
      };
      end_trip: { Args: { p_trip: string }; Returns: undefined };
      extend_draw_timer: { Args: { p_trip: string }; Returns: number };
      finalize_season: { Args: { p_season: string; p_trip: string }; Returns: undefined };
      finish_notifications: { Args: { p_results: Json }; Returns: number };
      finish_photo_purge: { Args: { p_removed: number; p_trip: string }; Returns: number };
      founder_age_tiers: {
        Args: Record<PropertyKey, never>;
        Returns: {
          people: number;
          tier: string;
        }[];
      };
      founder_bug_reports: {
        Args: Record<PropertyKey, never>;
        Returns: {
          app_version: string;
          created_at: string;
          description: string;
          founder_note: string;
          id: string;
          issue_count: number;
          issue_id: string;
          issue_title: string;
          page: string;
          reporter: string;
          screenshot_path: string;
          status: string;
          trip_id: string;
          trip_name: string;
          user_agent: string;
        }[];
      };
      founder_checkins: {
        Args: Record<PropertyKey, never>;
        Returns: {
          answers: Json;
          context: string;
          context_key: string;
          created_at: string;
          id: string;
          reporter: string;
          trip_name: string;
        }[];
      };
      founder_link_report: {
        Args: { p_issue: string; p_report: string; p_title: string };
        Returns: string;
      };
      founder_open_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          issue_id: string;
          last_at: string;
          page: string;
          people: number;
          reports: number;
          status: string;
          title: string;
        }[];
      };
      founder_trips: {
        Args: Record<PropertyKey, never>;
        Returns: {
          captain: string;
          created_at: string;
          id: string;
          is_sandbox: boolean;
          kind: string;
          name: string;
          rules_version: number;
          start_date: string;
        }[];
      };
      founder_update_report: {
        Args: { p_note: string; p_report: string; p_status: string };
        Returns: undefined;
      };
      founding_member: { Args: { p_user: string }; Returns: boolean };
      game_board: {
        Args: { p_trip: string };
        Returns: {
          attended: number;
          mx: number;
          pen: number;
          score: number;
          stamps: number;
          user_id: string;
        }[];
      };
      game_card_view: {
        Args: { p_category?: string; p_trip: string };
        Returns: {
          answer: string;
          category: string;
          created_at: string;
          game_number: number;
          id: number;
          prompt: string;
          trip_id: string;
          updated_at: string;
        }[];
      };
      game_day_status: { Args: { p_date: string; p_trip: string }; Returns: string };
      game_name_available: { Args: { p_name: string }; Returns: string };
      game_rooms: {
        Args: Record<PropertyKey, never>;
        Returns: {
          city: string;
          country: string;
          crowns: Json;
          ended: boolean;
          is_member: boolean;
          leaders: Json;
          nickname: string;
          nights_played: number;
          region: string;
          requested: boolean;
          trip_id: string;
        }[];
      };
      games_live: { Args: { p_trip: string }; Returns: boolean };
      guide_propose: {
        Args: { p_body: string; p_kind: string; p_photo?: string; p_trip: string };
        Returns: string;
      };
      guide_publish: { Args: { p_on: boolean; p_trip: string }; Returns: undefined };
      guide_review: { Args: { p_action: string; p_item: string }; Returns: undefined };
      heart_photo: { Args: { p_on?: boolean; p_proof: string; p_trip: string }; Returns: boolean };
      hide_inspiration: { Args: { p_card: string }; Returns: undefined };
      home_day_action: {
        Args: { p_action: string; p_choice?: number; p_session: string };
        Returns: undefined;
      };
      home_day_schedule: {
        Args: { p_all?: boolean; p_day: string; p_time: string; p_trip: string };
        Returns: undefined;
      };
      home_day_scores: {
        Args: { p_trip: string };
        Returns: {
          points: number;
          user_id: string;
        }[];
      };
      home_day_view: { Args: { p_trip: string }; Returns: Json };
      host_check_in: { Args: { p_trip: string; p_week: number }; Returns: undefined };
      is_app_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_trip_member: { Args: { p_trip: string; p_user: string }; Returns: boolean };
      join_trip: { Args: { p_code: string }; Returns: string };
      join_waitlist: { Args: { p_email: string }; Returns: undefined };
      journal_options: {
        Args: { p_item: string };
        Returns: {
          idx: number;
          prompt: string;
        }[];
      };
      junkie_rank: {
        Args: { p_user: string };
        Returns: {
          next_at: number;
          next_tier: string;
          passport_junkie: boolean;
          points: number;
          tier: string;
          tier_at: number;
        }[];
      };
      lab_as: { Args: { p_action: string; p_trip: string }; Returns: string };
      lab_at_home: { Args: { p_length: string; p_pack: string }; Returns: string };
      lab_at_home_bots: { Args: { p_trip: string }; Returns: string };
      lab_create: { Args: { p_days: number; p_size: number; p_window: number }; Returns: string };
      lab_delete: { Args: { p_trip: string }; Returns: string[] };
      lab_engine_create: {
        Args: { p_days: number; p_mode: string; p_room: string; p_size: number };
        Returns: string;
      };
      lab_engine_play: { Args: { p_trip: string }; Returns: string };
      lab_extra: { Args: { p_action: string; p_arg: string; p_trip: string }; Returns: string };
      lab_jump: { Args: { p_phase: string; p_trip: string }; Returns: string };
      lab_r17: { Args: { p_action: string; p_trip: string }; Returns: string };
      lab_role: { Args: { p_role: string; p_trip: string }; Returns: undefined };
      lab_shift: { Args: { p_day: number; p_target: string; p_trip: string }; Returns: undefined };
      lab_view: { Args: { p_trip: string; p_view: string }; Returns: string };
      leave_trip: { Args: { p_trip: string }; Returns: undefined };
      list_beta_codes: {
        Args: Record<PropertyKey, never>;
        Returns: {
          code: string;
          created_at: string;
          expires_at: string;
          note: string;
          revoked_at: string;
          status: string;
          used_at: string;
          used_by_name: string;
        }[];
      };
      list_waitlist: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          email: string;
        }[];
      };
      live_present: { Args: { p_presenter: string; p_session: string }; Returns: boolean };
      live_state: {
        Args: { p_session: string };
        Returns: {
          i_tapped: boolean;
          my_awards: string[];
          thumbs: number;
          user_id: string;
          won_awards: string[];
        }[];
      };
      live_vote_award: {
        Args: { p_award: string; p_nominee: string; p_session: string };
        Returns: undefined;
      };
      log_ai_call: {
        Args: { p_cost: number; p_in: number; p_model: string; p_out: number; p_usage: string };
        Returns: undefined;
      };
      manage_trip_member: {
        Args: { p_action: string; p_trip: string; p_user: string };
        Returns: undefined;
      };
      mark_arrived: { Args: { p_trip: string }; Returns: string };
      mark_badges_seen: { Args: Record<PropertyKey, never>; Returns: undefined };
      mark_bingo: {
        Args: { p_date: string; p_photo: string; p_square: number; p_trip: string };
        Returns: undefined;
      };
      member_age_ranges: {
        Args: { p_trip: string };
        Returns: {
          age_range: string;
          user_id: string;
        }[];
      };
      member_stamp_badges: {
        Args: { p_trip: string };
        Returns: {
          city: string;
          country: string;
          squad_count: number;
          stamp_count: number;
          stamped_on: string;
          state: string;
          trip_name: string;
          user_id: string;
        }[];
      };
      mission_action: {
        Args: {
          p_action: string;
          p_claim?: string;
          p_layover?: boolean;
          p_phase?: string;
          p_slot?: number;
          p_trip: string;
        };
        Returns: string;
      };
      mission_bonus: {
        Args: { p_trip: string };
        Returns: {
          points: number;
          user_id: string;
        }[];
      };
      mission_window: {
        Args: { p_trip: string };
        Returns: {
          closes_at: string;
          opens_at: string;
          proof_due_at: string;
        }[];
      };
      mix_ai_quota: { Args: { p_trip: string }; Returns: string };
      moderate_inspiration: { Args: { p_action: string; p_card: string }; Returns: undefined };
      moderate_photo: {
        Args: { p_action: string; p_id: string; p_note?: string };
        Returns: undefined;
      };
      moderation_queue: {
        Args: { p_include_closed?: boolean };
        Returns: {
          ai_flags: string[];
          body: string;
          challenge: string;
          created_at: string;
          has_minors: boolean;
          id: string;
          photo_path: string;
          proof_id: string;
          report_reasons: string[];
          reports: number;
          status: string;
          trip_id: string;
          trip_name: string;
          uploader_id: string;
          uploader_name: string;
        }[];
      };
      my_access: {
        Args: Record<PropertyKey, never>;
        Returns: {
          age_range: string;
          beta: boolean;
          has_dob: boolean;
          launch: boolean;
          no_alcohol: boolean;
        }[];
      };
      my_bug_updates: {
        Args: Record<PropertyKey, never>;
        Returns: {
          founder_note: string;
          id: string;
          page: string;
          status: string;
          status_changed_at: string;
        }[];
      };
      my_credits: {
        Args: { p_trip?: string };
        Returns: {
          trip_included: number;
          trip_remaining: number;
          wallet: number;
        }[];
      };
      my_lab_view: {
        Args: Record<PropertyKey, never>;
        Returns: {
          trip_id: string;
          view: string;
        }[];
      };
      my_mix_used: { Args: Record<PropertyKey, never>; Returns: number };
      my_notification_settings: {
        Args: Record<PropertyKey, never>;
        Returns: {
          email: boolean;
          label: string;
          push: boolean;
          quiet_end: string;
          quiet_start: string;
          type: string;
        }[];
      };
      my_passport: {
        Args: Record<PropertyKey, never>;
        Returns: {
          crowns: number;
          junkie: boolean;
          stamps: number;
          trip_id: string;
        }[];
      };
      my_passport_progress: { Args: Record<PropertyKey, never>; Returns: Json };
      my_past_trips: {
        Args: Record<PropertyKey, never>;
        Returns: {
          end_date: string;
          name: string;
          start_date: string;
          trip_id: string;
        }[];
      };
      my_preview_shared: { Args: { p_exp?: string; p_trip?: string }; Returns: boolean };
      my_schedule: {
        Args: { p_at?: string; p_trip: string };
        Returns: {
          body: string;
          choices: string[];
          closes_at: string;
          day: string;
          id: string;
          insight: string;
          is_open: boolean;
          items: string[];
          kind: string;
          opens_at: string;
          points: number;
          ref_id: string;
          slot: string;
          title: string;
          user_id: string;
          variant: string;
        }[];
      };
      my_stamps: {
        Args: Record<PropertyKey, never>;
        Returns: {
          city: string;
          country: string;
          crowns: string[];
          culture: string;
          has_postcard: boolean;
          kind: string;
          room: string;
          season_label: string;
          solo: boolean;
          squad_count: number;
          stamped_on: string;
          state: string;
          trip_id: string;
          trip_name: string;
        }[];
      };
      my_trip_feedback_done: { Args: { p_trip: string }; Returns: boolean };
      my_unlocked_trips: { Args: Record<PropertyKey, never>; Returns: number };
      my_waiting_trips: {
        Args: Record<PropertyKey, never>;
        Returns: {
          destination: string;
          name: string;
          trip_id: string;
        }[];
      };
      new_trip_code: { Args: Record<PropertyKey, never>; Returns: string };
      next_game_turn: { Args: { p_trip: string }; Returns: undefined };
      next_room_turn: { Args: { p_room: string; p_trip: string }; Returns: undefined };
      night_checkin_tasks: {
        Args: { p_trip: string; p_week: number };
        Returns: {
          id: string;
          mission_text: string;
          presented_at: string;
          title: string;
          user_id: string;
        }[];
      };
      night_flow_action: {
        Args: { p_action: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      night_format_action: {
        Args: { p_action: string; p_trip: string; p_value?: string; p_week: number };
        Returns: Json;
      };
      normalize_game_name: { Args: { p: string }; Returns: string };
      open_item: { Args: { p_item: string }; Returns: boolean };
      open_live: {
        Args: { p_call_night?: string; p_crowning?: boolean; p_trip: string };
        Returns: string;
      };
      order_quote: {
        Args: { p_trip: string };
        Returns: {
          amount_due_cents: number;
          discount_cents: number;
          discount_source: string;
          headcount: number;
          kind: string;
          label: string;
          list_cents: number;
          order_id: string;
          paid: boolean;
          tier: string;
          upgrade_cents: number;
        }[];
      };
      orphan_files: {
        Args: { p_limit?: number };
        Returns: {
          bucket: string;
          path: string;
        }[];
      };
      passport_collection: {
        Args: Record<PropertyKey, never>;
        Returns: {
          city: string;
          country: string;
          destination: string;
          kind: string;
          squad_count: number;
          stamped_on: string;
          start_date: string;
          state: string;
          trip_id: string;
          trip_name: string;
        }[];
      };
      pending_count: { Args: { p_trip: string }; Returns: number };
      pending_members: {
        Args: { p_trip: string };
        Returns: {
          age_range: string;
          avatar_seed: string;
          avatar_style: string;
          joined_at: string;
          name: string;
          user_id: string;
        }[];
      };
      photos_to_purge: {
        Args: { p_limit?: number };
        Returns: {
          bucket: string;
          path: string;
          trip_id: string;
        }[];
      };
      pick_at_home_song: { Args: { p_activity: string; p_user: string }; Returns: undefined };
      pick_night_game: {
        Args: { p_game: number; p_trip: string; p_week: number };
        Returns: undefined;
      };
      pick_postcard: {
        Args: { p_pick?: boolean; p_proof: string; p_trip: string };
        Returns: number;
      };
      pick_team: { Args: { p_team: string; p_trip: string }; Returns: undefined };
      plan_game_nights: {
        Args: {
          p_count?: number;
          p_every: number;
          p_plan: string;
          p_start: string;
          p_time: string;
          p_trip: string;
          p_weekday: number;
        };
        Returns: {
          kept: boolean;
          starts_at: string;
          week_number: number;
        }[];
      };
      player_card_read: { Args: { p_trip: string; p_user: string }; Returns: Json };
      player_profile: { Args: { p_trip?: string; p_user: string }; Returns: Json };
      post_game_night_poll: { Args: { p_options: Json; p_trip: string }; Returns: undefined };
      post_live_vote: {
        Args: { p_kind: string; p_options: Json; p_prompt: string; p_trip: string; p_week: number };
        Returns: string;
      };
      post_photo: { Args: { p_date: string; p_photo: string; p_trip: string }; Returns: undefined };
      post_quest: {
        Args: { p_date: string; p_photo: string; p_quest: number; p_trip: string };
        Returns: undefined;
      };
      postcard_info: { Args: { p_trip: string }; Returns: Json };
      postcard_ranking: {
        Args: { p_trip: string };
        Returns: {
          favored: boolean;
          hearts: number;
          kept: boolean;
          kept_count: number;
          photo_path: string;
          pos: number;
          proof_id: string;
          swap_used: boolean;
          swapped_in: boolean;
          swapped_out: boolean;
          tied: boolean;
          user_id: string;
        }[];
      };
      present_checkin: {
        Args: { p_claim: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      preview_action: {
        Args: { p_action: string; p_preview: string; p_reason?: string };
        Returns: undefined;
      };
      preview_culture_link: { Args: { p_preview: string }; Returns: string };
      preview_ten_day_drops: {
        Args: { p_trip: string };
        Returns: {
          cutoff: string;
          drop_at: string;
          drop_no: number;
        }[];
      };
      price_list: {
        Args: Record<PropertyKey, never>;
        Returns: {
          beta_free: boolean;
          cents: number;
          key: string;
          label: string;
        }[];
      };
      proof_challenge: {
        Args: { p_proof: string };
        Returns: {
          challenge: string;
          needs_verdict: boolean;
          trip_id: string;
          user_id: string;
        }[];
      };
      public_guide: {
        Args: { p_token: string };
        Returns: {
          author: string;
          body: string;
          day: string;
          end_date: string;
          kind: string;
          photo_path: string;
          place: string;
          prompt: string;
          room: string;
          start_date: string;
          title: string;
        }[];
      };
      public_inspiration_queue: {
        Args: Record<PropertyKey, never>;
        Returns: {
          approved: boolean;
          category: string;
          city: string;
          country: string;
          created_at: string;
          id: string;
          region: string;
          title: string;
        }[];
      };
      public_launch: { Args: Record<PropertyKey, never>; Returns: boolean };
      publish_guide: { Args: { p_publish: boolean; p_trip: string }; Returns: string };
      qotw_action: {
        Args: { p_action: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      qotw_answers: {
        Args: { p_trip: string; p_week: number };
        Returns: {
          answer: string;
          emoji: string;
          idx: number;
          mine: boolean;
          user_id: string;
          votes: number;
        }[];
      };
      quest_review: { Args: { p_action: string; p_post: string }; Returns: undefined };
      queue_test_notification: { Args: Record<PropertyKey, never>; Returns: string };
      quick_vote_action: {
        Args: { p_action: string; p_trip: string; p_vote?: string };
        Returns: string;
      };
      quick_vote_totals: {
        Args: { p_vote: string };
        Returns: {
          cleared: number;
          grounded: number;
        }[];
      };
      rate_content: {
        Args: { p_key: string; p_kind: string; p_text: string; p_trip: string; p_vote: number };
        Returns: undefined;
      };
      reclaim_captain: { Args: { p_trip: string }; Returns: undefined };
      record_photo_safety: { Args: { p_flags: string[]; p_proof: string }; Returns: boolean };
      record_proof_check: {
        Args: { p_flags?: Json; p_proof: string; p_reason: string; p_verdict: string };
        Returns: undefined;
      };
      record_user_block: {
        Args: { p_admin: string; p_disabled: boolean; p_note: string; p_user: string };
        Returns: undefined;
      };
      redeem_beta_code: { Args: { p_code: string }; Returns: string };
      refund_failed_ai:
        | { Args: { p_usage: string }; Returns: boolean }
        | { Args: { p_usage: string; p_user: string }; Returns: boolean };
      release_trip_day: { Args: { p_date: string; p_trip: string }; Returns: undefined };
      remove_photo: { Args: { p_path: string; p_trip: string }; Returns: undefined };
      reopen_live: { Args: { p_session: string }; Returns: undefined };
      report_cost_payment: {
        Args: { p_amount_cents: number; p_item: string; p_note: string };
        Returns: undefined;
      };
      report_proof_photo: { Args: { p_proof: string; p_reason?: string }; Returns: undefined };
      request_host_swap: {
        Args: { p_to: string; p_trip: string; p_week: number };
        Returns: string;
      };
      request_room: { Args: { p_interest: string; p_trip: string }; Returns: undefined };
      reschedule_preview: {
        Args: { p_count: number; p_every: number; p_trip: string };
        Returns: {
          played: boolean;
          starts_at: string;
          week_number: number;
        }[];
      };
      reset_trip_code: { Args: { p_trip: string }; Returns: string };
      resolve_age_guesses: {
        Args: { p_answer: number; p_trip: string; p_week: number };
        Returns: number;
      };
      respin_game: {
        Args: { p_trip: string };
        Returns: {
          game_number: number;
          spin_time: string;
          week_number: number;
        }[];
      };
      respond_host_swap: { Args: { p_action: string; p_swap: string }; Returns: undefined };
      reveal_inspiration_votes: { Args: { p_card: string }; Returns: undefined };
      reveal_live_vote: { Args: { p_vote: string }; Returns: undefined };
      reveal_mission: { Args: { p_date: string; p_trip: string }; Returns: undefined };
      reveal_weekly_question: { Args: { p_trip: string; p_week: number }; Returns: undefined };
      revoke_beta_code: { Args: { p_code: string }; Returns: undefined };
      room_requests_for: {
        Args: { p_trip: string };
        Returns: {
          created_at: string;
          expires_at: string;
          founding: boolean;
          home_city: string;
          id: string;
          interest: string;
          level: number;
          name: string;
          stamps: number;
        }[];
      };
      save_cost_item: {
        Args: {
          p_category: string;
          p_custom: string;
          p_due: string;
          p_estimate: boolean;
          p_item: string;
          p_shares: Json;
          p_split: string;
          p_title: string;
          p_total_cents: number;
          p_trip: string;
        };
        Returns: string;
      };
      save_game_scores: {
        Args: { p_rows: Json; p_trip: string; p_week: number };
        Returns: undefined;
      };
      save_push_subscription: {
        Args: { p_auth: string; p_endpoint: string; p_p256dh: string; p_user_agent?: string };
        Returns: undefined;
      };
      save_teams: { Args: { p_teams: Json; p_trip: string }; Returns: undefined };
      save_trip_draft: { Args: { p_data: Json }; Returns: undefined };
      sealed_proof_feed: {
        Args: { p_trip: string };
        Returns: {
          drop_no: number;
          id: string;
          kind: string;
          proof_mode: string;
          proof_path: string;
          speed: boolean;
          state: string;
          submitted_at: string;
          title: string;
          user_id: string;
          value: number;
        }[];
      };
      sealed_quest_action: {
        Args: {
          p_action: string;
          p_mode?: string;
          p_path?: string;
          p_quest: string;
          p_shared?: boolean;
        };
        Returns: undefined;
      };
      sealed_quest_state: {
        Args: { p_trip: string };
        Returns: {
          backstory: string;
          cutoff: string;
          destroy_at: string;
          drop_at: string;
          drop_no: number;
          id: string;
          keywords: string[];
          kind: string;
          meetup_at: string;
          mission_text: string;
          open_by: string;
          opened_at: string;
          points: number;
          proof_mode: string;
          proof_shared: boolean;
          state: string;
          submitted_at: string;
          title: string;
          value: number;
        }[];
      };
      season_game_decline: { Args: { p_find: string }; Returns: undefined };
      season_game_reveal: { Args: { p_date: string; p_trip: string }; Returns: string };
      season_game_submit: {
        Args: { p_date: string; p_path: string; p_slot: number; p_trip: string };
        Returns: undefined;
      };
      season_info: {
        Args: { p_trip: string };
        Returns: {
          crowning_at: string;
          crowning_label: string;
          crowning_mode: string;
          prize: string;
          prize_note: string;
          revealed: boolean;
          season: string;
          takeoff_week: number;
          winners: number;
        }[];
      };
      season_points: {
        Args: { p_season: string; p_trip: string };
        Returns: {
          games: number;
          legacy: number;
          other: number;
          quests: number;
          showcase: number;
          total: number;
          user_id: string;
        }[];
      };
      season_quest_action: {
        Args: { p_action: string; p_quest: string; p_trip: string };
        Returns: undefined;
      };
      season_quest_approve_all: { Args: { p_trip: string }; Returns: number };
      season_quest_current: {
        Args: { p_trip: string };
        Returns: {
          backstory: string;
          completed: number;
          id: string;
          keywords: string[];
          kind: string;
          mission_text: string;
          night_week: number;
          place: string;
          points: number;
          starts_at: string;
          status: string;
          title: string;
          total: number;
          user_id: string;
        }[];
      };
      season_quest_review: {
        Args: { p_trip: string };
        Returns: {
          id: string;
          kind: string;
          points: number;
          status: string;
          title: string;
          user_id: string;
        }[];
      };
      season_timing: {
        Args: { p_trip: string };
        Returns: {
          cutoff: string;
          drop_count: number;
          finale_at: string;
          mode: string;
          preflight_start: string;
          reveal_at: string;
        }[];
      };
      seat_status: {
        Args: { p_trip: string };
        Returns: {
          cap: number;
          extra_seats: boolean;
          is_window: boolean;
          used: number;
        }[];
      };
      set_activity_timer: {
        Args: { p_label: string; p_secs: number; p_trip: string };
        Returns: undefined;
      };
      set_adult_cards: { Args: { p_enabled: boolean; p_trip: string }; Returns: undefined };
      set_ai_guard: {
        Args: { p_enabled: boolean; p_global_cap: number; p_user_cap: number };
        Returns: undefined;
      };
      set_bingo_needs_photo: { Args: { p_required: boolean; p_trip: string }; Returns: undefined };
      set_boarding_tile: { Args: { p_tile: string }; Returns: undefined };
      set_call_nights: { Args: { p_nights: Json; p_trip: string }; Returns: number };
      set_carry_on_meetup: {
        Args: { p_at: string; p_place: string; p_trip: string };
        Returns: undefined;
      };
      set_crowning_night: {
        Args: { p_at: string; p_call_link: string; p_place: string; p_trip: string };
        Returns: undefined;
      };
      set_culture_finale: { Args: { p_exp: string; p_format: string }; Returns: undefined };
      set_culture_mode: {
        Args: { p_exp: string; p_mode: string; p_types: string[]; p_vibe: string };
        Returns: undefined;
      };
      set_first_game: { Args: { p_game: number; p_trip: string }; Returns: undefined };
      set_founding_open: { Args: { p_open: boolean }; Returns: undefined };
      set_game_days: {
        Args: { p_every: number; p_rest: string[]; p_surprise: boolean; p_trip: string };
        Returns: undefined;
      };
      set_game_night_host: {
        Args: { p_host: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      set_game_night_place: {
        Args: { p_place: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      set_guide_prefs: {
        Args: { p_share_photos: boolean; p_show_name: boolean; p_trip: string };
        Returns: undefined;
      };
      set_home_day_place: {
        Args: { p_day: string; p_place: string; p_trip: string };
        Returns: undefined;
      };
      set_home_ready_start: { Args: { p_start: string; p_trip: string }; Returns: undefined };
      set_join_controls: {
        Args: { p_locked: boolean; p_max: number; p_trip: string };
        Returns: undefined;
      };
      set_my_dob: { Args: { p_agree: boolean; p_dob: string }; Returns: string };
      set_night_skipped: {
        Args: { p_skipped: boolean; p_trip: string; p_week: number };
        Returns: undefined;
      };
      set_no_alcohol: { Args: { p_on: boolean }; Returns: undefined };
      set_notification_pref: {
        Args: { p_email: boolean; p_push: boolean; p_type: string };
        Returns: undefined;
      };
      set_passport_destination: {
        Args: { p_city: string; p_country: string; p_state: string; p_trip: string };
        Returns: undefined;
      };
      set_pay_note: { Args: { p_note: string; p_trip: string }; Returns: undefined };
      set_preflight: {
        Args: { p_days: number; p_skipped: boolean; p_trip: string };
        Returns: undefined;
      };
      set_preflight_a2c: {
        Args: { p_start: string; p_time: string; p_trip: string; p_weekday: number };
        Returns: number;
      };
      set_preflight_start: {
        Args: {
          p_count?: number;
          p_every: number;
          p_plan: string;
          p_start: string;
          p_time: string;
          p_trip: string;
          p_weekday: number;
        };
        Returns: number;
      };
      set_price_rule: { Args: { p_cents: number; p_key: string }; Returns: undefined };
      set_profile: {
        Args: { p_about: string; p_from?: string; p_public: boolean };
        Returns: undefined;
      };
      set_public_launch: { Args: { p_on: boolean }; Returns: undefined };
      set_public_leaderboard: { Args: { p_public: boolean }; Returns: boolean };
      set_quiet_hours: { Args: { p_end: string; p_start: string }; Returns: undefined };
      set_room_listing: {
        Args: {
          p_city: string;
          p_country: string;
          p_listed: boolean;
          p_nickname: string;
          p_region: string;
          p_trip: string;
        };
        Returns: undefined;
      };
      set_season: {
        Args: {
          p_crowning_at: string;
          p_label: string;
          p_mode: string;
          p_note: string;
          p_prize: string;
          p_season: string;
          p_trip: string;
          p_winners: number;
        };
        Returns: undefined;
      };
      set_song_disc: {
        Args: { p_artist: string; p_title: string; p_trip: string };
        Returns: undefined;
      };
      set_stamp_values: {
        Args: { p_here: number; p_host: number; p_trip: string; p_win: number };
        Returns: undefined;
      };
      set_team_mode: { Args: { p_caps: Json; p_mode: string; p_trip: string }; Returns: undefined };
      set_team_room: {
        Args: { p_call: string; p_host: string; p_team: string; p_trip: string };
        Returns: undefined;
      };
      set_teen_dob: {
        Args: { p_agree: boolean; p_dob: string; p_invite: string };
        Returns: string;
      };
      set_top_stamps: { Args: { p_trips: string[] }; Returns: undefined };
      set_trip_access: {
        Args: { p_code_enabled: boolean; p_require_approval: boolean; p_trip: string };
        Returns: undefined;
      };
      set_trip_archived: {
        Args: { p_archived: boolean; p_note: string; p_trip: string };
        Returns: undefined;
      };
      set_trip_extras: {
        Args: { p_backup: string; p_call: string; p_motto: string; p_trip: string };
        Returns: undefined;
      };
      set_trip_hidden: { Args: { p_hidden?: boolean; p_trip: string }; Returns: undefined };
      set_trip_minors: { Args: { p_has: boolean; p_trip: string }; Returns: undefined };
      set_trip_timezone: { Args: { p_trip: string; p_tz: string }; Returns: undefined };
      set_trip_vibe: { Args: { p_trip: string; p_vibe: string }; Returns: undefined };
      set_weekly_question: {
        Args: { p_prompt: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      set_welcome_copy: { Args: { p_faq: Json; p_intro: string }; Returns: undefined };
      set_wheels_up: {
        Args: { p_date: string; p_time: string; p_trip: string };
        Returns: undefined;
      };
      set_window_prep: { Args: { p_days: number; p_exp: string }; Returns: undefined };
      share_preview: {
        Args: { p_exp?: string; p_on?: boolean; p_trip?: string };
        Returns: boolean;
      };
      share_trip_quest: { Args: { p_item: string; p_shared: boolean }; Returns: undefined };
      shuffle_teams: { Args: { p_trip: string }; Returns: number };
      skip_card: { Args: { p_category: string; p_trip: string }; Returns: number };
      skip_limit: { Args: { p_trip: string }; Returns: number };
      solo_action: { Args: { p?: Json; p_action: string; p_exp: string }; Returns: Json };
      solo_goal: { Args: { p_season: string; p_trip: string }; Returns: number };
      spend_ai_credits: { Args: { p_action: string; p_trip: string }; Returns: string };
      spin_next_game: {
        Args: { p_trip: string };
        Returns: {
          game_number: number;
          spin_time: string;
          week_number: number;
        }[];
      };
      start_game_turns: {
        Args: { p_cards: number; p_random: boolean; p_trip: string; p_week: number };
        Returns: undefined;
      };
      step_down: { Args: { p_to: string; p_trip: string }; Returns: undefined };
      submit_checkin: {
        Args: { p_answers: Json; p_context: string; p_key: string; p_trip: string };
        Returns: undefined;
      };
      submit_drop_proof: {
        Args: { p_body?: string; p_item: string; p_part?: number; p_photo_path?: string };
        Returns: string;
      };
      submit_proof: {
        Args: { p_body?: string; p_item: string; p_photo_path?: string };
        Returns: string;
      };
      submit_trip_feedback: {
        Args: {
          p_change: string;
          p_favorite: string;
          p_message: string;
          p_score: number;
          p_skipped: boolean;
          p_trip: string;
        };
        Returns: undefined;
      };
      surprise_night_game: { Args: { p_trip: string; p_week: number }; Returns: number };
      swap_postcard_photo: {
        Args: { p_in: string; p_out: string; p_trip: string };
        Returns: undefined;
      };
      take_over_captain: { Args: { p_trip: string }; Returns: undefined };
      team_capacities: {
        Args: { p_trip: string };
        Returns: {
          capacity: number;
          taken: number;
          team_id: string;
        }[];
      };
      thumb_quest: { Args: { p_post: string }; Returns: undefined };
      touch_last_seen: { Args: Record<PropertyKey, never>; Returns: undefined };
      traveler_level: {
        Args: { p_user: string };
        Returns: {
          international_trips: number;
          level: string;
          real_trips: number;
        }[];
      };
      trip_guide: {
        Args: { p_trip: string };
        Returns: {
          author: string;
          body: string;
          day: string;
          kind: string;
          photo_path: string;
          prompt: string;
          user_id: string;
        }[];
      };
      trip_invite_preview: {
        Args: { p_code: string };
        Returns: {
          captain_avatar_url: string;
          captain_name: string;
          captain_seed: string;
          captain_style: string;
          destination: string;
          end_date: string;
          member_count: number;
          motto: string;
          name: string;
          start_date: string;
        }[];
      };
      trip_peek: { Args: { p_trip: string }; Returns: Json };
      trip_phase: {
        Args: { p_at?: string; p_trip: string };
        Returns: {
          day_index: number;
          phase: string;
          phase_ends_at: string;
          phase_starts_at: string;
          tz: string;
        }[];
      };
      trip_photos: {
        Args: { p_trip: string };
        Returns: {
          created_at: string;
          day_date: string;
          photo_path: string;
          source: string;
          user_id: string;
        }[];
      };
      trip_pot: { Args: { p_trip: string }; Returns: Json };
      trip_price: {
        Args: { p_headcount: number; p_trip: string };
        Returns: {
          addon_cents: number;
          base_cents: number;
          days: number;
          headcount: number;
          total_cents: number;
          unlocked: boolean;
        }[];
      };
      trip_roster: {
        Args: { p_trip: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          joined_at: string;
          role: string;
          user_id: string;
        }[];
      };
      trip_season: {
        Args: { p_trip: string };
        Returns: {
          max_stamps: number;
          stamps: number;
          today_stamps: number;
          user_id: string;
        }[];
      };
      trip_season_score: {
        Args: { p_trip: string };
        Returns: {
          carry_on: number;
          max_stamps: number;
          score: number;
          stamps: number;
          today_stamps: number;
          user_id: string;
        }[];
      };
      trip_season_started: { Args: { p_trip: string }; Returns: boolean };
      trip_squad_messages: {
        Args: { p_trip: string };
        Returns: {
          message: string;
          user_id: string;
        }[];
      };
      trip_standings: {
        Args: { p_season: string; p_trip: string };
        Returns: {
          last_earned_at: string;
          points: number;
          rank: number;
          showcase_points: number;
          user_id: string;
        }[];
      };
      undo_cost_payment: {
        Args: { p_amount_cents: number; p_item: string; p_reason: string; p_user: string };
        Returns: undefined;
      };
      unlock_big_group: { Args: { p_trip: string }; Returns: undefined };
      unlock_extra_seats: { Args: { p_trip: string }; Returns: undefined };
      unlock_trip: { Args: { p_headcount: number; p_trip: string }; Returns: undefined };
      use_ai_quota: { Args: { p_kind: string; p_trip: string }; Returns: string };
      use_captain_pass: { Args: { p_trip: string; p_week: number }; Returns: undefined };
      use_host_pass: { Args: { p_trip: string; p_week: number }; Returns: undefined };
      use_item_alternative: {
        Args: {
          p_alternative: string;
          p_date: string;
          p_group?: boolean;
          p_index: number;
          p_kind: string;
          p_trip: string;
        };
        Returns: undefined;
      };
      use_night_pass: { Args: { p_trip: string; p_week: number }; Returns: undefined };
      use_skip: {
        Args: { p_kind: string; p_new: string; p_ref: string; p_trip: string };
        Returns: string;
      };
      vote_mission: {
        Args: { p_caught: boolean; p_date: string; p_owner: string; p_trip: string };
        Returns: undefined;
      };
      vote_weekly_answer: {
        Args: { p_idx: number; p_trip: string; p_week: number };
        Returns: undefined;
      };
      week_game_action: {
        Args: { p_action: string; p_trip: string; p_week: number };
        Returns: undefined;
      };
      weekly_question_status: {
        Args: { p_trip: string };
        Returns: {
          answered: number;
          drops_at: string;
          my_vote: number;
          phase: string;
          players: number;
          prompt: string;
          read_index: number;
          revealed_at: string;
          source: string;
          starts_at: string;
          tie_ids: string[];
          tie_spin_at: string;
          votes: number;
          week_number: number;
          winner_id: string;
        }[];
      };
      welcome_copy: { Args: Record<PropertyKey, never>; Returns: Json };
      wrapup_board: {
        Args: { p_trip: string };
        Returns: {
          hearted: boolean;
          mine: boolean;
          photo_path: string;
          picked_at: string;
          proof_id: string;
          user_id: string;
        }[];
      };
      write_journal: {
        Args: { p_body: string; p_choice?: number; p_item: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
