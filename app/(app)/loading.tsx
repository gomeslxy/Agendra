export default function AppLoading() {
  return (
    <div className="flex h-full flex-col gap-5 p-7 overflow-hidden">
      {/* Page header skeleton */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-44 animate-pulse rounded-lg bg-white/[0.07]" />
          <div className="h-4 w-32 animate-pulse rounded-md bg-white/[0.04]" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-xl bg-white/[0.05]" />
      </div>

      {/* Content rows */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-14 w-full animate-pulse rounded-xl bg-white/[0.04]"
            style={{ animationDelay: `${i * 35}ms`, opacity: 1 - i * 0.08 }}
          />
        ))}
      </div>

      {/* Bottom bar hint */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  );
}
