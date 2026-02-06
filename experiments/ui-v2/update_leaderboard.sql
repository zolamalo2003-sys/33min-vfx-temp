-- Run this in your Supabase SQL Editor to update the leaderboard

-- 1. Add player_name column to aim_scores
ALTER TABLE public.aim_scores 
ADD COLUMN IF NOT EXISTS player_name text;

-- 2. Drop the old view to recreate it with the new column
DROP VIEW IF EXISTS public.aim_leaderboard;

-- 3. Recreate the view including player_name
CREATE OR REPLACE VIEW public.aim_leaderboard AS
SELECT DISTINCT ON (user_id)
  user_id,
  score,
  accuracy,
  created_at,
  player_name, -- Include the name
  id as score_id
FROM public.aim_scores
ORDER BY user_id, score DESC;
