export default function ReportsLoading() {
  return (
    <div className="mobile-scroll-area h-full overflow-y-auto p-4 lg:p-8">
      <div className="mb-6 h-8 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.06]" />
        ))}
      </div>
      <div className="h-64 w-full animate-pulse rounded-2xl bg-white/[0.06]" />
    </div>
  );
}
