-- Migration: Add user roles to baiyezhan_users
-- Roles: 'user' (default), 'vip', 'admin'

-- Add role column with default value
ALTER TABLE public.baiyezhan_users
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Add check constraint to ensure valid roles
ALTER TABLE public.baiyezhan_users
ADD CONSTRAINT baiyezhan_users_role_check
CHECK (role IN ('user', 'vip', 'admin'));

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_baiyezhan_users_role ON public.baiyezhan_users(role);
