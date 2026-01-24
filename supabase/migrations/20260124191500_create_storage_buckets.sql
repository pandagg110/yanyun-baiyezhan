-- Migration: Create Storage Bucket (baiyezhan)
-- Created at: 2026-01-24 19:15:00

-- 1. Create 'baiyezhan' bucket
insert into storage.buckets (id, name, public) 
values ('baiyezhan', 'baiyezhan', true)
on conflict (id) do nothing;

-- 2. Policies for 'baiyezhan' bucket
drop policy if exists "Allow authenticated uploads to baiyezhan" on storage.objects;
create policy "Allow authenticated uploads to baiyezhan"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'baiyezhan' );

drop policy if exists "Public read access to baiyezhan" on storage.objects;
create policy "Public read access to baiyezhan"
on storage.objects for select
to public
using ( bucket_id = 'baiyezhan' );
