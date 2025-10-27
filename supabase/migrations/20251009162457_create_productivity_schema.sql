/*
  # Productivity Tracker Database Schema

  ## Overview
  Creates a comprehensive system for tracking scheduled work sessions, 
  timer logs, and user achievements with focus on productivity analytics.

  ## New Tables
  
  ### 1. `sessions`
  Stores scheduled work sessions with timing details
  - `id` (uuid, primary key) - Unique session identifier
  - `user_id` (uuid) - Reference to authenticated user
  - `task_name` (text) - Name of the task/session
  - `scheduled_start` (timestamptz) - When session should start
  - `duration_minutes` (integer) - Planned session duration
  - `status` (text) - Session status: 'scheduled', 'in_progress', 'completed', 'missed'
  - `created_at` (timestamptz) - When session was created
  - `updated_at` (timestamptz) - Last modification time

  ### 2. `session_logs`
  Captures actual session execution data for analytics
  - `id` (uuid, primary key) - Unique log identifier
  - `session_id` (uuid) - Reference to sessions table
  - `user_id` (uuid) - Reference to authenticated user
  - `actual_start` (timestamptz) - When user actually started
  - `actual_end` (timestamptz) - When session ended
  - `start_delay_minutes` (integer) - Minutes late (negative if early)
  - `completion_percentage` (integer) - % of planned duration completed
  - `was_paused` (boolean) - Whether session was paused
  - `pause_duration_minutes` (integer) - Total time paused
  - `reflection_note` (text) - Optional user notes
  - `productivity_score` (integer) - Calculated score 0-100
  - `created_at` (timestamptz) - Log creation time

  ### 3. `achievements`
  Tracks user achievements and milestones
  - `id` (uuid, primary key) - Unique achievement identifier
  - `user_id` (uuid) - Reference to authenticated user
  - `achievement_type` (text) - Type of achievement earned
  - `achievement_name` (text) - Display name
  - `description` (text) - Achievement description
  - `earned_at` (timestamptz) - When achievement was earned
  - `metadata` (jsonb) - Additional achievement data

  ### 4. `user_stats`
  Aggregated user statistics for quick dashboard access
  - `user_id` (uuid, primary key) - Reference to authenticated user
  - `current_streak` (integer) - Consecutive on-time sessions
  - `longest_streak` (integer) - Best streak achieved
  - `total_sessions` (integer) - Total sessions completed
  - `total_on_time` (integer) - Sessions started on time
  - `total_completed` (integer) - Sessions fully completed
  - `average_score` (numeric) - Average productivity score
  - `last_session_date` (date) - Last session completion date
  - `updated_at` (timestamptz) - Last stats update

  ## Security
  - Enable RLS on all tables
  - Users can only access their own data
  - Separate policies for SELECT, INSERT, UPDATE, DELETE operations

  ## Indexes
  - Performance indexes on user_id columns
  - Index on scheduled_start for upcoming session queries
  - Index on session status for filtering
*/

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_name text NOT NULL,
  scheduled_start timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'missed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create session_logs table
CREATE TABLE IF NOT EXISTS session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  actual_start timestamptz NOT NULL,
  actual_end timestamptz,
  start_delay_minutes integer DEFAULT 0,
  completion_percentage integer DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  was_paused boolean DEFAULT false,
  pause_duration_minutes integer DEFAULT 0,
  reflection_note text,
  productivity_score integer DEFAULT 0 CHECK (productivity_score >= 0 AND productivity_score <= 100),
  created_at timestamptz DEFAULT now()
);

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_type text NOT NULL,
  achievement_name text NOT NULL,
  description text,
  earned_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create user_stats table
CREATE TABLE IF NOT EXISTS user_stats (
  user_id uuid PRIMARY KEY,
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  total_sessions integer DEFAULT 0,
  total_on_time integer DEFAULT 0,
  total_completed integer DEFAULT 0,
  average_score numeric(5,2) DEFAULT 0,
  last_session_date date,
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled_start ON sessions(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_session_logs_user_id ON session_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sessions table
CREATE POLICY "Users can view own sessions"
  ON sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions"
  ON sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for session_logs table
CREATE POLICY "Users can view own session logs"
  ON session_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own session logs"
  ON session_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own session logs"
  ON session_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own session logs"
  ON session_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for achievements table
CREATE POLICY "Users can view own achievements"
  ON achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own achievements"
  ON achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own achievements"
  ON achievements FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for user_stats table
CREATE POLICY "Users can view own stats"
  ON user_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats"
  ON user_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats"
  ON user_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for sessions updated_at
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_stats updated_at
CREATE TRIGGER update_user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();