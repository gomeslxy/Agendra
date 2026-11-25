export default function SettingsLoading() {
  return (
    <div className="h-full overflow-y-auto px-4 pt-7 pb-6 lg:px-8 lg:py-7 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[#F4F4F5]" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-[#F4F4F5]" />
      </div>
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start">
        <div className="lg:hidden flex gap-1.5 w-full overflow-x-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-24 shrink-0 animate-pulse rounded-xl bg-[#F4F4F5]" />
          ))}
        </div>
        <div className="hidden lg:flex flex-col w-64 shrink-0 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-[#F4F4F5]" />
          ))}
        </div>
        <div className="flex-1 w-full max-w-3xl flex flex-col gap-4">
          <div className="h-64 animate-pulse rounded-2xl bg-[#F4F4F5]" />
          <div className="h-40 animate-pulse rounded-2xl bg-[#F4F4F5]" />
        </div>
      </div>
    </div>
  );
}
