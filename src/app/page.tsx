export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-4xl">
        百业战 终端 - 潘荙荙最帅 凤鸣藏和🍟第二帅
      </div>
      <div className="mt-4 text-neutral-400">
        系统初始化中...
      </div>
      <div className="mt-8">
        <a
          href="/login"
          className="border-2 border-yellow-500 bg-yellow-500/10 px-6 py-3 text-yellow-500 hover:bg-yellow-500 hover:text-black transition-colors font-bold uppercase tracking-widest"
        >
          进入终端
        </a>
      </div>
    </main>
  );
}
