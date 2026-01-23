-- 1. Profiles / Users (Linked to auth.users)
create table public.baiyezhan_users (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  character_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Rooms
-- Added: name, room_type
create table public.baiyezhan_rooms (
  id uuid default gen_random_uuid() primary key,
  room_code text unique not null,
  owner_id uuid references public.baiyezhan_users(id) on delete cascade not null,
  name text not null default '未命名房间', 
  room_type text not null default 'default', -- 'general', 'nameless', 'healer', 'tank'
  round_duration integer default 80,
  broadcast_interval integer default 10,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Room State
create table public.baiyezhan_room_state (
  room_id uuid references public.baiyezhan_rooms(id) on delete cascade primary key,
  round_start_time bigint,
  is_running boolean default false,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Room Members
create table public.baiyezhan_room_members (
  room_id uuid references public.baiyezhan_rooms(id) on delete cascade not null,
  user_id uuid references public.baiyezhan_users(id) on delete cascade not null,
  order_index integer not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (room_id, user_id)
);

-- RLS Policies
alter table public.baiyezhan_users enable row level security;
alter table public.baiyezhan_rooms enable row level security;
alter table public.baiyezhan_room_state enable row level security;
alter table public.baiyezhan_room_members enable row level security;

-- Policies
create policy "Public access" on public.baiyezhan_users for all using (true);
create policy "Public access" on public.baiyezhan_rooms for all using (true);
create policy "Public access" on public.baiyezhan_room_state for all using (true);
create policy "Public access" on public.baiyezhan_room_members for all using (true);

-- Optional: Trigger to auto-create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.baiyezhan_users (id, email, character_name)
  values (new.id, new.email, new.raw_user_meta_data->>'character_name');
  return new;
end;
$$ language plpgsql security definer;
