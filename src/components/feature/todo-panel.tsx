"use client";

import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Todo } from "@/types/app";
import { useEffect, useState } from "react";

interface TodoPanelProps {
    baiyeId: string;
    isAdmin: boolean;
}

const PRIORITY_CONFIG = {
    high: { label: '🔴 高', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
    medium: { label: '🟡 中', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    low: { label: '🟢 低', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
};

const STATUS_CONFIG = {
    todo: { label: '待处理', icon: '⬜', color: 'text-neutral-400' },
    doing: { label: '处理中', icon: '🔧', color: 'text-blue-400' },
    done: { label: '已完成', icon: '✅', color: 'text-green-400' },
};

const STATUS_CYCLE: Record<string, 'todo' | 'doing' | 'done'> = {
    todo: 'doing',
    doing: 'done',
    done: 'todo',
};

export function TodoPanel({ baiyeId, isAdmin }: TodoPanelProps) {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDone, setShowDone] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");

    const fetchTodos = async () => {
        try {
            const data = await SupabaseService.getTodosByBaiye(baiyeId);
            setTodos(data);
        } catch (e) {
            console.error("Failed to fetch todos:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTodos();
    }, [baiyeId]);

    const handleStatusToggle = async (todo: Todo) => {
        if (!isAdmin) return;
        const newStatus = STATUS_CYCLE[todo.status];
        try {
            await SupabaseService.updateTodoStatus(todo.id, newStatus);
            setTodos(prev => prev.map(t =>
                t.id === todo.id ? { ...t, status: newStatus } : t
            ));
        } catch (e: any) {
            alert("状态更新失败: " + e.message);
        }
    };

    const handleDelete = async (todoId: string) => {
        if (!confirm("确定删除这条优化计划？")) return;
        try {
            await SupabaseService.deleteTodo(todoId);
            setTodos(prev => prev.filter(t => t.id !== todoId));
        } catch (e: any) {
            alert("删除失败: " + e.message);
        }
    };

    const handleEdit = (todo: Todo) => {
        setEditingId(todo.id);
        setEditTitle(todo.title);
        setEditDesc(todo.description || "");
    };

    const handleSaveEdit = async (todoId: string) => {
        try {
            await SupabaseService.updateTodo(todoId, {
                title: editTitle,
                description: editDesc,
            });
            setTodos(prev => prev.map(t =>
                t.id === todoId ? { ...t, title: editTitle, description: editDesc } : t
            ));
            setEditingId(null);
        } catch (e: any) {
            alert("保存失败: " + e.message);
        }
    };

    const activeTodos = todos.filter(t => t.status !== 'done');
    const doneTodos = todos.filter(t => t.status === 'done');

    if (loading) {
        return (
            <PixelCard className="bg-neutral-800 space-y-2">
                <div className="text-xl font-bold text-purple-400 uppercase border-b-2 border-purple-400/20 pb-2">
                    📋 优化计划
                </div>
                <div className="text-xs text-neutral-500 text-center py-4">加载中...</div>
            </PixelCard>
        );
    }

    if (todos.length === 0) {
        return (
            <PixelCard className="bg-neutral-800 space-y-2">
                <div className="text-xl font-bold text-purple-400 uppercase border-b-2 border-purple-400/20 pb-2">
                    📋 优化计划
                </div>
                <div className="text-xs text-neutral-500 text-center py-4">暂无优化计划</div>
            </PixelCard>
        );
    }

    return (
        <PixelCard className="bg-neutral-800 space-y-3">
            <div className="flex justify-between items-center border-b-2 border-purple-400/20 pb-2">
                <div className="text-xl font-bold text-purple-400 uppercase">
                    📋 优化计划
                </div>
                <div className="text-xs text-neutral-500">
                    {activeTodos.length} 待办 / {doneTodos.length} 完成
                </div>
            </div>

            {/* Active Todos */}
            <div className="space-y-2">
                {activeTodos.map(todo => {
                    const priority = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.medium;
                    const status = STATUS_CONFIG[todo.status] || STATUS_CONFIG.todo;

                    if (editingId === todo.id) {
                        return (
                            <div key={todo.id} className={`border p-2 space-y-2 ${priority.bg}`}>
                                <input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white outline-none"
                                />
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    rows={2}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white outline-none resize-none"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleSaveEdit(todo.id)}
                                        className="text-xs text-green-400 hover:text-green-300 font-bold"
                                    >保存</button>
                                    <button
                                        onClick={() => setEditingId(null)}
                                        className="text-xs text-neutral-500 hover:text-white font-bold"
                                    >取消</button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={todo.id} className={`border p-2 ${priority.bg}`}>
                            <div className="flex items-start gap-2">
                                {/* Status toggle (admin clickable) */}
                                <button
                                    onClick={() => handleStatusToggle(todo)}
                                    disabled={!isAdmin}
                                    className={`text-sm mt-0.5 shrink-0 ${isAdmin ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
                                    title={isAdmin ? `点击切换到「${STATUS_CONFIG[STATUS_CYCLE[todo.status]].label}」` : status.label}
                                >
                                    {status.icon}
                                </button>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white truncate">{todo.title}</span>
                                        <span className={`text-[10px] font-bold shrink-0 ${priority.color}`}>
                                            {priority.label}
                                        </span>
                                    </div>
                                    {todo.description && (
                                        <div className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                                            {todo.description}
                                        </div>
                                    )}
                                    <div className={`text-[10px] mt-0.5 ${status.color}`}>
                                        {status.label}
                                    </div>
                                </div>

                                {/* Admin actions */}
                                {isAdmin && (
                                    <div className="flex gap-1 shrink-0">
                                        <button
                                            onClick={() => handleEdit(todo)}
                                            className="text-[10px] text-neutral-500 hover:text-yellow-400 transition-colors"
                                            title="编辑"
                                        >✏️</button>
                                        <button
                                            onClick={() => handleDelete(todo.id)}
                                            className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors"
                                            title="删除"
                                        >🗑️</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Done Todos Toggle */}
            {doneTodos.length > 0 && (
                <>
                    <button
                        onClick={() => setShowDone(!showDone)}
                        className="text-xs text-neutral-500 hover:text-white underline w-full text-left"
                    >
                        {showDone ? '▼' : '▶'} 已完成 ({doneTodos.length})
                    </button>

                    {showDone && (
                        <div className="space-y-1.5 opacity-60">
                            {doneTodos.map(todo => (
                                <div key={todo.id} className="border border-green-500/20 bg-green-500/5 p-2">
                                    <div className="flex items-start gap-2">
                                        <button
                                            onClick={() => handleStatusToggle(todo)}
                                            disabled={!isAdmin}
                                            className={`text-sm mt-0.5 shrink-0 ${isAdmin ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
                                        >
                                            ✅
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm text-neutral-400 line-through">{todo.title}</span>
                                            {todo.description && (
                                                <div className="text-xs text-neutral-500 mt-0.5 line-clamp-1 line-through">
                                                    {todo.description}
                                                </div>
                                            )}
                                        </div>
                                        {isAdmin && (
                                            <button
                                                onClick={() => handleDelete(todo.id)}
                                                className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors shrink-0"
                                            >🗑️</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </PixelCard>
    );
}
