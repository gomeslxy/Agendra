export default function InboxLoading() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* COL 1 — lead list */}
      <div className="hidden w-80 shrink-0 flex-col border-r border-white/[0.06] md:flex">
        {/* Header */}
        <div className="px-5 pb-3 pt-5 shrink-0">
          <div className="h-7 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
          {/* Search */}
          <div className="mt-4 h-9 w-full animate-pulse rounded-xl bg-white/[0.06]" />
          {/* Status filter pills */}
          <div className="mt-3 flex gap-1.5">
            {[40, 32, 36, 32, 52].map((w, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded-lg bg-white/[0.05]"
                style={{ width: `${w}px` }}
              />
            ))}
          </div>
          {/* Channel filter pills */}
          <div className="mt-2 flex gap-1.5">
            {[44, 60, 56].map((w, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded-lg bg-white/[0.05]"
                style={{ width: `${w}px` }}
              />
            ))}
          </div>
        </div>
        {/* Lead items */}
        <div className="flex flex-col gap-1 px-3 pb-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl p-3">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-3.5 w-28 animate-pulse rounded bg-white/[0.08]" />
                <div className="h-2.5 w-40 animate-pulse rounded bg-white/[0.05]" />
              </div>
              <div className="h-2.5 w-6 animate-pulse rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>

      {/* COL 2 — chat */}
      <div className="flex flex-1 flex-col">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="flex flex-col gap-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-white/[0.08]" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.05]" />
          </div>
          <div className="ml-auto flex gap-2">
            <div className="h-8 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
            <div className="h-8 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
          </div>
        </div>
        {/* Messages */}
        <div className="flex flex-1 flex-col justify-end gap-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
              <div
                className="h-10 animate-pulse rounded-2xl bg-white/[0.06]"
                style={{ width: `${100 + (i * 40) % 120}px` }}
              />
            </div>
          ))}
        </div>
        {/* Input */}
        <div className="border-t border-white/[0.06] p-4">
          <div className="h-12 w-full animate-pulse rounded-xl bg-white/[0.06]" />
        </div>
      </div>

      {/* COL 3 — detail panel (xl only) */}
      <div className="hidden w-80 shrink-0 flex-col gap-4 border-l border-white/[0.06] p-5 xl:flex">
        <div className="flex flex-col items-center gap-3 pb-4 border-b border-white/[0.04]">
          <div className="h-20 w-20 animate-pulse rounded-3xl bg-white/[0.08]" />
          <div className="h-4 w-28 animate-pulse rounded bg-white/[0.08]" />
          <div className="h-3 w-20 animate-pulse rounded bg-white/[0.05]" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-white/[0.05]" style={{ width: `${60 + i * 8}%` }} />
          ))}
        </div>
        <div className="mt-2 h-24 animate-pulse rounded-2xl bg-white/[0.05]" />
      </div>
    </div>
  );
}
