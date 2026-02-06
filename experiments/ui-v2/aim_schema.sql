-- Create aim_scores table for the Aim Trainer
create table public.aim_scores (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  
  score int not null default 0,
  hits int not null default 0,
  misses int not null default 0, -- clicked background or target expired
  accuracy numeric not null default 0, -- percentage 0-100
  
  -- Metadata for analytics/tuning
  max_streak int default 0,
  duration_seconds int default 0
);

-- Enable Row Level Security (RLS)
alter table public.aim_scores enable row level security;

-- Policies

-- 1. Everyone can read highscores (Leaderboard)
create policy "Enable read access for all users"
  on public.aim_scores for select
  using (true);

-- 2. Users can insert their own scores
create policy "Enable insert for authenticated users only"
  on public.aim_scores for insert
  with check (auth.uid() = user_id);

-- 3. Users can only see/update their own (if we want detailed history view private)
-- For now, read is public.

-- Create a view for the Leaderboard (Top scores per user)
-- This helps avoid showing 100 entries from the same pro player
create or replace view public.aim_leaderboard as
select distinct on (user_id)
  user_id,
  score,
  accuracy,
  created_at,
  -- We might want to join with a profiles table if it existed, 
  -- but for now we'll handle names on the client or via auth metadata cache
  id as score_id
from public.aim_scores
order by user_id, score desc;
