-- ============================================================================
-- Migration 004: Add User Roles
-- Date: 2026-02-01
-- Description: Adds role-based access control to users table.
--              Roles: 'user' (default), 'vip', 'admin'
-- ============================================================================

-- Add role column
ALTER TABLE public.baiyezhan_users
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Add check constraint for valid roles
ALTER TABLE public.baiyezhan_users
ADD CONSTRAINT baiyezhan_users_role_check
CHECK (role IN ('user', 'vip', 'admin'));

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_baiyezhan_users_role
ON public.baiyezhan_users(role);
