export default function NotificationsLoading() {
  return (
    <div className="h-full overflow-y-auto px-4 pt-7 pb-6 lg:px-8 lg:py-7 bg-[#FAFAFA]">
      <div className="mb-6 flex flex-col gap-2">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-[#E4E4E7]/60" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-[#E4E4E7]/60" />
      </div>
      <div className="flex flex-col lg:flex-row gap-8 items-start animate-pulse">
        <div className="flex-1 w-full space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-[#E4E4E7]" />
          ))}
        </div>
        <div className="w-full lg:w-80 h-96 rounded-2xl bg-white border border-[#E4E4E7]" />
      </div>
    </div>
  );
}
