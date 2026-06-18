import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

type IncomingTelemetry = Record<string, unknown>;

interface SkillCooldownRow {
    room_code: string;
    username: string;
    profession: string;
    skill_name: string;
    cooldown_until: string | null;
    heartbeat_at: string;
    client_reported_at: string | null;
    metadata: Record<string, unknown>;
}

interface RoomValidationRow {
    room_code: string;
    room_type: string;
}

function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase not configured');
    }

    return createClient(supabaseUrl, supabaseKey);
}

function getText(source: IncomingTelemetry, keys: string[]) {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) return trimmed;
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(value);
        }
    }
    return '';
}

function normalizeDateTime(value: unknown, fieldName: string): string | null {
    if (value === undefined || value === null) return null;

    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value <= 0) return null;
        if (value <= 86400) return new Date(Date.now() + value * 1000).toISOString();
        if (value > 1000000000000) return new Date(value).toISOString();
        if (value > 1000000000) return new Date(value * 1000).toISOString();
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return normalizeDateTime(numeric, fieldName);
        }

        const timestamp = Date.parse(trimmed);
        if (Number.isNaN(timestamp)) {
            throw new Error(`${fieldName} must be ISO time, unix timestamp, seconds remaining, or empty`);
        }

        return new Date(timestamp).toISOString();
    }

    throw new Error(`${fieldName} has unsupported value`);
}

function getMetadata(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

function normalizeItem(item: unknown, defaults: IncomingTelemetry, index: number): SkillCooldownRow {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`items[${index}] must be an object`);
    }

    const source = item as IncomingTelemetry;
    const roomCode = getText(source, ['room_code', 'roomCode']) || getText(defaults, ['room_code', 'roomCode']);
    const username = getText(source, ['username', 'user_name', 'userName']);
    const profession = getText(source, ['profession', 'job', 'class']);
    const skillName = getText(source, ['skill_name', 'skillName']);

    if (!roomCode) throw new Error(`items[${index}].room_code is required`);
    if (!username) throw new Error(`items[${index}].username is required`);
    if (!skillName) throw new Error(`items[${index}].skill_name is required`);

    const nowIso = new Date().toISOString();
    const cooldownValue = source.cooldown_until ?? source.cooldownUntil ?? source.cd_time ?? source.cdTime ?? null;
    const heartbeatValue = source.heartbeat_at ?? source.heartbeatAt ?? null;
    const clientReportedValue = source.client_reported_at ?? source.clientReportedAt ?? null;

    return {
        room_code: roomCode,
        username,
        profession,
        skill_name: skillName,
        cooldown_until: normalizeDateTime(cooldownValue, `items[${index}].cooldown_until`),
        heartbeat_at: normalizeDateTime(heartbeatValue, `items[${index}].heartbeat_at`) || nowIso,
        client_reported_at: normalizeDateTime(clientReportedValue, `items[${index}].client_reported_at`),
        metadata: getMetadata(source.metadata),
    };
}

function parseRows(body: unknown): SkillCooldownRow[] {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('Body must be an object');
    }

    const source = body as IncomingTelemetry;
    const rawItems = Array.isArray(source.items) ? source.items : [source];
    if (rawItems.length === 0) throw new Error('items cannot be empty');
    if (rawItems.length > 200) throw new Error('items cannot exceed 200 rows per request');

    return rawItems.map((item, index) => normalizeItem(item, source, index));
}

async function validateTelemetryRooms(
    supabase: ReturnType<typeof getSupabase>,
    roomCodes: string[],
) {
    const uniqueCodes = [...new Set(roomCodes)];
    const { data: rooms, error } = await supabase
        .from('baiyezhan_rooms')
        .select('room_code, room_type')
        .in('room_code', uniqueCodes);

    if (error) throw error;

    const roomRows = (rooms || []) as RoomValidationRow[];
    const roomMap = new Map(roomRows.map(room => [room.room_code, room.room_type]));
    const missing = uniqueCodes.filter(code => !roomMap.has(code));
    if (missing.length > 0) {
        return { ok: false, status: 404, error: `Room not found: ${missing.join(', ')}` };
    }

    const invalid = uniqueCodes.filter(code => roomMap.get(code) !== 'telemetry');
    if (invalid.length > 0) {
        return { ok: false, status: 409, error: `Room is not telemetry type: ${invalid.join(', ')}` };
    }

    return { ok: true, status: 200, error: '' };
}

export async function POST(request: NextRequest) {
    try {
        const supabase = getSupabase();
        const body = await request.json();
        const rows = parseRows(body);

        const validation = await validateTelemetryRooms(supabase, rows.map(row => row.room_code));
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: validation.status });
        }

        const { data, error } = await supabase
            .from('baiyezhan_skill_cooldowns')
            .upsert(rows, { onConflict: 'room_code,username,skill_name' })
            .select();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            status: 'ok',
            count: data?.length || 0,
            records: data || [],
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const supabase = getSupabase();
        const { searchParams } = new URL(request.url);
        const roomCode = searchParams.get('room_code')?.trim() || searchParams.get('roomCode')?.trim();

        if (!roomCode) {
            return NextResponse.json({ error: 'Missing required query param: room_code' }, { status: 400 });
        }

        const validation = await validateTelemetryRooms(supabase, [roomCode]);
        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: validation.status });
        }

        const { data, error } = await supabase
            .from('baiyezhan_skill_cooldowns')
            .select('*')
            .eq('room_code', roomCode)
            .order('username', { ascending: true })
            .order('skill_name', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            room_code: roomCode,
            records: data || [],
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
