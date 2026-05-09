export default function RootLoading() {
  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: "#060A14" }}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Logo glyph placeholder — same dimensions as agendra-glyph.svg */}
        <div className="h-8 w-8 animate-pulse rounded-lg bg-white/10" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#14B8A6]"
            style={{
              animation: "loading-bar 1.4s ease-in-out infinite",
              width: "40%",
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes loading-bar {
          0%   { transform: translateX(-100%) scaleX(1); }
          50%  { transform: translateX(150%) scaleX(1.5); }
          100% { transform: translateX(-100%) scaleX(1); }
        }
      `}</style>
    </div>
  );
}
