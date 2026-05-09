export default function AppLoading() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Page header skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-7 w-36 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-white/[0.04]" />
      </div>

      {/* Content area skeleton — generic rows */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-14 w-full animate-pulse rounded-xl bg-white/[0.04]"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
