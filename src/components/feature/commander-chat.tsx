"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    reasoning_steps?: ReasoningStep[];
    timestamp: number;
}

interface ReasoningStep {
    type: 'thinking' | 'skill_call' | 'skill_result' | 'answer';
    content: string;
    skill_name?: string;
    skill_args?: Record<string, any>;
    duration_ms?: number;
}

interface CommanderChatProps {
    baiyeId: string;
    baiyeName: string;
}

const STORAGE_KEY = 'baiye_chat_history';

const PRESETS = [
    {
        icon: '📣',
        label: '生成本周进度通报',
        text: '帮我看一下优化计划看板，总结一下最近已经完成的事项作为成果，然后列出当前处理中的任务作为本周目标。用简洁的纯文本格式写一段通报，适合直接复制发到微信群里，不要用markdown格式。语气正式但亲切，结尾督促大家继续配合推进。',
    },
    {
        icon: '⚔️',
        label: '最近战绩总览',
        text: '最近5场战绩如何？',
    },
    {
        icon: '📋',
        label: '待处理的优化项',
        text: '看板上还有哪些待处理的问题？',
    },
    {
        icon: '📝',
        label: '近期反馈热点',
        text: '最近反馈中最多人提到的问题是什么？',
    },
    {
        icon: '📊',
        label: '查看最新排表',
        text: '帮我查一下最新排表',
    },
];

const SKILL_LABELS: Record<string, string> = {
    list_matches: '查询对战列表',
    query_match: '查询对战详情',
    get_player_stats: '查询玩家统计',
    get_kanban_summary: '获取看板数据',
    get_roster: '获取排表',
    get_feedback_summary: '获取反馈汇总',
};

function genId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ═══ LocalStorage helpers ═══
function loadMessages(baiyeId: string): ChatMessage[] {
    try {
        const raw = localStorage.getItem(`${STORAGE_KEY}_${baiyeId}`);
        if (!raw) return [];
        const msgs = JSON.parse(raw) as ChatMessage[];
        // Keep last 50 messages to avoid storage bloat
        return msgs.slice(-50);
    } catch {
        return [];
    }
}

function saveMessages(baiyeId: string, messages: ChatMessage[]) {
    try {
        // Only persist last 50 messages
        const toSave = messages.slice(-50);
        localStorage.setItem(`${STORAGE_KEY}_${baiyeId}`, JSON.stringify(toSave));
    } catch { /* storage full, ignore */ }
}

