/**
 * Per-route template — re-mounts on every navigation inside (app).
 * Pure-CSS fade (`.animate-route-fade` in globals.css) replaces the former
 * framer-motion wrapper, so framer is no longer on the critical path of EVERY
 * app navigation. No JS state → identical server/client markup (no hydration
 * mismatch) and content is never stuck invisible if JS is slow.
 *
 * No exit variant: with templates, Next unmounts the previous tree as soon as
 * navigation commits, so we only animate the entrance of the new route.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-hidden animate-route-fade">
      {children}
    </div>
  );
}
