/*
  # Add Repeating Sessions

  ## Overview
  Creates a new table to store repeating session templates that can automatically
  generate scheduled sessions on specific days of the week at specific times.

  ## New Tables
  
  ### `repeating_sessions`
  Stores recurring session templates with scheduling rules
  - `id` (uuid, primary key) - Unique repeating session identifier
  - `user_id` (uuid, foreign key) - Reference to auth.users with cascade delete
  - `created_at` (timestamptz) - When the repeating session was created
  - `task_name` (text) - Name of the recurring task
  - `duration_minutes` (integer) - Duration for each occurrence (must be > 0)
  - `scheduled_time` (time) - Time of day for sessions (without timezone)
  - `repeat_days` (text[]) - Array of days when session repeats (e.g., ['monday', 'wednesday', 'friday'])

  ## Security
  - Enable RLS on repeating_sessions table
  - Users can only view, create, and delete their own repeating sessions
  - Grants appropriate permissions to authenticated users

  ## Important Notes
  1. Uses CASCADE delete - removing a user automatically removes their repeating sessions
  2. Time is stored without timezone for flexibility across different user timezones
  3. repeat_days array allows flexible scheduling patterns
*/

-- Step 1: Cleanly drop the old table and its policies (safety measure)
DROP TABLE IF EXISTS public.repeating_sessions;

-- Step 2: Create the table with all correct columns
CREATE TABLE public.repeating_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  task_name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  scheduled_time time without time zone NOT NULL,
  repeat_days text[] NOT NULL
);

-- Step 3: Enable Row Level Security (RLS) on the table
ALTER TABLE public.repeating_sessions ENABLE ROW LEVEL SECURITY;

-- Step 4: Create the security policies for who can access what
CREATE POLICY "Allow users to view their own repeating sessions"
ON public.repeating_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Allow users to create their own repeating sessions"
ON public.repeating_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own repeating sessions"
ON public.repeating_sessions FOR DELETE
USING (auth.uid() = user_id);

-- Step 5: Grant the fundamental permissions for logged-in users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.repeating_sessions TO authenticated;