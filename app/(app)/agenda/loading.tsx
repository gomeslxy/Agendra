export default function AgendaLoading() {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto px-4 pt-4 pb-[calc(72px+env(safe-area-inset-bottom,12px))] sm:pt-7 sm:px-8 sm:pb-7">
      {/* Header skeleton */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-28 animate-pulse rounded-xl bg-[#F4F4F5]" />
          <div className="h-4 w-44 animate-pulse rounded-lg bg-[#F4F4F5]" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded-xl bg-[#F4F4F5]" />
          <div className="h-9 w-32 animate-pulse rounded-xl bg-[#F4F4F5]" />
        </div>
      </div>

      {/* Body: calendar grid + side panel — mirrors real layout */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Calendar */}
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-3 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-6 w-36 animate-pulse rounded-lg bg-[#F4F4F5]" />
            <div className="ml-auto flex gap-1">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-[#F4F4F5]" />
              <div className="h-8 w-8 animate-pulse rounded-lg bg-[#F4F4F5]" />
            </div>
          </div>
          {/* Day-of-week row */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-[#F4F4F5]" />
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="min-h-[60px] sm:min-h-[80px] animate-pulse rounded-xl bg-[#F4F4F5]" />
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5">
          <div className="mb-4 h-4 w-24 animate-pulse rounded-lg bg-[#F4F4F5]" />
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[#F4F4F5]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
