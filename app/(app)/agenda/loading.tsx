export default function AgendaLoading() {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-9 w-24 animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
    </div>
  );
}