// ═══ Reasoning Step Component ═══
function ReasoningBlock({ steps }: { steps: ReasoningStep[] }) {
    const [expanded, setExpanded] = useState(false);
    if (!steps || steps.length <= 1) return null;

    const visibleSteps = steps.filter(s => s.type !== 'answer');
    if (visibleSteps.length === 0) return null;

    const totalMs = steps.find(s => s.type === 'answer')?.duration_ms;

    return (
        <div className="mb-2">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors group"
            >
                <span className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>▶</span>
                <span className="flex items-center gap-1 flex-wrap">
                    <span className="text-purple-400/80">🧠</span>
                    <span>推理过程</span>
                    {visibleSteps.some(s => s.type === 'skill_call') && (
                        <span className="text-cyan-500/60">
                            · 调用了 {visibleSteps.filter(s => s.type === 'skill_call').map(s => SKILL_LABELS[s.skill_name || ''] || s.skill_name).join(', ')}
                        </span>
                    )}
                    {totalMs && <span className="text-neutral-600">· {(totalMs / 1000).toFixed(1)}s</span>}
                </span>
            </button>

            {expanded && (
                <div className="mt-1.5 ml-3 border-l-2 border-neutral-700/50 pl-3 space-y-2">
                    {visibleSteps.map((step, i) => (
                        <div key={i} className="text-[11px]">
                            {step.type === 'thinking' && (
                                <div className="space-y-0.5">
                                    <div className="text-purple-400/70 font-bold flex items-center gap-1">
                                        <span>💭</span> 思考
                                    </div>
                                    <div className="text-neutral-500 whitespace-pre-wrap">{step.content}</div>
                                </div>
                            )}
                            {step.type === 'skill_call' && (
                                <div className="space-y-0.5">
                                    <div className="text-cyan-400/70 font-bold flex items-center gap-1">
                                        <span>🔧</span> {SKILL_LABELS[step.skill_name || ''] || step.skill_name}
                                    </div>
                                    {step.skill_args && Object.keys(step.skill_args).length > 0 && (
                                        <div className="text-neutral-600 font-mono bg-neutral-800/50 px-2 py-1 rounded">
                                            {JSON.stringify(step.skill_args)}
                                        </div>
                                    )}
                                </div>
                            )}
                            {step.type === 'skill_result' && (
                                <div className="space-y-0.5">
                                    <div className="text-green-400/70 font-bold flex items-center gap-1">
                                        <span>📦</span> 数据返回
                                        {step.duration_ms && <span className="text-neutral-600 font-normal">({step.duration_ms}ms)</span>}
                                    </div>
                                    <div className="text-neutral-500 whitespace-pre-wrap max-h-32 overflow-y-auto bg-neutral-800/30 px-2 py-1 rounded text-[10px] font-mono"
                                        style={{ scrollbarColor: '#525252 transparent' }}
                                    >
                                        {step.content}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══ Typewriter Hook ═══
function useTypewriter(text: string, speed: number = 15): string {
    const [displayed, setDisplayed] = useState('');
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        setDisplayed('');
        setIsComplete(false);
        if (!text) return;

        let idx = 0;
        const interval = setInterval(() => {
            idx++;
            const chunk = Math.min(idx, text.length);
            setDisplayed(text.slice(0, chunk));
            if (chunk >= text.length) {
                clearInterval(interval);
                setIsComplete(true);
            }
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed]);

    return isComplete ? text : displayed;
}

// ═══ Main Component ═══
export function CommanderChat({ baiyeId, baiyeName }: CommanderChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [latestReply, setLatestReply] = useState('');
    const [hydrated, setHydrated] = useState(false);

    const displayedReply = useTypewriter(latestReply, 12);

    // Load from localStorage on mount
    useEffect(() => {
        const saved = loadMessages(baiyeId);
        if (saved.length > 0) {
            setMessages(saved);
        }
        setHydrated(true);
    }, [baiyeId]);

    // Save to localStorage when messages change
    useEffect(() => {
        if (hydrated && messages.length > 0) {
            saveMessages(baiyeId, messages);
        }
    }, [messages, baiyeId, hydrated]);

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, displayedReply]);

    const send = useCallback(async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMsg: ChatMessage = {
            id: genId(),
            role: 'user',
            content: text.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        setLatestReply('');

        try {
            // Build message history for API (keep last 10 messages for context)
            const history = [...messages, userMsg]
                .slice(-10)
                .map(m => ({ role: m.role, content: m.content }));

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baiye_id: baiyeId,
                    baiye_name: baiyeName,
                    messages: history,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Chat request failed');
            }

            const aiMsg: ChatMessage = {
                id: genId(),
                role: 'assistant',
                content: data.reply || '(无回复)',
                reasoning_steps: data.reasoning_steps,
                timestamp: Date.now(),
            };

            setMessages(prev => [...prev, aiMsg]);
            setLatestReply(data.reply || '');
        } catch (e: any) {
            const errMsg: ChatMessage = {
                id: genId(),
                role: 'assistant',
                content: `❌ 请求失败: ${e.message}`,
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, errMsg]);
        } finally {
            setIsLoading(false);
        }
    }, [baiyeId, baiyeName, isLoading, messages]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setLatestReply('');
        try {
            localStorage.removeItem(`${STORAGE_KEY}_${baiyeId}`);
        } catch { /* ignore */ }
    }, [baiyeId]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    const isEmpty = messages.length === 0;
    const lastAiMsgIdx = messages.length - 1;
    const lastMsg = messages[lastAiMsgIdx];
    const isLastMsgAI = lastMsg?.role === 'assistant';

    return (
        <div className="flex flex-col h-full">
            {/* Messages Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0"
                style={{ scrollbarColor: '#525252 transparent' }}
            >
                {/* Empty State: Preset Questions */}
                {isEmpty && !isLoading && (
                    <div className="space-y-3 py-3">
                        <div className="text-center space-y-1.5">
                            <div className="text-2xl">🤖</div>
                            <div className="text-xs text-neutral-400">
                                你好，指挥官。我是你的 AI 战术助手
                            </div>
                            <div className="text-[10px] text-neutral-600">
                                查询战绩 · 分析数据 · 跟踪计划 · 生成通报
                            </div>
                        </div>
                        <div className="space-y-1 mt-3">
                            {PRESETS.map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => send(p.text)}
                                    className="w-full text-left px-3 py-2 text-[11px] border border-neutral-700/60 bg-neutral-800/40 text-neutral-300 hover:bg-neutral-700/40 hover:border-neutral-600 hover:text-white transition-all flex items-center gap-2 group"
                                >
                                    <span className="shrink-0">{p.icon}</span>
                                    <span className="font-bold">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Restored History Indicator */}
                {!isEmpty && hydrated && (
                    <div className="text-center py-1">
                        <span className="text-[9px] text-neutral-700 bg-neutral-800/50 px-2 py-0.5 rounded">
                            💾 已恢复 {messages.length} 条历史消息
                        </span>
                    </div>
                )}

                {/* Message List */}
                {messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const isLatestAI = !isUser && idx === lastAiMsgIdx && isLastMsgAI;
                    const content = isLatestAI && latestReply ? displayedReply : msg.content;

                    return (
                        <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[92%] ${isUser ? 'ml-4' : 'mr-4'}`}>
                                {/* Reasoning block (AI only) */}
                                {!isUser && msg.reasoning_steps && (
                                    <ReasoningBlock steps={msg.reasoning_steps} />
                                )}

                                {/* Message bubble */}
                                <div className={`px-3 py-2 text-xs leading-relaxed ${isUser
                                    ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-100'
                                    : 'bg-neutral-800/80 border border-neutral-700/50 text-neutral-200'
                                }`}>
                                    <div className="whitespace-pre-wrap break-words">{content}</div>
                                </div>

                                {/* Timestamp */}
                                <div className={`text-[9px] text-neutral-700 mt-0.5 ${isUser ? 'text-right' : 'text-left'}`}>
                                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="px-3 py-2.5 bg-neutral-800/60 border border-neutral-700/50">
                            <div className="flex items-center gap-2 text-xs text-neutral-400">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-cyan-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-1.5 bg-cyan-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-1.5 bg-cyan-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span>AI 正在分析...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="mt-2 pt-2 border-t border-neutral-700/50">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="问我任何关于战绩、排表、反馈的问题..."
                        disabled={isLoading}
                        rows={1}
                        className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-xs text-white outline-none resize-none placeholder:text-neutral-600 focus:border-cyan-500/50 transition-colors disabled:opacity-50"
                        style={{ minHeight: '36px', maxHeight: '80px' }}
                        onInput={(e) => {
                            const t = e.target as HTMLTextAreaElement;
                            t.style.height = 'auto';
                            t.style.height = Math.min(t.scrollHeight, 80) + 'px';
                        }}
                    />
                    <button
                        onClick={() => send(input)}
                        disabled={isLoading || !input.trim()}
                        className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-bold border-2 border-cyan-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    >
                        {isLoading ? '...' : '发送'}
                    </button>
                </div>
                <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-neutral-700">Enter 发送 · Shift+Enter 换行</span>
                    {messages.length > 0 && (
                        <button
                            onClick={clearChat}
                            className="text-[9px] text-neutral-600 hover:text-red-400 transition-colors"
                        >
                            🗑 清空对话
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
