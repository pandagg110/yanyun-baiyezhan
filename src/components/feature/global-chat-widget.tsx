"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { CommanderChat } from "@/components/feature/commander-chat";
import { SupabaseService } from "@/services/supabase-service";

const WIDGET_STATE_KEY = 'baiye_chat_widget_open';

/**
 * Global floating AI chat widget — bottom-right corner.
 * Automatically detects baiye context from the URL (/baiye/[id]/...).
 * Persists open/close state in localStorage.
 */
export function GlobalChatWidget() {
    const params = useParams();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [baiyeName, setBaiyeName] = useState<string | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    // Extract baiyeId from URL params
    const baiyeId = params?.id as string | undefined;

    // Only show on /baiye/[id]/* routes
    const isBaiyeRoute = pathname?.startsWith('/baiye/') && baiyeId;

    // Hydrate open state from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(WIDGET_STATE_KEY);
            if (saved === 'true') setIsOpen(true);
        } catch { /* ignore */ }
        setHydrated(true);
    }, []);

    // Persist open state
    useEffect(() => {
        if (hydrated) {
            try {
                localStorage.setItem(WIDGET_STATE_KEY, String(isOpen));
            } catch { /* ignore */ }
        }
    }, [isOpen, hydrated]);

    // Fetch baiye name when we have an ID
    useEffect(() => {
        if (!baiyeId) {
            setBaiyeName(null);
            return;
        }
        let cancelled = false;
        SupabaseService.getBaiye(baiyeId).then(b => {
            if (!cancelled && b) setBaiyeName(b.name);
        });
        return () => { cancelled = true; };
    }, [baiyeId]);

    // Clear unread when opened
    useEffect(() => {
        if (isOpen) setHasUnread(false);
    }, [isOpen]);

    if (!isBaiyeRoute || !baiyeId || !hydrated) return null;

    return (
        <>
            {/* Floating Bubble Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-[9999] w-14 h-14 bg-gradient-to-br from-cyan-500 to-cyan-700 border-4 border-black shadow-[4px_4px_0px_0px_#000] hover:shadow-[2px_2px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center justify-center group"
                    title="打开 AI 助手"
                >
                    <span className="text-2xl group-hover:scale-110 transition-transform">🤖</span>
                    {hasUnread && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-black animate-pulse" />
                    )}
                </button>
            )}

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-[9999] flex flex-col bg-neutral-900 border-4 border-black shadow-[6px_6px_0px_0px_#000]"
                    style={{
                        width: 'min(420px, calc(100vw - 48px))',
                        height: 'min(600px, calc(100vh - 100px))',
                    }}
                >
                    {/* Title Bar */}
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-800 border-b-2 border-black shrink-0">
                        <span className="text-lg">🤖</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-cyan-400 uppercase truncate">
                                AI 指挥官助手
                            </div>
                            {baiyeName && (
                                <div className="text-[9px] text-neutral-600 truncate">{baiyeName}</div>
                            )}
                        </div>
                        {/* Minimize */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-neutral-700 transition-colors text-sm font-bold"
                            title="收起"
                        >
                            ▼
                        </button>
                        {/* Close */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-neutral-700 transition-colors text-sm font-bold"
                            title="关闭"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Chat Content */}
                    <div className="flex-1 min-h-0 p-3">
                        {baiyeName ? (
                            <CommanderChat
                                baiyeId={baiyeId}
                                baiyeName={baiyeName}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-xs text-neutral-600">
                                正在加载...
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
