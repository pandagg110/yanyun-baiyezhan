-- ============================================================================
-- Migration 000: Baseline Schema
-- Date: 2026-01-24
-- Description: Creates all core tables, RLS policies, and the user sync trigger.
--              This represents the initial database state.
-- ============================================================================

-- ──────────────────────────────────────────────
-- 1. Users (linked to auth.users)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.baiyezhan_users (
    id         uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    email      text,
    character_name text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ──────────────────────────────────────────────
-- 2. Rooms
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.baiyezhan_rooms (
    id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code          text UNIQUE NOT NULL,
    owner_id           uuid REFERENCES public.baiyezhan_users(id) ON DELETE CASCADE NOT NULL,
    name               text NOT NULL DEFAULT '未命名房间',
    room_type          text NOT NULL DEFAULT 'default',  -- 'default', 'nameless', 'healer', 'tank'
    round_duration     integer DEFAULT 80,
    broadcast_interval integer DEFAULT 10,
    bgm_track          text DEFAULT 'default',
    cover_image        text DEFAULT 'default',
    created_at         timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ──────────────────────────────────────────────
-- 3. Room State
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.baiyezhan_room_state (
    room_id          uuid REFERENCES public.baiyezhan_rooms(id) ON DELETE CASCADE PRIMARY KEY,
    round_start_time bigint,
    is_running       boolean DEFAULT false,
    updated_at       timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ──────────────────────────────────────────────
-- 4. Room Members
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.baiyezhan_room_members (
    room_id    uuid REFERENCES public.baiyezhan_rooms(id) ON DELETE CASCADE NOT NULL,
    user_id    uuid REFERENCES public.baiyezhan_users(id) ON DELETE CASCADE NOT NULL,
    order_index integer NOT NULL,
    joined_at  timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (room_id, user_id)
);

-- ──────────────────────────────────────────────
-- 5. Enable Row Level Security
-- ──────────────────────────────────────────────
ALTER TABLE public.baiyezhan_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baiyezhan_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baiyezhan_room_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.baiyezhan_room_members ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────
-- 6. RLS Policies (Public access for core tables)
-- ──────────────────────────────────────────────
CREATE POLICY "Public access" ON public.baiyezhan_users FOR ALL USING (true);
CREATE POLICY "Public access" ON public.baiyezhan_rooms FOR ALL USING (true);
CREATE POLICY "Public access" ON public.baiyezhan_room_state FOR ALL USING (true);
CREATE POLICY "Public access" ON public.baiyezhan_room_members FOR ALL USING (true);

-- ──────────────────────────────────────────────
-- 7. Trigger: Auto-create user profile on signup
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.baiyezhan_users (id, email, character_name)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'character_name');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The trigger itself must be created on auth.users:
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
