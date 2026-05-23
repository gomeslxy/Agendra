export default function InboxLoading() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="hidden w-80 shrink-0 flex-col gap-1 border-r border-white/[0.06] p-3 md:flex">
        <div className="mb-2 h-9 w-full animate-pulse rounded-xl bg-white/[0.06]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl p-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-3 w-28 animate-pulse rounded bg-white/[0.08]" />
              <div className="h-2.5 w-40 animate-pulse rounded bg-white/[0.05]" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="mb-2 h-14 w-full animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="flex flex-1 flex-col justify-end gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
              <div
                className="h-10 animate-pulse rounded-2xl bg-white/[0.06]"
                style={{ width: `${120 + (i * 30) % 80}px` }}
              />
            </div>
          ))}
        </div>
        <div className="h-12 w-full animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
    </div>
  );
}
