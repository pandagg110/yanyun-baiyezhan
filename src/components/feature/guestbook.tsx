"use client";

import { PixelButton } from "@/components/pixel/pixel-button";
import { SupabaseService } from "@/services/supabase-service";
import { GuestbookMessage, User } from "@/types/app";
import { useEffect, useState } from "react";

interface GuestbookProps {
    type: 'global' | 'baiye' | 'room';
    targetId?: string;
    className?: string; // Optional custom styling wrapper
}

export function Guestbook({ type, targetId, className = "" }: GuestbookProps) {
    const [messages, setMessages] = useState<GuestbookMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [content, setContent] = useState("");
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // Initial load
    useEffect(() => {
        const init = async () => {
            const u = await SupabaseService.getUser();
            setCurrentUser(u);
            await fetchMessages();
        };
        init();

        // Polling for new messages every 10s
        const interval = setInterval(fetchMessages, 10000);
        return () => clearInterval(interval);
    }, [type, targetId]);

    const fetchMessages = async () => {
        try {
            const msgs = await SupabaseService.getGuestbookMessages(type, targetId);
            setMessages(msgs);
        } catch (e) {
            console.error("Fetch guestbook failed:", e);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!currentUser || !content.trim()) return;

        setSending(true);
        try {
            // Optimistic update (optional, but let's just wait for server to be safe)
            await SupabaseService.postGuestbookMessage(currentUser.id, content, type, targetId);
            setContent("");
            await fetchMessages(); // refresh list
        } catch (e: any) {
            alert("留言失败: " + e.message);
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (msgId: string) => {
        if (!confirm("确定删除这条留言吗？")) return;
        try {
            await SupabaseService.deleteGuestbookMessage(msgId);
            setMessages(prev => prev.filter(m => m.id !== msgId));
        } catch (e: any) {
            alert("删除失败: " + e.message);
        }
    };

    const canDelete = (msg: GuestbookMessage) => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin' || currentUser.role === 'vip') return true;
        return currentUser.id === msg.author_id;
    };

    return (
        <div className={`flex flex-col gap-4 border-4 border-black bg-neutral-800 p-4 ${className}`}>
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-white/10 pb-2 mb-2">
                <h3 className="text-yellow-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                    <span className="animate-pulse">●</span> GUESTBOOK
                </h3>
                <span className="text-xs text-neutral-500 font-mono">
                    {loading ? "SYNCING..." : "LIVE"}
                </span>
            </div>

            {/* Message List */}
            <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {messages.length === 0 && !loading && (
                    <div className="text-center text-neutral-600 text-xs py-8 italic border-2 border-dashed border-neutral-700">
                        No transmissions recorded.
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className="group relative flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Avatar */}
                        <div className="shrink-0 w-8 h-8 md:w-10 md:h-10 border-2 border-neutral-600 bg-black overflow-hidden">
                            {msg.author?.avatar_url && msg.author.avatar_url !== 'default' ? (
                                <img src={msg.author.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-white text-xs font-bold">
                                    {msg.author?.character_name?.charAt(0) || '?'}
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 bg-neutral-900/50 p-2 border border-neutral-700/50 rounded-r-lg rounded-bl-lg relative">
                            {/* Meta */}
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-neutral-400 group-hover:text-yellow-500 transition-colors">
                                    {msg.author?.character_name || 'Unknown'} <span className="opacity-50 text-[10px] ml-1">{msg.author?.role === 'admin' ? '[ADM]' : msg.author?.role === 'vip' ? '[VIP]' : ''}</span>
                                </span>
                                <span className="text-[10px] text-neutral-600 font-mono">
                                    {new Date(msg.created_at).toLocaleString()}
                                </span>
                            </div>

                            {/* Body */}
                            <p className="text-sm text-neutral-300 whitespace-pre-wrap break-words leading-relaxed">
                                {msg.content}
                            </p>

                            {/* Delete Action (Hover Only) */}
                            {canDelete(msg) && (
                                <button
                                    onClick={() => handleDelete(msg.id)}
                                    className="absolute top-0 right-0 -mt-2 -mr-2 bg-red-600 text-white w-5 h-5 flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity border border-black shadow-sm"
                                    title="Delete Message"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input Area */}
            {currentUser && (
                <div className="mt-2 flex flex-col gap-2 pt-4 border-t border-neutral-700">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Transmitting message..."
                        className="w-full bg-black border-2 border-neutral-700 p-2 text-sm text-white focus:border-yellow-500 outline-none min-h-[60px] resize-y font-sans"
                        maxLength={500}
                    />
                    <div className="flex justify-end">
                        <PixelButton
                            size="sm"
                            onClick={handleSend}
                            isLoading={sending}
                            disabled={!content.trim()}
                        >
                            SEND &gt;
                        </PixelButton>
                    </div>
                </div>
            )}
        </div>
    );
}
