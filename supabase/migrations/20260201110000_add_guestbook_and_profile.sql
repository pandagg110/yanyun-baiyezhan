-- 1. Add Avatar to Users
ALTER TABLE public.baiyezhan_users ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Create Guestbook Table
CREATE TABLE IF NOT EXISTS public.baiyezhan_guestbook (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content text NOT NULL,
  author_id uuid REFERENCES public.baiyezhan_users(id) ON DELETE CASCADE NOT NULL,
  target_type text NOT NULL, -- 'global', 'baiye', 'room'
  target_id uuid, -- NULL if global
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_guestbook_target ON public.baiyezhan_guestbook(target_type, target_id);

-- Enable RLS
ALTER TABLE public.baiyezhan_guestbook ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Everyone can read
CREATE POLICY "Public read access" ON public.baiyezhan_guestbook 
FOR SELECT TO public USING (true);

-- 2. Authenticated users can insert
CREATE POLICY "Authenticated insert access" ON public.baiyezhan_guestbook 
FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

-- 3. Admin and VIP can delete (Conceptually. For simplicity in RLS, we might just allow users to delete their own, and admins everything)
-- Actually, let's keep it simple: Users can delete their own. Admin can delete distinctively.
CREATE POLICY "User delete own or Admin delete all" ON public.baiyezhan_guestbook 
FOR DELETE TO authenticated USING (
  auth.uid() = author_id OR 
  EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'admin') OR
  EXISTS (SELECT 1 FROM public.baiyezhan_users WHERE id = auth.uid() AND role = 'vip')
);
