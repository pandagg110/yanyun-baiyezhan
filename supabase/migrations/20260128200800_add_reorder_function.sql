-- Migration: Add reorder_room_members RPC function
-- Purpose: Atomic reordering of room members after someone leaves or is cleaned up

-- Create the RPC function for atomic member reordering
CREATE OR REPLACE FUNCTION reorder_room_members(p_room_id uuid)
RETURNS void AS $$
BEGIN
    -- Atomic reorder: reassign order_index as 0, 1, 2, 3... based on current order
    WITH ranked AS (
        SELECT 
            user_id, 
            ROW_NUMBER() OVER (ORDER BY order_index) - 1 AS new_index
        FROM baiyezhan_room_members
        WHERE room_id = p_room_id
    )
    UPDATE baiyezhan_room_members m
    SET order_index = r.new_index
    FROM ranked r
    WHERE m.room_id = p_room_id AND m.user_id = r.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reorder_room_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reorder_room_members(uuid) TO anon;
