-- Migration: Add last_seen column to baiyezhan_room_members

-- Check if column exists first to avoid errors on retry (pseudo-code logic, but simple alter is fine for manual run)
alter table baiyezhan_room_members 
add column if not exists last_seen timestamptz default now();

-- Ensure Realtime is enabled for this table so we can see updates (optional, usually enabled by default or in setup.sql)
alter publication supabase_realtime add table baiyezhan_room_members;
