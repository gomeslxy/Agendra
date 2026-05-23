export default function LeadsLoading() {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto p-4 lg:p-8">
      <div className="mb-6 h-8 w-32 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/[0.06] p-4">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-3.5 w-36 animate-pulse rounded bg-white/[0.08]" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-white/[0.05]" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
