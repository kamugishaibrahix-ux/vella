export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          app_language: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          app_language?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          app_language?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      vella_settings: {
        Row: {
          user_id: string;
          voice_model: string | null;
          tone: string | null;
          tone_style: string | null;
          relationship_mode: string | null;
          voice_hud: Json | null;
          language: string | null;
          privacy_flags: Json | null;
          privacy_anonymize: boolean | null;
          privacy_exclude_from_training: boolean | null;
          theme: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          voice_model?: string | null;
          tone?: string | null;
          tone_style?: string | null;
          relationship_mode?: string | null;
          voice_hud?: Json | null;
          language?: string | null;
          privacy_flags?: Json | null;
          privacy_anonymize?: boolean | null;
          privacy_exclude_from_training?: boolean | null;
          theme?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          voice_model?: string | null;
          tone?: string | null;
          tone_style?: string | null;
          relationship_mode?: string | null;
          voice_hud?: Json | null;
          language?: string | null;
          privacy_flags?: Json | null;
          privacy_anonymize?: boolean | null;
          privacy_exclude_from_training?: boolean | null;
          theme?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: string | null;
          status: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          monthly_token_allocation: number | null;
          monthly_token_allocation_used: number | null;
          token_balance: number | null;
          current_period_start: string | null;
          current_period_end: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan?: string | null;
          status?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          monthly_token_allocation?: number | null;
          monthly_token_allocation_used?: number | null;
          token_balance?: number | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan?: string | null;
          status?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          monthly_token_allocation?: number | null;
          monthly_token_allocation_used?: number | null;
          token_balance?: number | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      token_usage: {
        Row: {
          id: string;
          user_id: string;
          source: string;
          category: string | null;
          tokens: number;
          from_allocation: boolean;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          category?: string | null;
          tokens: number;
          from_allocation: boolean;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: string;
          category?: string | null;
          tokens?: number;
          from_allocation?: boolean;
          created_at?: string | null;
        };
      };
      token_topups: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          tokens: number;
          stripe_payment_intent_id: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          tokens: number;
          stripe_payment_intent_id?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          tokens?: number;
          stripe_payment_intent_id?: string | null;
          created_at?: string | null;
        };
      };
      token_rates: {
        Row: {
          id: string;
          event: string;
          cost: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          event: string;
          cost: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          event?: string;
          cost?: number;
          created_at?: string | null;
        };
      };
      user_preferences: {
        Row: {
          user_id: string;
          notifications_enabled: boolean | null;
          daily_checkin: boolean | null;
          journaling_prompts: boolean | null;
          created_at: string | null;
        };
        Insert: {
          user_id: string;
          notifications_enabled?: boolean | null;
          daily_checkin?: boolean | null;
          journaling_prompts?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          user_id?: string;
          notifications_enabled?: boolean | null;
          daily_checkin?: boolean | null;
          journaling_prompts?: boolean | null;
          created_at?: string | null;
        };
      };
      user_traits: {
        Row: {
          user_id: string;
          resilience: number | null;
          clarity: number | null;
          discipline: number | null;
          emotional_stability: number | null;
          motivation: number | null;
          self_compassion: number | null;
          last_computed_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          resilience?: number | null;
          clarity?: number | null;
          discipline?: number | null;
          emotional_stability?: number | null;
          motivation?: number | null;
          self_compassion?: number | null;
          last_computed_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          resilience?: number | null;
          clarity?: number | null;
          discipline?: number | null;
          emotional_stability?: number | null;
          motivation?: number | null;
          self_compassion?: number | null;
          last_computed_at?: string | null;
          updated_at?: string | null;
        };
      };
      user_traits_history: {
        Row: {
          id: string;
          user_id: string;
          window_start: string;
          window_end: string;
          resilience: number | null;
          clarity: number | null;
          discipline: number | null;
          emotional_stability: number | null;
          motivation: number | null;
          self_compassion: number | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          window_start: string;
          window_end: string;
          resilience?: number | null;
          clarity?: number | null;
          discipline?: number | null;
          emotional_stability?: number | null;
          motivation?: number | null;
          self_compassion?: number | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          window_start?: string;
          window_end?: string;
          resilience?: number | null;
          clarity?: number | null;
          discipline?: number | null;
          emotional_stability?: number | null;
          motivation?: number | null;
          self_compassion?: number | null;
          created_at?: string | null;
        };
      };
      user_nudges: {
        Row: {
          id: string;
          user_id: string;
          nudge_type: string;
          status: string | null;
          last_triggered_at: string | null;
          dismissed_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          nudge_type: string;
          status?: string | null;
          last_triggered_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          nudge_type?: string;
          status?: string | null;
          last_triggered_at?: string | null;
          dismissed_at?: string | null;
          created_at?: string | null;
        };
      };
      checkins: {
        Row: {
          id: string;
          user_id: string;
          entry_date: string | null;
          created_at: string | null;
          mood: number | null;
          stress: number | null;
          energy: number | null;
          focus: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry_date?: string | null;
          created_at?: string | null;
          mood?: number | null;
          stress?: number | null;
          energy?: number | null;
          focus?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry_date?: string | null;
          created_at?: string | null;
          mood?: number | null;
          stress?: number | null;
          energy?: number | null;
          focus?: number | null;
        };
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          category: string | null;
          status: string | null;
          priority: number | null;
          target_date: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          category?: string | null;
          status?: string | null;
          priority?: number | null;
          target_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          category?: string | null;
          status?: string | null;
          priority?: number | null;
          target_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      user_goals: {
        Row: {
          id: number;
          user_id: string;
          type: string | null;
          status: string | null;
          priority: number | null;
          target_date: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          user_id: string;
          type?: string | null;
          status?: string | null;
          priority?: number | null;
          target_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          user_id?: string;
          type?: string | null;
          status?: string | null;
          priority?: number | null;
          target_date?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      user_goal_actions: {
        Row: {
          id: number;
          goal_id: number;
          user_id: string;
          label: string | null;
          status: string | null;
          due_date: string | null;
          completed_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          goal_id: number;
          user_id: string;
          label?: string | null;
          status?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          goal_id?: number;
          user_id?: string;
          label?: string | null;
          status?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      progress_metrics: {
        Row: {
          user_id: string;
          consistency_score: number | null;
          emotional_openness: number | null;
          improvement_score: number | null;
          stability_score: number | null;
          connection_index: number | null;
          data: Json | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          consistency_score?: number | null;
          emotional_openness?: number | null;
          improvement_score?: number | null;
          stability_score?: number | null;
          connection_index?: number | null;
          data?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          consistency_score?: number | null;
          emotional_openness?: number | null;
          improvement_score?: number | null;
          stability_score?: number | null;
          connection_index?: number | null;
          data?: Json | null;
          updated_at?: string | null;
        };
      };
      connection_depth: {
        Row: {
          user_id: string;
          depth_score: number | null;
          last_reciprocated: string | null;
          last_increase: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          depth_score?: number | null;
          last_reciprocated?: string | null;
          last_increase?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          depth_score?: number | null;
          last_reciprocated?: string | null;
          last_increase?: string | null;
          updated_at?: string | null;
        };
      };
      last_active: {
        Row: {
          user_id: string;
          last_active: string | null;
          last_active_at: string | null;
          platform: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          last_active?: string | null;
          last_active_at?: string | null;
          platform?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          last_active?: string | null;
          last_active_at?: string | null;
          platform?: string | null;
          updated_at?: string | null;
        };
      };
      social_models: {
        Row: {
          user_id: string;
          model: Json | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          model?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          model?: Json | null;
          updated_at?: string | null;
        };
      };
      vella_personality: {
        Row: {
          user_id: string;
          traits: Json | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          traits?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          traits?: Json | null;
          updated_at?: string | null;
        };
      };
      micro_rag_cache: {
        Row: {
          id: string;
          user_id: string;
          cache_key: string;
          data: Json | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          cache_key: string;
          data?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          cache_key?: string;
          data?: Json | null;
          updated_at?: string | null;
        };
      };
      achievements: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          earned_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          earned_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          earned_at?: string | null;
          created_at?: string | null;
        };
      };
      admin_user_flags: {
        Row: {
          user_id: string;
          suspended: boolean;
          suspended_at: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          suspended?: boolean;
          suspended_at?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          suspended?: boolean;
          suspended_at?: string | null;
          updated_at?: string;
        };
      };
      decisions: {
        Row: {
          id: string;
          user_id: string;
          confidence_score: number | null;
          emotional_intensity: number | null;
          recorded_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          confidence_score?: number | null;
          emotional_intensity?: number | null;
          recorded_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          confidence_score?: number | null;
          emotional_intensity?: number | null;
          recorded_at?: string | null;
        };
      };
      decision_outcomes: {
        Row: {
          id: string;
          decision_id: string;
          user_id: string;
          outcome_rating: number | null;
          regret_score: number | null;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          decision_id: string;
          user_id: string;
          outcome_rating?: number | null;
          regret_score?: number | null;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          decision_id?: string;
          user_id?: string;
          outcome_rating?: number | null;
          regret_score?: number | null;
          reviewed_at?: string | null;
        };
      };
      feedback: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          rating: number;
          channel: string;
          category: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          rating: number;
          channel: string;
          category?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          rating?: number;
          channel?: string;
          category?: string | null;
          created_at?: string;
        };
      };
      financial_entries: {
        Row: {
          id: string;
          user_id: string;
          amount: number | null;
          category: string | null;
          behavior_flag: string | null;
          recorded_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount?: number | null;
          category?: string | null;
          behavior_flag?: string | null;
          recorded_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number | null;
          category?: string | null;
          behavior_flag?: string | null;
          recorded_at?: string | null;
        };
      };
      health_metrics: {
        Row: {
          id: string;
          user_id: string;
          sleep_hours: number | null;
          sleep_quality: number | null;
          exercise_minutes: number | null;
          recovery_score: number | null;
          energy_level: number | null;
          recorded_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          sleep_hours?: number | null;
          sleep_quality?: number | null;
          exercise_minutes?: number | null;
          recovery_score?: number | null;
          energy_level?: number | null;
          recorded_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          sleep_hours?: number | null;
          sleep_quality?: number | null;
          exercise_minutes?: number | null;
          recovery_score?: number | null;
          energy_level?: number | null;
          recorded_at?: string | null;
        };
      };
      memory_clusters: {
        Row: {
          id: string;
          user_id: string;
          is_active: boolean;
          updated_at: string;
          time_range_start?: string | null;
          time_range_end?: string | null;
          summary_hash?: string | null;
          summary_token_estimate?: number | null;
          member_chunk_hashes?: string[] | null;
          member_count?: number | null;
          cohesion_score?: number | null;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          cluster_key?: string | null;
          dominant_theme?: string | null;
          secondary_themes?: string[] | null;
          tier?: string | null;
          created_at?: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          is_active?: boolean;
          updated_at?: string;
          time_range_start?: string | null;
          time_range_end?: string | null;
          summary_hash?: string | null;
          summary_token_estimate?: number | null;
          member_chunk_hashes?: string[] | null;
          member_count?: number | null;
          cohesion_score?: number | null;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          cluster_key?: string | null;
          dominant_theme?: string | null;
          secondary_themes?: string[] | null;
          tier?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          is_active?: boolean;
          updated_at?: string;
          time_range_start?: string | null;
          time_range_end?: string | null;
          summary_hash?: string | null;
          summary_token_estimate?: number | null;
          member_chunk_hashes?: string[] | null;
          member_count?: number | null;
          cohesion_score?: number | null;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          cluster_key?: string | null;
          dominant_theme?: string | null;
          secondary_themes?: string[] | null;
          tier?: string | null;
          created_at?: string | null;
        };
      };
      memory_snapshots: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          period_start?: string | null;
          period_end?: string | null;
          summary_hash?: string | null;
          summary_token_estimate?: number | null;
          source_chunk_count?: number | null;
          source_chunk_hashes?: string[] | null;
          dominant_themes?: string[] | null;
          emotional_tone?: string | null;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          tier?: string | null;
          updated_at?: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          period_start?: string | null;
          period_end?: string | null;
          summary_hash?: string | null;
          summary_token_estimate?: number | null;
          source_chunk_count?: number | null;
          source_chunk_hashes?: string[] | null;
          dominant_themes?: string[] | null;
          emotional_tone?: string | null;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          tier?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          period_start?: string | null;
          period_end?: string | null;
          summary_hash?: string | null;
          summary_token_estimate?: number | null;
          source_chunk_count?: number | null;
          source_chunk_hashes?: string[] | null;
          dominant_themes?: string[] | null;
          emotional_tone?: string | null;
          embedding?: number[] | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          tier?: string | null;
          updated_at?: string | null;
        };
      };
      user_reports: {
        Row: {
          id: string;
          user_id: string;
          reported_by: string | null;
          type: string;
          severity: string;
          status: string;
          summary: string;
          notes: string | null;
          assignee: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          reported_by?: string | null;
          type: string;
          severity: string;
          status?: string;
          summary: string;
          notes?: string | null;
          assignee?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          reported_by?: string | null;
          type?: string;
          severity?: string;
          status?: string;
          summary?: string;
          notes?: string | null;
          assignee?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      webhook_events: {
        Row: {
          id: string;
          event_id: string;
          event_type: string;
          processed_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_type: string;
          processed_at: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_type?: string;
          processed_at?: string;
        };
      };
      behavioural_state_current: {
        Row: {
          user_id: string;
          version: number;
          state_json: Json;
          last_computed_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          version?: number;
          state_json?: Json;
          last_computed_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          version?: number;
          state_json?: Json;
          last_computed_at?: string;
          updated_at?: string;
        };
      };
      behavioural_state_history: {
        Row: {
          id: string;
          user_id: string;
          version: number;
          snapshot_type: string;
          state_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          version: number;
          snapshot_type: string;
          state_json: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          version?: number;
          snapshot_type?: string;
          state_json?: Json;
          created_at?: string;
        };
      };
      behaviour_events: {
        Row: {
          id: string;
          user_id: string;
          event_type: string;
          occurred_at: string;
          commitment_id: string | null;
          subject_code: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_type: string;
          occurred_at?: string;
          commitment_id?: string | null;
          subject_code?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_type?: string;
          occurred_at?: string;
          commitment_id?: string | null;
          subject_code?: string | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      commitments: {
        Row: {
          id: string;
          user_id: string;
          commitment_code: string;
          subject_code: string | null;
          target_type: string | null;
          target_value: number | null;
          start_at: string;
          end_at: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          commitment_code: string;
          subject_code?: string | null;
          target_type?: string | null;
          target_value?: number | null;
          start_at?: string;
          end_at?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          commitment_code?: string;
          subject_code?: string | null;
          target_type?: string | null;
          target_value?: number | null;
          start_at?: string;
          end_at?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      abstinence_targets: {
        Row: {
          id: string;
          user_id: string;
          abstinence_target_code: string;
          start_at: string;
          target_metric: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          abstinence_target_code: string;
          start_at?: string;
          target_metric?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          abstinence_target_code?: string;
          start_at?: string;
          target_metric?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      focus_sessions: {
        Row: {
          id: string;
          user_id: string;
          started_at: string;
          ended_at: string;
          duration_seconds: number;
          outcome_code: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          started_at: string;
          ended_at: string;
          duration_seconds: number;
          outcome_code: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          started_at?: string;
          ended_at?: string;
          duration_seconds?: number;
          outcome_code?: string;
          created_at?: string;
        };
      };
      governance_state: {
        Row: {
          user_id: string;
          state_json: Json;
          last_computed_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          state_json?: Json;
          last_computed_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          state_json?: Json;
          last_computed_at?: string;
          updated_at?: string;
        };
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      check_ins: {
        Row: {
          id: string;
          user_id: string;
          entry_date: string;
          mood: number | null;
          stress: number | null;
          energy: number | null;
          focus: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry_date: string;
          mood?: number | null;
          stress?: number | null;
          energy?: number | null;
          focus?: number | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry_date?: string;
          mood?: number | null;
          stress?: number | null;
          energy?: number | null;
          focus?: number | null;
          note?: string | null;
          created_at?: string;
        };
      };
      conversation_messages: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          content: string;
          session_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: string;
          content: string;
          session_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: string;
          content?: string;
          session_id?: string | null;
          created_at?: string;
        };
      };
      memory_chunks: {
        Row: {
          id: string;
          user_id: string;
          source_type: string;
          source_id: string;
          chunk_index: number;
          content_hash: string;
          token_estimate: number;
          embedding: Json | null;
          embedding_model: string | null;
          embedded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: string;
          source_id: string;
          chunk_index?: number;
          content_hash: string;
          token_estimate?: number;
          embedding?: Json | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: string;
          source_id?: string;
          chunk_index?: number;
          content_hash?: string;
          token_estimate?: number;
          embedding?: Json | null;
          embedding_model?: string | null;
          embedded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      memory_embed_jobs: {
        Row: {
          id: string;
          user_id: string;
          chunk_id: string;
          status: string;
          error: string | null;
          attempts: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          chunk_id: string;
          status?: string;
          error?: string | null;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          chunk_id?: string;
          status?: string;
          error?: string | null;
          attempts?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      migration_audit: {
        Row: {
          id: string;
          created_at: string;
          environment: string;
          auditor: string;
          tables: Json;
          totals: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          environment?: string;
          auditor?: string;
          tables: Json;
          totals: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          environment?: string;
          auditor?: string;
          tables?: Json;
          totals?: Json;
        };
      };
      migration_state: {
        Row: {
          user_id: string;
          status: string;
          started_at: string | null;
          completed_at: string | null;
          checksum: string | null;
          updated_at: string;
          migration_token: string | null;
          migration_token_expires_at: string | null;
        };
        Insert: {
          user_id: string;
          status?: string;
          started_at?: string | null;
          completed_at?: string | null;
          checksum?: string | null;
          updated_at?: string;
          migration_token?: string | null;
          migration_token_expires_at?: string | null;
        };
        Update: {
          user_id?: string;
          status?: string;
          started_at?: string | null;
          completed_at?: string | null;
          checksum?: string | null;
          updated_at?: string;
          migration_token?: string | null;
          migration_token_expires_at?: string | null;
        };
      };
      migration_export_audit: {
        Row: {
          id: string;
          created_at: string;
          export_type: string;
          user_id_hash: string;
          offset: number;
          limit: number;
          request_id: string | null;
          success: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          export_type: string;
          user_id_hash: string;
          offset?: number;
          limit?: number;
          request_id?: string | null;
          success?: boolean;
        };
        Update: {
          created_at?: string;
          export_type?: string;
          user_id_hash?: string;
          offset?: number;
          limit?: number;
          request_id?: string | null;
          success?: boolean;
        };
      };
      journal_entries_v2: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          mood_score: number | null;
          word_count: number | null;
          local_hash: string | null;
          is_deleted: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          mood_score?: number | null;
          word_count?: number | null;
          local_hash?: string | null;
          is_deleted?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          mood_score?: number | null;
          word_count?: number | null;
          local_hash?: string | null;
          is_deleted?: boolean;
        };
      };
      journal_entries_meta: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          word_count: number;
          local_hash: string;
          processing_mode: "private" | "signals_only";
          signals: unknown;
          is_deleted: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          word_count?: number;
          local_hash: string;
          processing_mode?: "private" | "signals_only";
          signals?: unknown;
          is_deleted?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          word_count?: number;
          local_hash?: string;
          processing_mode?: "private" | "signals_only";
          signals?: unknown;
          is_deleted?: boolean;
        };
      };
      conversation_metadata_v2: {
        Row: {
          id: string;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          mode_enum: string | null;
          message_count: number;
          token_count: number;
          model_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          started_at?: string;
          ended_at?: string | null;
          mode_enum?: string | null;
          message_count?: number;
          token_count?: number;
          model_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          started_at?: string;
          ended_at?: string | null;
          mode_enum?: string | null;
          message_count?: number;
          token_count?: number;
          model_id?: string | null;
        };
      };
      check_ins_v2: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          mood_score: number | null;
          stress: number | null;
          energy: number | null;
          focus: number | null;
          type_enum: string | null;
          trigger_enum: string | null;
          is_deleted: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          mood_score?: number | null;
          stress?: number | null;
          energy?: number | null;
          focus?: number | null;
          type_enum?: string | null;
          trigger_enum?: string | null;
          is_deleted?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          mood_score?: number | null;
          stress?: number | null;
          energy?: number | null;
          focus?: number | null;
          type_enum?: string | null;
          trigger_enum?: string | null;
          is_deleted?: boolean;
        };
      };
      user_reports_v2: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          report_type: string;
          severity: number;
          status: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          report_type: string;
          severity: number;
          status?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          report_type?: string;
          severity?: number;
          status?: string;
        };
      };
      memory_chunks_v2: {
        Row: {
          id: string;
          user_id: string;
          source_type: string;
          source_id: string;
          content_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_type: string;
          source_id: string;
          content_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_type?: string;
          source_id?: string;
          content_hash?: string;
          created_at?: string;
        };
      };
      master_state_current: {
        Row: {
          user_id: string;
          global_stability_score: number;
          dominant_risk_domain: string;
          energy_budget_flag: boolean;
          overload_flag: boolean;
          confidence_score: number;
          sample_size: number;
          data_freshness_hours: number;
          is_stale: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          global_stability_score?: number;
          dominant_risk_domain?: string;
          energy_budget_flag?: boolean;
          overload_flag?: boolean;
          confidence_score?: number;
          sample_size?: number;
          data_freshness_hours?: number;
          is_stale?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          global_stability_score?: number;
          dominant_risk_domain?: string;
          energy_budget_flag?: boolean;
          overload_flag?: boolean;
          confidence_score?: number;
          sample_size?: number;
          data_freshness_hours?: number;
          is_stale?: boolean;
          updated_at?: string;
        };
      };
      system_status_current: {
        Row: {
          user_id: string;
          system_phase: string;
          top_priority_domain: string;
          enforcement_mode: string;
          focus_capacity: number;
          decision_capacity: number;
          recovery_required: boolean;
          recompute_count_today: number;
          last_recompute_reason: string | null;
          confidence_score: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          system_phase?: string;
          top_priority_domain?: string;
          enforcement_mode?: string;
          focus_capacity?: number;
          decision_capacity?: number;
          recovery_required?: boolean;
          recompute_count_today?: number;
          last_recompute_reason?: string | null;
          confidence_score?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          system_phase?: string;
          top_priority_domain?: string;
          enforcement_mode?: string;
          focus_capacity?: number;
          decision_capacity?: number;
          recovery_required?: boolean;
          recompute_count_today?: number;
          last_recompute_reason?: string | null;
          confidence_score?: number;
          updated_at?: string;
        };
      };
      health_state_current: {
        Row: {
          user_id: string;
          energy_index: number;
          sleep_debt_score: number;
          recovery_index: number;
          volatility_flag: boolean;
          confidence_score: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          energy_index?: number;
          sleep_debt_score?: number;
          recovery_index?: number;
          volatility_flag?: boolean;
          confidence_score?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          energy_index?: number;
          sleep_debt_score?: number;
          recovery_index?: number;
          volatility_flag?: boolean;
          confidence_score?: number;
          updated_at?: string;
        };
      };
      financial_state_current: {
        Row: {
          user_id: string;
          monthly_spending: number;
          impulse_spend_count: number;
          savings_ratio: number;
          financial_stress_index: number;
          confidence_score: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          monthly_spending?: number;
          impulse_spend_count?: number;
          savings_ratio?: number;
          financial_stress_index?: number;
          confidence_score?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          monthly_spending?: number;
          impulse_spend_count?: number;
          savings_ratio?: number;
          financial_stress_index?: number;
          confidence_score?: number;
          updated_at?: string;
        };
      };
      cognitive_state_current: {
        Row: {
          user_id: string;
          avg_confidence: number;
          regret_index: number;
          bias_frequency_score: number;
          decision_volatility: number;
          confidence_score: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          avg_confidence?: number;
          regret_index?: number;
          bias_frequency_score?: number;
          decision_volatility?: number;
          confidence_score?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          avg_confidence?: number;
          regret_index?: number;
          bias_frequency_score?: number;
          decision_volatility?: number;
          confidence_score?: number;
          updated_at?: string;
        };
      };
      contracts_current: {
        Row: {
          id: string;
          user_id: string;
          template_id: string;
          domain: string;
          origin: string;
          enforcement_mode: string;
          severity: string;
          duration_days: number;
          budget_weight: number;
          is_active: boolean;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          template_id: string;
          domain: string;
          origin: string;
          enforcement_mode: string;
          severity: string;
          duration_days: number;
          budget_weight: number;
          is_active?: boolean;
          created_at?: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          template_id?: string;
          domain?: string;
          origin?: string;
          enforcement_mode?: string;
          severity?: string;
          duration_days?: number;
          budget_weight?: number;
          is_active?: boolean;
          created_at?: string;
          expires_at?: string;
        };
      };
      resource_budget_current: {
        Row: {
          user_id: string;
          max_focus_minutes_today: number;
          max_decision_complexity: number;
          spending_tolerance_band: number;
          recovery_required_hours: number;
          budget_confidence: number;
          constraint_level: string;
          confidence_score: number;
          sample_size: number;
          data_freshness_hours: number;
          is_stale: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          max_focus_minutes_today?: number;
          max_decision_complexity?: number;
          spending_tolerance_band?: number;
          recovery_required_hours?: number;
          budget_confidence?: number;
          constraint_level?: string;
          confidence_score?: number;
          sample_size?: number;
          data_freshness_hours?: number;
          is_stale?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          max_focus_minutes_today?: number;
          max_decision_complexity?: number;
          spending_tolerance_band?: number;
          recovery_required_hours?: number;
          budget_confidence?: number;
          constraint_level?: string;
          confidence_score?: number;
          sample_size?: number;
          data_freshness_hours?: number;
          is_stale?: boolean;
          updated_at?: string;
        };
      };
      system_transition_log: {
        Row: {
          id: string;
          user_id: string;
          previous_phase: string;
          new_phase: string;
          previous_priority_domain: string;
          new_priority_domain: string;
          previous_enforcement_mode: string;
          new_enforcement_mode: string;
          previous_constraint_level: string;
          new_constraint_level: string;
          trigger_source: string;
          triggered_by_domain: string;
          changed_phase: boolean;
          changed_priority: boolean;
          changed_enforcement: boolean;
          changed_budget: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          previous_phase: string;
          new_phase: string;
          previous_priority_domain: string;
          new_priority_domain: string;
          previous_enforcement_mode: string;
          new_enforcement_mode: string;
          previous_constraint_level?: string;
          new_constraint_level?: string;
          trigger_source?: string;
          triggered_by_domain?: string;
          changed_phase?: boolean;
          changed_priority?: boolean;
          changed_enforcement?: boolean;
          changed_budget?: boolean;
          created_at?: string;
        };
        Update: {};
      };
      inbox_proposals_meta: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          domain: string;
          severity: string;
          proposal_id: string;
          created_at: string;
          status: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          domain: string;
          severity: string;
          proposal_id: string;
          created_at?: string;
          status?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          domain?: string;
          severity?: string;
          proposal_id?: string;
          created_at?: string;
          status?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      atomic_token_deduct: {
        Args: {
          p_user_id: string;
          p_tokens: number;
          p_source: string;
          p_from_alloc: boolean;
          p_allowance: number;
          p_window_start: string;
          p_window_end: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      migration_status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
      governance_event_type: "commitment_created" | "commitment_completed" | "commitment_violation" | "abstinence_start" | "abstinence_violation" | "focus_start" | "focus_end" | "scheduler_tick";
      governance_commitment_code: "no_smoking" | "no_alcohol" | "focus_block" | "habit_daily" | "custom";
      governance_subject_code: "smoking" | "alcohol" | "focus" | "habit" | "other";
      governance_abstinence_target_code: "smoking" | "alcohol" | "focus" | "habit" | "other";
      governance_focus_outcome: "completed" | "abandoned" | "skipped" | "expired";
      governance_target_status: "active" | "paused" | "completed" | "abandoned";
      budget_constraint_level: "normal" | "constrained" | "critical";
      transition_trigger_source: "session_close" | "scheduler_tick" | "user_action" | "system_recompute";
    };
  };
};

