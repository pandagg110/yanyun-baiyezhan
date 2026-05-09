"use client";

import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Todo } from "@/types/app";
import { useEffect, useState, useRef, useCallback } from "react";

interface ImprovementKanbanProps {
    baiyeId: string;
    isAdmin: boolean;
    refreshKey: number;
    onSelectTodo?: (todo: Todo | null) => void;
    selectedTodoId?: string | null;
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    high: { label: '🔴 高', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    medium: { label: '🟡 中', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    low: { label: '🟢 低', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
};

const STATUS_CYCLE: Record<string, 'todo' | 'doing' | 'done'> = { todo: 'doing', doing: 'done', done: 'todo' };

const STATUS_CFG: Record<string, { label: string; icon: string; hColor: string; borderColor: string; dropBg: string }> = {
    todo: { label: '待处理', icon: '⬜', hColor: 'text-orange-400', borderColor: 'border-orange-500/30', dropBg: 'bg-orange-500/10' },
    doing: { label: '处理中', icon: '🔧', hColor: 'text-blue-400', borderColor: 'border-blue-500/30', dropBg: 'bg-blue-500/10' },
    done: { label: '已完成', icon: '✅', hColor: 'text-green-400', borderColor: 'border-green-500/30', dropBg: 'bg-green-500/10' },
};

const PRI_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function ImprovementKanban({ baiyeId, isAdmin, refreshKey, onSelectTodo, selectedTodoId }: ImprovementKanbanProps) {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");

    // Drag-and-drop state
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try { setTodos(await SupabaseService.getTodosByBaiye(baiyeId)); }
            catch (e) { console.error("Failed to fetch todos:", e); }
            finally { setLoading(false); }
        })();
    }, [baiyeId, refreshKey]);

    const toggle = async (todo: Todo) => {
        if (!isAdmin) return;
        const ns = STATUS_CYCLE[todo.status];
        try { await SupabaseService.updateTodoStatus(todo.id, ns); setTodos(p => p.map(t => t.id === todo.id ? { ...t, status: ns } : t)); }
        catch (e: any) { alert("状态更新失败: " + e.message); }
    };

    const del = async (id: string) => {
        if (!confirm("确定删除？")) return;
        try { await SupabaseService.deleteTodo(id); setTodos(p => p.filter(t => t.id !== id)); if (selectedTodoId === id) onSelectTodo?.(null); }
        catch (e: any) { alert("删除失败: " + e.message); }
    };

    const save = async (id: string) => {
        try { await SupabaseService.updateTodo(id, { title: editTitle, description: editDesc }); setTodos(p => p.map(t => t.id === id ? { ...t, title: editTitle, description: editDesc } : t)); setEditingId(null); }
        catch (e: any) { alert("保存失败: " + e.message); }
    };

    const sort = (items: Todo[]) => [...items].sort((a, b) => (PRI_ORDER[a.priority] ?? 1) - (PRI_ORDER[b.priority] ?? 1));

    // --- Drag-and-drop handlers ---
    const handleDragStart = useCallback((e: React.DragEvent, todoId: string) => {
        if (!isAdmin) { e.preventDefault(); return; }
        setDragId(todoId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', todoId);
        // Make the drag ghost slightly transparent
        if (e.currentTarget instanceof HTMLElement) {
            setTimeout(() => {
                (e.currentTarget as HTMLElement).style.opacity = '0.4';
            }, 0);
        }
    }, [isAdmin]);

    const handleDragEnd = useCallback((e: React.DragEvent) => {
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '1';
        }
        setDragId(null);
        setDragOverCol(null);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverCol(status);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent, status: string) => {
        // Only clear if we're actually leaving the column (not entering a child)
        const relatedTarget = e.relatedTarget as Node | null;
        if (relatedTarget && e.currentTarget.contains(relatedTarget)) return;
        if (dragOverCol === status) setDragOverCol(null);
    }, [dragOverCol]);

    const handleDrop = useCallback(async (e: React.DragEvent, newStatus: 'todo' | 'doing' | 'done') => {
        e.preventDefault();
        setDragOverCol(null);
        const todoId = e.dataTransfer.getData('text/plain');
        if (!todoId || !isAdmin) return;
        const todo = todos.find(t => t.id === todoId);
        if (!todo || todo.status === newStatus) return;
        // Optimistic update
        setTodos(p => p.map(t => t.id === todoId ? { ...t, status: newStatus } : t));
        try {
            await SupabaseService.updateTodoStatus(todoId, newStatus);
        } catch (e: any) {
            // Rollback on failure
            setTodos(p => p.map(t => t.id === todoId ? { ...t, status: todo.status } : t));
            alert("状态更新失败: " + e.message);
        }
    }, [isAdmin, todos]);

    const cols: { s: 'todo' | 'doing' | 'done'; items: Todo[] }[] = [
        { s: 'todo', items: sort(todos.filter(t => t.status === 'todo')) },
        { s: 'doing', items: sort(todos.filter(t => t.status === 'doing')) },
        { s: 'done', items: sort(todos.filter(t => t.status === 'done')) },
    ];

    if (loading) return <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">加载中...</div>;

    return (
        <div className="flex-1 min-h-0">
            <div className="flex items-center gap-3 mb-3 text-xs text-neutral-500">
                <span>共 {todos.length} 条</span><span>•</span>
                <span className="text-orange-400">{cols[0].items.length} 待处理</span>
                <span className="text-blue-400">{cols[1].items.length} 进行中</span>
                <span className="text-green-400">{cols[2].items.length} 已完成</span>
                {isAdmin && <span className="ml-auto text-neutral-600 text-[10px]">💡 拖拽卡片到其他列可更新状态</span>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {cols.map(({ s, items }) => {
                    const c = STATUS_CFG[s];
                    const isDropTarget = dragId && dragOverCol === s;
                    const draggedTodo = dragId ? todos.find(t => t.id === dragId) : null;
                    const isSameCol = draggedTodo?.status === s;
                    return (
                        <div
                            key={s}
                            className={`space-y-2 rounded transition-all duration-200 ${isDropTarget && !isSameCol ? `ring-2 ring-offset-2 ring-offset-neutral-900 ${s === 'todo' ? 'ring-orange-500/50' : s === 'doing' ? 'ring-blue-500/50' : 'ring-green-500/50'}` : ''}`}
                            onDragOver={(e) => handleDragOver(e, s)}
                            onDragLeave={(e) => handleDragLeave(e, s)}
                            onDrop={(e) => handleDrop(e, s)}
                        >
                            <div className={`flex items-center gap-2 pb-1.5 border-b-2 ${c.borderColor}`}>
                                <span className="text-sm">{c.icon}</span>
                                <span className={`text-sm font-bold uppercase ${c.hColor}`}>{c.label}</span>
                                <span className="text-[10px] text-neutral-600 ml-auto">{items.length}</span>
                            </div>
                            <div
                                className={`space-y-2 overflow-y-auto pr-1 min-h-[100px] transition-colors duration-200 ${isDropTarget && !isSameCol ? c.dropBg + ' rounded p-1' : ''}`}
                                style={{
                                    maxHeight: 'calc(100vh - 240px)',
                                    scrollbarColor: '#525252 transparent',
                                }}
                            >
                                {items.length === 0 ? (
                                    <div className={`text-xs text-neutral-600 text-center py-6 border border-dashed border-neutral-700 ${isDropTarget && !isSameCol ? 'border-white/30 text-neutral-400' : ''}`}>
                                        {isDropTarget && !isSameCol ? `拖放到此处 → ${c.label}` : '暂无'}
                                    </div>
                                ) : items.map(todo => {
                                    const p = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.medium;
                                    const sel = selectedTodoId === todo.id;
                                    const reopened = (todo.reopen_count || 0) > 0;
                                    const isDragging = dragId === todo.id;

                                    if (editingId === todo.id) return (
                                        <div key={todo.id} className={`border p-2.5 space-y-2 ${p.bg} ${p.border}`}>
                                            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white outline-none" />
                                            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white outline-none resize-none" />
                                            <div className="flex gap-2">
                                                <button onClick={() => save(todo.id)} className="text-xs text-green-400 hover:text-green-300 font-bold">保存</button>
                                                <button onClick={() => setEditingId(null)} className="text-xs text-neutral-500 hover:text-white font-bold">取消</button>
                                            </div>
                                        </div>
                                    );

                                    return (
                                        <div
                                            key={todo.id}
                                            draggable={isAdmin}
                                            onDragStart={(e) => handleDragStart(e, todo.id)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => onSelectTodo?.(sel ? null : todo)}
                                            className={`border p-2.5 cursor-pointer transition-all hover:bg-white/5 ${p.bg} ${p.border} ${sel ? 'ring-1 ring-yellow-500/60 bg-yellow-500/5' : ''} ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-40' : ''}`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <button onClick={e => { e.stopPropagation(); toggle(todo); }} disabled={!isAdmin}
                                                    className={`text-sm mt-0.5 shrink-0 ${isAdmin ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}>
                                                    {STATUS_CFG[todo.status]?.icon || '⬜'}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {/* Title: no truncate, allow full text display */}
                                                        <span className={`text-sm font-bold break-words ${todo.status === 'done' ? 'text-neutral-500 line-through' : 'text-white'}`}>{todo.title}</span>
                                                        <span className={`text-[10px] font-bold shrink-0 ${p.color}`}>{p.label}</span>
                                                        {reopened && <span className="text-[10px] bg-red-500/20 text-red-400 px-1 py-px font-bold shrink-0">🔄 ×{todo.reopen_count}</span>}
                                                    </div>
                                                    {/* Description: no line-clamp, show full text */}
                                                    {todo.description && <div className={`text-xs mt-0.5 break-words ${todo.status === 'done' ? 'text-neutral-600 line-through' : 'text-neutral-400'}`}>{todo.description}</div>}
                                                    {todo.keywords && todo.keywords.length > 0 && (
                                                        <div className="flex gap-1 mt-1 flex-wrap">
                                                            {todo.keywords.slice(0, 3).map((kw, i) => <span key={i} className="text-[9px] bg-neutral-700/80 text-neutral-400 px-1.5 py-px rounded">{kw}</span>)}
                                                        </div>
                                                    )}
                                                    {todo.related_match_ids && todo.related_match_ids.length > 0 && (
                                                        <div className="text-[10px] text-cyan-500/70 mt-1">🔗 关联 {todo.related_match_ids.length} 场对战</div>
                                                    )}
                                                </div>
                                                {isAdmin && (
                                                    <div className="flex gap-1 shrink-0">
                                                        <button onClick={e => { e.stopPropagation(); setEditingId(todo.id); setEditTitle(todo.title); setEditDesc(todo.description || ""); }} className="text-[10px] text-neutral-500 hover:text-yellow-400">✏️</button>
                                                        <button onClick={e => { e.stopPropagation(); del(todo.id); }} className="text-[10px] text-neutral-500 hover:text-red-400">🗑️</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {/* Extra drop zone at bottom when there are items */}
                                {items.length > 0 && isDropTarget && !isSameCol && (
                                    <div className="text-[10px] text-center py-2 border border-dashed border-white/20 text-neutral-400 rounded">
                                        松开放置 → {c.label}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
