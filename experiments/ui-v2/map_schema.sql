-- Create map_animations table
create table public.map_animations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references auth.users not null,
  
  anim_id text,                 -- e.g. "ANIM-042"
  description text,             -- "Comment"
  duration numeric,             -- in seconds
  status text default 'draft',  -- draft, active, done
  
  participants jsonb default '[]'::jsonb, -- Array of strings/objects: ["Marc", "Käthe"]
  waypoints jsonb default '[]'::jsonb,    -- Array of objects: [{lat, lng, mode, ...}]
  
  -- Optional: View state to restore map position
  view_state jsonb default '{}'::jsonb
);

-- Enable RLS
alter table public.map_animations enable row level security;

-- Policies
create policy "Users can view map_animations from everyone (Team view)"
  on public.map_animations for select
  using ( true );

create policy "Users can insert their own map_animations"
  on public.map_animations for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own map_animations"
  on public.map_animations for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own map_animations"
  on public.map_animations for delete
  using ( auth.uid() = user_id );
