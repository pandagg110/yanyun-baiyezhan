-- 019: Link matches to rosters
-- Add roster_id column to baiyezhan_matches
ALTER TABLE baiyezhan_matches
ADD COLUMN IF NOT EXISTS roster_id UUID REFERENCES baiyezhan_rosters(id) ON DELETE SET NULL;
