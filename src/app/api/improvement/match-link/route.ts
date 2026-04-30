import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/improvement/match-link
 * 
 * Search for match AI analyses that mention given keywords.
 * Used to link Todo items to relevant match replays.
 * 
 * Body: { baiye_id: string, keywords: string[] }
 * Returns: { results: { match_id, team_a, team_b, match_start_time, snippet }[] }
 */
export async function POST(request: NextRequest) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const body = await request.json();
        const { baiye_id, keywords } = body;

        if (!baiye_id || !keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Fetch all AI analyses for this baiye
        const { data: analyses, error: fetchErr } = await supabase
            .from('baiyezhan_match_ai_analysis')
            .select('match_id, analysis_text')
            .eq('baiye_id', baiye_id);

        if (fetchErr) {
            console.error('Analysis fetch error:', fetchErr);
            return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 });
        }

        if (!analyses || analyses.length === 0) {
            return NextResponse.json({ results: [] });
        }

        // Search for keyword matches in analysis text
        const matchingIds: Map<string, string> = new Map(); // match_id -> snippet
        for (const a of analyses) {
            const text = a.analysis_text || '';
            const lowerText = text.toLowerCase();
            for (const kw of keywords) {
                if (lowerText.includes(kw.toLowerCase())) {
                    // Extract a snippet around the keyword
                    const idx = lowerText.indexOf(kw.toLowerCase());
                    const start = Math.max(0, idx - 30);
                    const end = Math.min(text.length, idx + kw.length + 60);
                    const snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
                    matchingIds.set(a.match_id, snippet);
                    break; // One match per analysis is enough
                }
            }
        }

        if (matchingIds.size === 0) {
            return NextResponse.json({ results: [] });
        }

        // Fetch match metadata for matched analyses
        const { data: matches, error: matchErr } = await supabase
            .from('baiyezhan_matches')
            .select('id, team_a, team_b, match_start_time')
            .in('id', Array.from(matchingIds.keys()))
            .order('match_start_time', { ascending: false })
            .limit(10);

        if (matchErr) {
            console.error('Match fetch error:', matchErr);
            return NextResponse.json({ results: [] });
        }

        const results = (matches || []).map(m => ({
            match_id: m.id,
            team_a: m.team_a,
            team_b: m.team_b,
            match_start_time: m.match_start_time,
            snippet: matchingIds.get(m.id) || '',
        }));

        return NextResponse.json({ results });
    } catch (error: unknown) {
        console.error('Match link error:', error);
        const message = error instanceof Error ? error.message : 'Match link failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
