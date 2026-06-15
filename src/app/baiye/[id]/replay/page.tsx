"use client";

import { PixelCard } from "@/components/pixel/pixel-card";
import { SupabaseService } from "@/services/supabase-service";
import { Baiye, ReplayReview, User } from "@/types/app";
import {
    BarChart3,
    CalendarDays,
    Camera,
    ChevronRight,
    CheckCircle2,
    ClipboardList,
    ImagePlus,
    Loader2,
    Send,
    ShieldCheck,
    Sparkles,
    Target,
    UserRound,
    UsersRound,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

function toDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getWeekStart(value?: string) {
    const date = value ? new Date(`${value}T00:00:00`) : new Date();
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return toDateInput(date);
}

function formatDate(value?: string | null) {
    if (!value) return "-";
    return new Date(`${value}T00:00:00`).toLocaleDateString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
    });
}

function formatWeekLabel(weekStart: string) {
    const start = new Date(`${weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${formatDate(weekStart)} - ${formatDate(toDateInput(end))}`;
}

function splitPoints(text: string) {
    return text
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*、\d.\s]+/, "").trim())
        .filter(Boolean);
}

function parseTags(text: string) {
    return text
        .split(/[,，、\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8);
}

function groupByWeek(reviews: ReplayReview[]) {
    const map = new Map<string, ReplayReview[]>();
    for (const review of reviews) {
        const key = review.week_start;
        map.set(key, [...(map.get(key) || []), review]);
    }
    return map;
}

function StatTile({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: typeof BarChart3;
    label: string;
    value: string | number;
    tone: string;
}) {
    return (
        <div className="border-4 border-black bg-neutral-800 p-4 shadow-[4px_4px_0_0_#000]">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{label}</span>
                <Icon className={`h-5 w-5 ${tone}`} />
            </div>
            <div className="mt-3 text-3xl font-black text-white">{value}</div>
        </div>
    );
}

function ReviewCard({ review }: { review: ReplayReview }) {
    const points = splitPoints(review.review_points);

    return (
        <article className="border-4 border-black bg-neutral-800 p-4 shadow-[4px_4px_0_0_#000]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-cyan-500 px-2 py-1 text-[10px] font-black uppercase text-black">
                            {formatDate(review.review_date)}
                        </span>
                        {review.reviewer_name && (
                            <span className="text-xs font-bold text-neutral-500">
                                by {review.reviewer_name}
                            </span>
                        )}
                    </div>
                    <h3 className="mt-2 text-lg font-black text-white">
                        {review.review_title || "录屏复盘"}
                    </h3>
                </div>
                {review.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 md:justify-end">
                        {review.tags.map((tag) => (
                            <span
                                key={tag}
                                className="border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-4 space-y-2">
                {points.length > 0 ? (
                    points.map((point, index) => (
                        <div key={`${review.id}-${index}`} className="flex gap-3">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-yellow-500 text-[10px] font-black text-black">
                                {index + 1}
                            </span>
                            <p className="text-sm leading-relaxed text-neutral-200">{point}</p>
                        </div>
                    ))
                ) : (
                    <p className="text-sm leading-relaxed text-neutral-200">{review.review_points}</p>
                )}
            </div>

            {review.image_urls?.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {review.image_urls.map((url, index) => (
                        <a
                            key={`${url}-${index}`}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative aspect-video overflow-hidden border-2 border-neutral-700 bg-neutral-900"
                        >
                            <img
                                src={url}
                                alt={`${review.target_name} 复盘截图 ${index + 1}`}
                                className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                            />
                            <span className="absolute right-1 top-1 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {index + 1}
                            </span>
                        </a>
                    ))}
                </div>
            )}
        </article>
    );
}

export default function ReplayReviewPage() {
    const params = useParams();
    const router = useRouter();
    const baiyeId = params.id as string;
    const fileRef = useRef<HTMLInputElement>(null);

    const [user, setUser] = useState<User | null>(null);
    const [baiye, setBaiye] = useState<Baiye | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewerReviews, setViewerReviews] = useState<ReplayReview[]>([]);
    const [adminReviews, setAdminReviews] = useState<ReplayReview[]>([]);
    const [viewerWeek, setViewerWeek] = useState(getWeekStart());
    const [adminWeek, setAdminWeek] = useState(getWeekStart());
    const [activePanel, setActivePanel] = useState<"mine" | "admin">("mine");
    const [selectedAdminTarget, setSelectedAdminTarget] = useState<string | null>(null);

    const [targetName, setTargetName] = useState("");
    const [reviewDate, setReviewDate] = useState(toDateInput(new Date()));
    const [reviewTitle, setReviewTitle] = useState("");
    const [reviewPoints, setReviewPoints] = useState("");
    const [tagsInput, setTagsInput] = useState("");
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const isAdmin = user?.role === "admin";

    const fetchViewerReviews = async (profile: User) => {
        const rows = await SupabaseService.getReplayReviews(baiyeId, {
            targetName: profile.character_name,
            limit: 200,
        });
        setViewerReviews(rows);
        if (rows.length > 0 && !rows.some((row) => row.week_start === viewerWeek)) {
            setViewerWeek(rows[0].week_start);
        }
    };

    const fetchAdminReviews = async (week = adminWeek, options?: { fallbackToLatest?: boolean }) => {
        const rows = await SupabaseService.getReplayReviews(baiyeId, { limit: 1000 });
        setAdminReviews(rows);
        if (options?.fallbackToLatest && rows.length > 0 && !rows.some((row) => row.week_start === week)) {
            setAdminWeek(rows[0].week_start);
        }
    };

    useEffect(() => {
        const init = async () => {
            const currentUser = await SupabaseService.getUser();
            if (!currentUser) {
                router.push("/login");
                return;
            }
            setUser(currentUser);
            setTargetName(currentUser.character_name);
            if (
                currentUser.role === "admin" &&
                typeof window !== "undefined" &&
                new URLSearchParams(window.location.search).get("mode") === "admin"
            ) {
                setActivePanel("admin");
            }

            const currentBaiye = await SupabaseService.getBaiye(baiyeId);
            if (!currentBaiye) {
                router.push("/baiye");
                return;
            }
            setBaiye(currentBaiye);

            await fetchViewerReviews(currentUser);
            if (currentUser.role === "admin") {
                await fetchAdminReviews(adminWeek, { fallbackToLatest: true });
            }
            setLoading(false);
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baiyeId, router]);

    const viewerWeeks = useMemo(
        () => [...groupByWeek(viewerReviews).keys()].sort((a, b) => b.localeCompare(a)),
        [viewerReviews]
    );
    const viewerWeekMap = useMemo(() => groupByWeek(viewerReviews), [viewerReviews]);
    const currentViewerReviews = viewerWeekMap.get(viewerWeek) || [];
    const currentViewerPoints = currentViewerReviews.flatMap((review) => splitPoints(review.review_points));
    const imageCount = currentViewerReviews.reduce((sum, review) => sum + (review.image_urls?.length || 0), 0);
    const allTags = [...new Set(currentViewerReviews.flatMap((review) => review.tags || []))];

    const trendWeeks = useMemo(() => {
        return viewerWeeks.slice(0, 8).reverse().map((week) => {
            const rows = viewerWeekMap.get(week) || [];
            return {
                week,
                records: rows.length,
                points: rows.reduce((sum, row) => sum + splitPoints(row.review_points).length, 0),
            };
        });
    }, [viewerWeekMap, viewerWeeks]);
    const maxTrendPoints = Math.max(1, ...trendWeeks.map((item) => item.points));
    const adminWeeks = useMemo(
        () => [...new Set(adminReviews.map((review) => review.week_start))].sort((a, b) => b.localeCompare(a)),
        [adminReviews]
    );
    const currentAdminReviews = useMemo(
        () => adminReviews.filter((review) => review.week_start === adminWeek),
        [adminReviews, adminWeek]
    );

    const adminSummary = useMemo(() => {
        const map = new Map<string, { name: string; records: number; points: number; images: number; latest: string }>();
        for (const review of currentAdminReviews) {
            const current = map.get(review.target_name) || {
                name: review.target_name,
                records: 0,
                points: 0,
                images: 0,
                latest: review.review_date,
            };
            current.records += 1;
            current.points += splitPoints(review.review_points).length || 1;
            current.images += review.image_urls?.length || 0;
            if (review.review_date > current.latest) current.latest = review.review_date;
            map.set(review.target_name, current);
        }
        return [...map.values()].sort((a, b) => b.records - a.records || a.name.localeCompare(b.name, "zh-CN"));
    }, [currentAdminReviews]);
    const selectedAdminReviews = useMemo(
        () => currentAdminReviews.filter((review) => review.target_name === selectedAdminTarget),
        [currentAdminReviews, selectedAdminTarget]
    );

    useEffect(() => {
        if (adminSummary.length === 0) {
            setSelectedAdminTarget(null);
            return;
        }
        if (!selectedAdminTarget || !adminSummary.some((row) => row.name === selectedAdminTarget)) {
            setSelectedAdminTarget(adminSummary[0].name);
        }
    }, [adminSummary, selectedAdminTarget]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
        if (files.length === 0) return;

        setImageFiles((prev) => [...prev, ...files].slice(0, 8));
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setImagePreviews((prev) => [...prev, e.target?.result as string].slice(0, 8));
            };
            reader.readAsDataURL(file);
        }
        event.target.value = "";
    };

    const removeImage = (index: number) => {
        setImageFiles((prev) => prev.filter((_, i) => i !== index));
        setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!isAdmin || !user) return;
        if (!targetName.trim()) return alert("请输入被复盘人的名字");
        if (!reviewPoints.trim()) return alert("请填写复盘要点");

        setSubmitting(true);
        setMessage(null);
        try {
            const urls: string[] = [];
            for (const file of imageFiles) {
                urls.push(await SupabaseService.uploadFile(file, "screenshots"));
            }

            const submittedWeek = getWeekStart(reviewDate);
            const submittedTarget = targetName.trim();

            await SupabaseService.createReplayReview({
                baiye_id: baiyeId,
                target_name: submittedTarget,
                reviewer_id: user.id,
                reviewer_name: user.character_name,
                review_title: reviewTitle,
                review_points: reviewPoints,
                image_urls: urls,
                week_start: submittedWeek,
                review_date: reviewDate,
                tags: parseTags(tagsInput),
            });

            setReviewTitle("");
            setReviewPoints("");
            setTagsInput("");
            setImageFiles([]);
            setImagePreviews([]);
            setMessage("复盘记录已提交");
            setAdminWeek(submittedWeek);
            setSelectedAdminTarget(submittedTarget);
            await fetchAdminReviews(submittedWeek);
            await fetchViewerReviews(user);
        } catch (error: unknown) {
            console.error(error);
            const message = error instanceof Error ? error.message : JSON.stringify(error);
            alert("提交失败: " + message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-neutral-900 text-white">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-yellow-500" />
                正在加载...
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-neutral-900 text-white">
            <header className="sticky top-0 z-30 border-b-4 border-black bg-neutral-900/95 backdrop-blur-sm">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-8">
                    <div>
                        <button
                            onClick={() => router.push(`/baiye/${baiyeId}/hall`)}
                            className="mb-1 text-xs font-bold text-neutral-500 transition-colors hover:text-white"
                        >
                            返回百业大厅
                        </button>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center border-4 border-black bg-cyan-500 shadow-[3px_3px_0_0_#000]">
                                <Camera className="h-5 w-5 text-black" />
                            </span>
                            <div>
                                <h1 className="text-2xl font-black text-white">录屏复盘</h1>
                                <p className="text-xs font-bold text-neutral-500">{baiye?.name} / {user?.character_name}</p>
                            </div>
                        </div>
                    </div>

                    {isAdmin && (
                        <div className="flex gap-2">
                            {([
                                { key: "mine", label: "我的复盘", icon: UserRound },
                                { key: "admin", label: "复盘管理", icon: ShieldCheck },
                            ] as const).map((item) => (
                                <button
                                    key={item.key}
                                    onClick={() => setActivePanel(item.key)}
                                    className={`flex items-center gap-2 border-2 px-3 py-2 text-xs font-black transition-colors ${
                                        activePanel === item.key
                                            ? "border-yellow-500 bg-yellow-500 text-black"
                                            : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-500"
                                    }`}
                                >
                                    <item.icon className="h-4 w-4" />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
                {activePanel === "mine" && (
                    <div className="space-y-6">
                        <section className="grid gap-4 md:grid-cols-4">
                            <StatTile icon={ClipboardList} label="本周记录" value={currentViewerReviews.length} tone="text-cyan-400" />
                            <StatTile icon={Target} label="复盘要点" value={currentViewerPoints.length} tone="text-yellow-400" />
                            <StatTile icon={ImagePlus} label="截图证据" value={imageCount} tone="text-emerald-400" />
                            <StatTile icon={Sparkles} label="标签数量" value={allTags.length} tone="text-rose-400" />
                        </section>

                        <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
                            <div className="space-y-4">
                                <PixelCard className="bg-neutral-800">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black text-yellow-500">
                                        <CalendarDays className="h-4 w-4" />
                                        周期
                                    </div>
                                    <select
                                        value={viewerWeek}
                                        onChange={(e) => setViewerWeek(e.target.value)}
                                        className="w-full border-2 border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-500"
                                    >
                                        {viewerWeeks.length === 0 && <option value={viewerWeek}>{formatWeekLabel(viewerWeek)}</option>}
                                        {viewerWeeks.map((week) => (
                                            <option key={week} value={week}>
                                                {formatWeekLabel(week)}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="mt-4 space-y-2">
                                        {trendWeeks.length === 0 ? (
                                            <div className="border border-dashed border-neutral-700 p-4 text-center text-xs text-neutral-500">
                                                暂无复盘趋势
                                            </div>
                                        ) : (
                                            trendWeeks.map((item) => (
                                                <div key={item.week} className="space-y-1">
                                                    <div className="flex justify-between text-[10px] font-bold text-neutral-500">
                                                        <span>{formatDate(item.week)}</span>
                                                        <span>{item.points} 点</span>
                                                    </div>
                                                    <div className="h-3 bg-neutral-900">
                                                        <div
                                                            className="h-full bg-cyan-500"
                                                            style={{ width: `${Math.max(8, (item.points / maxTrendPoints) * 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </PixelCard>

                                <div className="border-2 border-neutral-800 bg-neutral-950 p-4">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black text-neutral-300">
                                        <BarChart3 className="h-4 w-4 text-emerald-400" />
                                        全部累计
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-center">
                                        <div className="bg-neutral-900 p-3">
                                            <div className="text-xl font-black text-white">{viewerReviews.length}</div>
                                            <div className="text-[10px] text-neutral-500">记录</div>
                                        </div>
                                        <div className="bg-neutral-900 p-3">
                                            <div className="text-xl font-black text-white">{viewerWeeks.length}</div>
                                            <div className="text-[10px] text-neutral-500">周</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-end justify-between gap-3 border-b-4 border-black pb-3">
                                    <div>
                                        <h2 className="text-xl font-black text-white">{formatWeekLabel(viewerWeek)}</h2>
                                        <p className="text-xs text-neutral-500">被复盘人：{user?.character_name}</p>
                                    </div>
                                    {allTags.length > 0 && (
                                        <div className="hidden flex-wrap justify-end gap-1 md:flex">
                                            {allTags.map((tag) => (
                                                <span key={tag} className="bg-neutral-800 px-2 py-1 text-[10px] font-bold text-neutral-300">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {currentViewerReviews.length === 0 ? (
                                    <div className="border-4 border-dashed border-neutral-700 bg-neutral-900 p-10 text-center">
                                        <Camera className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
                                        <div className="text-sm font-bold text-neutral-400">这一周还没有复盘记录</div>
                                    </div>
                                ) : (
                                    currentViewerReviews.map((review) => <ReviewCard key={review.id} review={review} />)
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {activePanel === "admin" && isAdmin && (
                    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
                        <section className="space-y-4">
                            <PixelCard className="bg-neutral-800">
                                <div className="mb-4 flex items-center gap-2 text-lg font-black text-yellow-500">
                                    <ShieldCheck className="h-5 w-5" />
                                    提交复盘记录
                                </div>

                                <div className="space-y-4">
                                    <label className="block">
                                        <span className="mb-2 block text-xs font-black uppercase tracking-wider text-neutral-400">被复盘人</span>
                                        <input
                                            value={targetName}
                                            onChange={(e) => setTargetName(e.target.value)}
                                            className="w-full border-4 border-black bg-neutral-100 px-4 py-3 text-sm font-bold text-black outline-none"
                                            placeholder="输入角色名"
                                        />
                                    </label>

                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="block">
                                            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-neutral-400">复盘日期</span>
                                            <input
                                                type="date"
                                                value={reviewDate}
                                                onChange={(e) => setReviewDate(e.target.value)}
                                                className="w-full border-4 border-black bg-neutral-100 px-3 py-3 text-sm font-bold text-black outline-none"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-2 block text-xs font-black uppercase tracking-wider text-neutral-400">周起始</span>
                                            <input
                                                value={getWeekStart(reviewDate)}
                                                readOnly
                                                className="w-full border-4 border-black bg-neutral-900 px-3 py-3 text-sm font-bold text-neutral-300 outline-none"
                                            />
                                        </label>
                                    </div>

                                    <label className="block">
                                        <span className="mb-2 block text-xs font-black uppercase tracking-wider text-neutral-400">标题</span>
                                        <input
                                            value={reviewTitle}
                                            onChange={(e) => setReviewTitle(e.target.value)}
                                            className="w-full border-4 border-black bg-neutral-100 px-4 py-3 text-sm font-bold text-black outline-none"
                                            placeholder="可选"
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-2 block text-xs font-black uppercase tracking-wider text-neutral-400">复盘要点</span>
                                        <textarea
                                            value={reviewPoints}
                                            onChange={(e) => setReviewPoints(e.target.value)}
                                            rows={7}
                                            className="w-full resize-none border-4 border-black bg-neutral-100 px-4 py-3 text-sm font-bold leading-relaxed text-black outline-none placeholder:text-neutral-500"
                                            placeholder={"每行一个点，例如：\n进场时机偏早，需要等前排先开视野\n第二波技能交得太集中，可留一个保命技能"}
                                        />
                                    </label>

                                    <label className="block">
                                        <span className="mb-2 block text-xs font-black uppercase tracking-wider text-neutral-400">标签</span>
                                        <input
                                            value={tagsInput}
                                            onChange={(e) => setTagsInput(e.target.value)}
                                            className="w-full border-4 border-black bg-neutral-100 px-4 py-3 text-sm font-bold text-black outline-none"
                                            placeholder="走位, 集火, 技能"
                                        />
                                    </label>

                                    <div>
                                        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
                                        <button
                                            type="button"
                                            onClick={() => fileRef.current?.click()}
                                            className="flex w-full items-center justify-center gap-2 border-4 border-black bg-neutral-700 px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0_0_#000] transition-colors hover:bg-neutral-600"
                                        >
                                            <ImagePlus className="h-4 w-4" />
                                            上传图片
                                        </button>

                                        {imagePreviews.length > 0 && (
                                            <div className="mt-3 grid grid-cols-4 gap-2">
                                                {imagePreviews.map((preview, index) => (
                                                    <button
                                                        key={`${preview}-${index}`}
                                                        type="button"
                                                        onClick={() => removeImage(index)}
                                                        className="relative aspect-video overflow-hidden border-2 border-neutral-700 bg-neutral-900"
                                                    >
                                                        <img src={preview} alt={`待上传截图 ${index + 1}`} className="h-full w-full object-cover" />
                                                        <span className="absolute inset-x-0 bottom-0 bg-black/75 py-0.5 text-[10px] font-bold text-white">
                                                            移除
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {message && (
                                        <div className="flex items-center gap-2 border-2 border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-300">
                                            <CheckCircle2 className="h-4 w-4" />
                                            {message}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="flex w-full items-center justify-center gap-2 border-4 border-black bg-yellow-500 px-4 py-3 text-sm font-black text-black shadow-[4px_4px_0_0_#000] transition-all hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        {submitting ? "提交中" : "提交复盘"}
                                    </button>
                                </div>
                            </PixelCard>
                        </section>

                        <section className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-4">
                                <StatTile icon={UsersRound} label="被复盘人数" value={adminSummary.length} tone="text-cyan-400" />
                                <StatTile icon={ClipboardList} label="记录数" value={currentAdminReviews.length} tone="text-yellow-400" />
                                <StatTile icon={Target} label="要点数" value={adminSummary.reduce((sum, row) => sum + row.points, 0)} tone="text-emerald-400" />
                                <StatTile icon={ImagePlus} label="图片数" value={adminSummary.reduce((sum, row) => sum + row.images, 0)} tone="text-rose-400" />
                            </div>

                            <PixelCard className="bg-neutral-800">
                                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 text-lg font-black text-white">
                                            <UsersRound className="h-5 w-5 text-cyan-400" />
                                            本周复盘覆盖
                                        </div>
                                        <p className="text-xs text-neutral-500">{formatWeekLabel(adminWeek)}</p>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-row">
                                        {adminWeeks.length > 0 && (
                                            <select
                                                value={adminWeek}
                                                onChange={(e) => setAdminWeek(e.target.value)}
                                                className="border-2 border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-500"
                                            >
                                                {adminWeeks.map((week) => (
                                                    <option key={week} value={week}>
                                                        {formatWeekLabel(week)}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        <input
                                            type="date"
                                            value={adminWeek}
                                            onChange={(e) => setAdminWeek(getWeekStart(e.target.value))}
                                            className="border-2 border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-yellow-500"
                                        />
                                    </div>
                                </div>

                                {adminSummary.length === 0 ? (
                                    <div className="border-2 border-dashed border-neutral-700 p-10 text-center text-sm font-bold text-neutral-500">
                                        当前周暂无复盘记录
                                    </div>
                                ) : (
                                    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                                        <div className="space-y-2">
                                            <div className="text-xs font-black uppercase tracking-wider text-neutral-500">
                                                被复盘人名单
                                            </div>
                                            <div className="max-h-[620px] overflow-y-auto pr-1">
                                                {adminSummary.map((row) => {
                                                    const active = selectedAdminTarget === row.name;
                                                    return (
                                                        <button
                                                            key={row.name}
                                                            type="button"
                                                            onClick={() => setSelectedAdminTarget(row.name)}
                                                            className={`mb-2 flex w-full items-center justify-between border-2 p-3 text-left transition-colors ${
                                                                active
                                                                    ? "border-yellow-500 bg-yellow-500 text-black"
                                                                    : "border-neutral-700 bg-neutral-900 text-white hover:border-cyan-500"
                                                            }`}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm font-black">{row.name}</div>
                                                                <div className={`mt-1 text-[10px] font-bold ${active ? "text-black/70" : "text-neutral-500"}`}>
                                                                    最近 {formatDate(row.latest)}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`px-2 py-1 text-xs font-black ${active ? "bg-black text-yellow-300" : "bg-cyan-500 text-black"}`}>
                                                                    {row.records} 条
                                                                </span>
                                                                <ChevronRight className="h-4 w-4" />
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="min-w-0 border-2 border-neutral-700 bg-neutral-900 p-4">
                                            {selectedAdminTarget ? (
                                                <div className="space-y-4">
                                                    <div className="flex flex-col gap-3 border-b-2 border-neutral-700 pb-3 md:flex-row md:items-end md:justify-between">
                                                        <div>
                                                            <div className="text-xs font-black uppercase tracking-wider text-neutral-500">
                                                                复盘明细
                                                            </div>
                                                            <h3 className="mt-1 text-xl font-black text-white">{selectedAdminTarget}</h3>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2 text-center">
                                                            <div className="bg-neutral-800 px-3 py-2">
                                                                <div className="text-lg font-black text-yellow-300">{selectedAdminReviews.length}</div>
                                                                <div className="text-[10px] text-neutral-500">记录</div>
                                                            </div>
                                                            <div className="bg-neutral-800 px-3 py-2">
                                                                <div className="text-lg font-black text-emerald-300">
                                                                    {selectedAdminReviews.reduce((sum, review) => sum + (splitPoints(review.review_points).length || 1), 0)}
                                                                </div>
                                                                <div className="text-[10px] text-neutral-500">要点</div>
                                                            </div>
                                                            <div className="bg-neutral-800 px-3 py-2">
                                                                <div className="text-lg font-black text-cyan-300">
                                                                    {selectedAdminReviews.reduce((sum, review) => sum + (review.image_urls?.length || 0), 0)}
                                                                </div>
                                                                <div className="text-[10px] text-neutral-500">图片</div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {selectedAdminReviews.map((review) => {
                                                        const points = splitPoints(review.review_points);
                                                        return (
                                                            <div key={review.id} className="border-b border-neutral-700 pb-4 last:border-b-0 last:pb-0">
                                                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                                    <div>
                                                                        <div className="text-sm font-black text-white">
                                                                            {review.review_title || "录屏复盘"}
                                                                        </div>
                                                                        <div className="mt-1 text-xs text-neutral-500">
                                                                            {formatDate(review.review_date)}
                                                                            {review.reviewer_name ? ` / ${review.reviewer_name}` : ""}
                                                                        </div>
                                                                    </div>
                                                                    {review.tags?.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 md:justify-end">
                                                                            {review.tags.map((tag) => (
                                                                                <span key={tag} className="bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">
                                                                                    {tag}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="mt-3 space-y-2">
                                                                    {(points.length > 0 ? points : [review.review_points]).map((point, index) => (
                                                                        <div key={`${review.id}-${index}`} className="flex gap-2 text-sm text-neutral-200">
                                                                            <span className="mt-0.5 h-5 w-5 shrink-0 bg-neutral-700 text-center text-[10px] font-black leading-5 text-yellow-300">
                                                                                {index + 1}
                                                                            </span>
                                                                            <span className="leading-relaxed">{point}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {review.image_urls?.length > 0 && (
                                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                                        {review.image_urls.map((url, index) => (
                                                                            <a
                                                                                key={`${review.id}-${url}-${index}`}
                                                                                href={url}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] font-bold text-cyan-300 hover:border-cyan-500"
                                                                            >
                                                                                图片 {index + 1}
                                                                            </a>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="flex min-h-60 items-center justify-center text-sm font-bold text-neutral-500">
                                                    选择左侧被复盘人查看明细
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </PixelCard>
                        </section>
                    </div>
                )}
            </div>
        </main>
    );
}
