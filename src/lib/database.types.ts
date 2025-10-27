export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string
          user_id: string
          task_name: string
          scheduled_start: string
          duration_minutes: number
          status: 'scheduled' | 'in_progress' | 'completed' | 'missed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          task_name: string
          scheduled_start: string
          duration_minutes: number
          status?: 'scheduled' | 'in_progress' | 'completed' | 'missed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          task_name?: string
          scheduled_start?: string
          duration_minutes?: number
          status?: 'scheduled' | 'in_progress' | 'completed' | 'missed'
          created_at?: string
          updated_at?: string
        }
      }
      session_logs: {
        Row: {
          id: string
          session_id: string
          user_id: string
          actual_start: string
          actual_end: string | null
          start_delay_minutes: number
          completion_percentage: number
          was_paused: boolean
          pause_duration_minutes: number
          reflection_note: string | null
          productivity_score: number
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          user_id: string
          actual_start: string
          actual_end?: string | null
          start_delay_minutes?: number
          completion_percentage?: number
          was_paused?: boolean
          pause_duration_minutes?: number
          reflection_note?: string | null
          productivity_score?: number
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          user_id?: string
          actual_start?: string
          actual_end?: string | null
          start_delay_minutes?: number
          completion_percentage?: number
          was_paused?: boolean
          pause_duration_minutes?: number
          reflection_note?: string | null
          productivity_score?: number
          created_at?: string
        }
      }
      achievements: {
        Row: {
          id: string
          user_id: string
          achievement_type: string
          achievement_name: string
          description: string | null
          earned_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          user_id: string
          achievement_type: string
          achievement_name: string
          description?: string | null
          earned_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          achievement_type?: string
          achievement_name?: string
          description?: string | null
          earned_at?: string
          metadata?: Json
        }
      }
      user_stats: {
        Row: {
          user_id: string
          current_streak: number
          longest_streak: number
          total_sessions: number
          total_on_time: number
          total_completed: number
          average_score: number
          last_session_date: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          current_streak?: number
          longest_streak?: number
          total_sessions?: number
          total_on_time?: number
          total_completed?: number
          average_score?: number
          last_session_date?: string | null
          updated_at?: string
        }
        Update: {
          user_id?: string
          current_streak?: number
          longest_streak?: number
          total_sessions?: number
          total_on_time?: number
          total_completed?: number
          average_score?: number
          last_session_date?: string | null
          updated_at?: string
        }
      }
    }
  }
}
