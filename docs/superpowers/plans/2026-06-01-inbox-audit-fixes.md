# Inbox Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical, high, and medium issues found in the /inbox audit — correct ordering, pagination, real-time behavior, date separators, toast errors, optimistic lifecycle, and UX polish.

**Architecture:** Data layer fixes first (query, actions), then new components (DateSeparator), then inbox-client.tsx changes in logical batches. All changes are surgical — no file restructuring. Uses existing sonner (already wired in layout), existing Supabase realtime, existing Framer Motion.

**Tech Stack:** Next.js App Router, Supabase SSR + realtime, sonner toast, Framer Motion, Tailwind CSS, TypeScript

---

## Files Modified / Created

| File | Action | Changes |
|---|---|---|
| `app/(app)/inbox/page.tsx` | Modify | Fix query ordering, increase lead limit to 100 |
| `app/(app)/inbox/actions.ts` | Modify | `sendNote` updates `last_message_at`; new `fetchOlderMessages` action; fix temp note text; fix shadow mode to admin client |
| `app/(app)/inbox/inbox-client.tsx` | Modify | Most UX/behavior fixes (13 distinct changes) |
| `components/app/date-separator.tsx` | Create | Date separator component for message timeline |

---

## Task 1: Fix Query Ordering + Lead Limit

**Files:** Modify `app/(app)/inbox/page.tsx`

- [ ] **Step 1: Fix the query**

In `page.tsx`, replace lines 22-31 with:

```ts
const [{ data, error }, { data: events }] = await Promise.all([
  supabase
    .from("leads")
    .select(`*, messages(id, lead_id, company_id, content, role, metadata, created_at)`)
    .eq("company_id", companyId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(50, { referencedTable: "messages" })
    .limit(100),
  supabase
    .from("events")
    .select("id, lead_id, title, start_time, end_time")
    .eq("company_id", companyId)
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true })
    .limit(200),
]);
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

Expected: no errors from inbox files.

- [ ] **Step 3: Commit**

```
git add app/(app)/inbox/page.tsx
git commit -m "fix(inbox): order leads by last_message_at, increase limit to 100"
```

---

## Task 2: Fix `sendNote` + Add `fetchOlderMessages` + Fix Shadow Mode

**Files:** Modify `app/(app)/inbox/actions.ts`

- [ ] **Step 1: Fix `sendNote` — update `last_message_at` on message insert**

After `if (dbError) throw new Error(...)` and before `await sendChannelMessage`, add:

```ts
// Update lead's last_message_at so ordering stays correct
await supabase
  .from("leads")
  .update({ last_message_at: new Date().toISOString() })
  .eq("id", leadId)
  .eq("company_id", company_id);
```

Full updated `sendNote` function (lines 23-58):

```ts
export async function sendNote(leadId: string, content: string) {
  const trimmed = content?.trim() ?? "";
  if (!trimmed) throw new Error("Mensagem vazia");
  if (trimmed.length > 4096) throw new Error("Mensagem muito longa (máx 4096 chars)");

  try {
    const profile = await getUserProfile();
    if (!profile) throw new Error("Não autorizado");
    const companyId = profile.memberships?.[0]?.company_id;
    if (!companyId) throw new Error("Não autorizado");

    const supabase = await createClient();
    const { company_id, phone } = await getLeadInfo(supabase, leadId, companyId);

    await requireOnboarding(company_id);

    const { error: dbError } = await supabase.from("messages").insert({
      lead_id: leadId,
      company_id,
      content: trimmed,
      role: "agent",
    });

    if (dbError) throw new Error(`Erro no Banco: ${dbError.message}`);

    // Keep lead ordering correct for agent-sent messages
    await supabase
      .from("leads")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("company_id", company_id);

    await sendChannelMessage(phone, trimmed, company_id);

    revalidatePath("/inbox");
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[Action:sendNote] ❌ Falha crítica:", msg);
    return { success: false, error: msg };
  }
}
```

- [ ] **Step 2: Fix `setControlMode` shadow mode to use admin client**

In `setControlMode` (line 159+), replace the shadow block with admin client:

```ts
} else {
  // shadow mode: use admin client for consistency (avoids RLS issues)
  const admin = createAdminClient();
  await admin
    .from("leads")
    .update({ control_mode: mode, is_paused: false })
    .eq("id", leadId)
    .eq("company_id", company_id);
}
```

- [ ] **Step 3: Fix temp note text in `takeOverLead` to match client-side temp**

In `takeOverLead` (actions.ts line ~84), change:
```ts
content: "Atendente assumiu a conversa (Modo Manual).",
```
to:
```ts
content: "Você assumiu o atendimento.",
```

- [ ] **Step 4: Add `fetchOlderMessages` server action at end of actions.ts**

```ts
export async function fetchOlderMessages(leadId: string, beforeDate: string) {
  const profile = await getUserProfile();
  if (!profile) throw new Error("Unauthorized");
  const companyId = profile.memberships?.[0]?.company_id;
  if (!companyId) throw new Error("No company");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("messages")
    .select("id, lead_id, company_id, content, role, metadata, created_at")
    .eq("lead_id", leadId)
    .eq("company_id", companyId)
    .lt("created_at", beforeDate)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Message[]).reverse();
}
```

Add `import type { Message } from "@/lib/types/database";` at top if not already imported.

- [ ] **Step 5: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "actions"
```

- [ ] **Step 6: Commit**

```
git add app/(app)/inbox/actions.ts
git commit -m "fix(inbox): sendNote updates last_message_at, shadow admin client, align note text, add fetchOlderMessages"
```

---

## Task 3: Create DateSeparator Component

**Files:** Create `components/app/date-separator.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { cn } from "@/lib/utils";

function formatSeparatorDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "long" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: diffDays > 365 ? "numeric" : undefined });
}

interface DateSeparatorProps {
  date: string;
  className?: string;
}

export function DateSeparator({ date, className }: DateSeparatorProps) {
  return (
    <div className={cn("flex items-center gap-3 py-2 select-none", className)}>
      <div className="h-px flex-1 bg-[#E4E4E7]" />
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[#A1A1AA]">
        {formatSeparatorDate(date)}
      </span>
      <div className="h-px flex-1 bg-[#E4E4E7]" />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "date-separator"
```

- [ ] **Step 3: Commit**

```
git add components/app/date-separator.tsx
git commit -m "feat(inbox): add DateSeparator component for message timeline"
```

---

## Task 4: inbox-client.tsx — Core State Fixes

**Files:** Modify `app/(app)/inbox/inbox-client.tsx`

This task covers: fix `isConnected` initial null state, fix `editingDraftId` reset on lead switch, change `unreadLeadIds` to `Map<string, number>`, fix realtime sort to use `last_message_at`.

- [ ] **Step 1: Add imports**

At the top of the file, add imports:

```ts
import { toast } from "sonner";
import { DateSeparator } from "@/components/app/date-separator";
import { fetchOlderMessages } from "./actions";
import { Clock } from "lucide-react";
```

Also add `Clock` to the existing lucide import line. The `toast`, `DateSeparator`, and `fetchOlderMessages` imports are new.

- [ ] **Step 2: Fix `isConnected` initial state**

Change line:
```ts
const [isConnected, setIsConnected] = useState(false);
```
to:
```ts
const [isConnected, setIsConnected] = useState<boolean | null>(null);
```

- [ ] **Step 3: Change `unreadLeadIds` to `Map<string, number>`**

Change:
```ts
const [unreadLeadIds, setUnreadLeadIds] = useState<Set<string>>(new Set());
```
to:
```ts
const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
```

- [ ] **Step 4: Fix `handleLeadSelect` to use new unread Map + reset draft state**

Replace the full `handleLeadSelect` callback:

```ts
const handleLeadSelect = useCallback((id: string) => {
  setSelectedId(id);
  setShowChatOnMobile(true);
  setEditingDraftId(null);
  setEditDraftText("");
  setUnreadCounts((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Map(prev);
    next.delete(id);
    return next;
  });
}, []);
```

- [ ] **Step 5: Fix realtime INSERT message handler — use `last_message_at` from lead + update unread count**

In the `.on("postgres_changes", { event: "INSERT", ... "messages" ... })` callback, replace:

```ts
if (newMsg.role === "user" && newMsg.lead_id !== selectedIdRef.current) {
  setUnreadLeadIds((prev) => new Set(prev).add(newMsg.lead_id));
}
```

with:

```ts
if (newMsg.role === "user" && newMsg.lead_id !== selectedIdRef.current) {
  setUnreadCounts((prev) => {
    const next = new Map(prev);
    next.set(newMsg.lead_id, (next.get(newMsg.lead_id) ?? 0) + 1);
    return next;
  });
}
```

And update the sort function in the same INSERT handler (after mapping `next`):

```ts
return next.sort((a, b) => {
  const aTs = a.last_message_at ?? lastMsg(a)?.created_at ?? a.updated_at;
  const bTs = b.last_message_at ?? lastMsg(b)?.created_at ?? b.updated_at;
  return new Date(bTs).getTime() - new Date(aTs).getTime();
});
```

Apply the same sort fix to the leads INSERT and UPDATE realtime handlers.

- [ ] **Step 6: Fix `isConnected` LIVE/OFFLINE badge**

In the JSX badge rendering (around line 962), replace:

```tsx
isConnected
  ? "bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1]"
  : "bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]"
```

with:

```tsx
isConnected === true
  ? "bg-[#F0FDFA] text-[#0F766E] border border-[#CCFBF1]"
  : isConnected === false
  ? "bg-[#FFF1F2] text-[#DC2626] border border-[#FECACA]"
  : "bg-[#F4F4F5] text-[#71717A] border border-[#E4E4E7]"
```

And the dot + text:

```tsx
<span className={cn(
  "h-1.5 w-1.5 rounded-full transition-all duration-500",
  isConnected === true ? "bg-[#14B8A6] animate-pulse" : isConnected === false ? "bg-[#DC2626]" : "bg-[#D4D4D8]"
)} />
{isConnected === true ? "LIVE" : isConnected === false ? "OFFLINE" : "···"}
```

- [ ] **Step 7: Fix unread badge rendering in `LeadListItem`**

In `LeadListItem`, replace the unread dot logic. The component now receives `unreadCount: number` instead of `isUnread: boolean`:

Update interface:
```ts
interface LeadListItemProps {
  lead: LeadWithMessages;
  isActive: boolean;
  unreadCount: number;
  onSelect: (id: string) => void;
}
```

Replace the unread dot:
```tsx
{unreadCount > 0 && (
  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#2563EB] border-2 border-white text-[8px] font-black text-white leading-none">
    {unreadCount > 9 ? "9+" : unreadCount}
  </span>
)}
```

Update the call site in the list render:
```tsx
<LeadListItem
  key={l.id}
  lead={l}
  isActive={l.id === selectedId}
  unreadCount={unreadCounts.get(l.id) ?? 0}
  onSelect={handleLeadSelect}
/>
```

- [ ] **Step 8: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

- [ ] **Step 9: Commit**

```
git add app/(app)/inbox/inbox-client.tsx components/app/date-separator.tsx
git commit -m "fix(inbox): isConnected null initial state, editingDraftId reset, unread count badge, realtime sort by last_message_at"
```

---

## Task 5: Fix "Ativo agora" + Typing Indicator → is_processing

**Files:** Modify `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Remove broken typing indicator state and timer**

Remove these state declarations:
```ts
const [isTyping, setIsTyping] = useState(false);
const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

Remove the `useEffect` that clears typing on selectedId change.

Remove the `typingTimerRef` cleanup in the realtime `return () => { ... }`.

- [ ] **Step 2: Replace typing indicator logic in realtime INSERT handler**

Remove all `setIsTyping` and `typingTimerRef` calls from the INSERT messages handler.

Remove `setIsTyping(false)` calls from the UPDATE messages handler.

- [ ] **Step 3: Replace `isTyping` display with `is_processing` from lead**

In the messages area JSX, replace the `isTyping` block:

```tsx
{/* Remove: isTyping && <motion.div>...</motion.div> */}
```

Replace with (uses `selected.is_processing` from realtime lead state):

```tsx
{selected.is_processing && (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -4 }}
    className="flex items-center gap-2 self-start mt-2"
  >
    <div className="flex items-center gap-2 rounded-[14px] rounded-bl-[3px] border border-[#E4E4E7] bg-white px-4 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium text-[#71717A]">IA gerando resposta...</span>
    </div>
  </motion.div>
)}
```

Wrap this in `<AnimatePresence>` since it conditionally renders:
```tsx
<AnimatePresence>
  {selected.is_processing && (
    <motion.div ...>...</motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 4: Fix "Ativo agora" — dynamic status based on `last_message_at`**

Replace (in chat header, around line 1105):
```tsx
<span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
Ativo agora · {selected.channel}
```

with a helper function defined near the top of the component or at module level:

```ts
function activityLabel(lead: LeadWithMessages): { dot: string; text: string } {
  const ts = lead.last_message_at ?? lastMsg(lead)?.created_at;
  if (!ts) return { dot: "bg-[#D4D4D8]", text: `${lead.channel}` };
  const diffMin = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diffMin < 5) return { dot: "bg-[#22C55E] animate-pulse", text: `Ativo agora · ${lead.channel}` };
  if (diffMin < 60) return { dot: "bg-[#F59E0B]", text: `Ativo há ${diffMin}m · ${lead.channel}` };
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return { dot: "bg-[#D4D4D8]", text: `Ativo há ${diffH}h · ${lead.channel}` };
  return { dot: "bg-[#D4D4D8]", text: `${lead.channel}` };
}
```

Usage:
```tsx
const activity = activityLabel(selected);
// ...
<span className={cn("h-1.5 w-1.5 rounded-full", activity.dot)} />
{activity.text}
```

- [ ] **Step 5: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

- [ ] **Step 6: Commit**

```
git add app/(app)/inbox/inbox-client.tsx
git commit -m "fix(inbox): replace typing indicator with is_processing, fix Ativo agora dynamic status"
```

---

## Task 6: Fix Optimistic Message Lifecycle

**Files:** Modify `app/(app)/inbox/inbox-client.tsx`

The fix: mark temp messages with `_pending: true`. Show clock icon. On success, don't remove in finally — let realtime INSERT deduplicate. On error, remove temp and restore text.

- [ ] **Step 1: Extend the temp message type locally**

At module level (above the InboxClient function), add:

```ts
type PendingMessage = Message & { _pending?: true };
```

- [ ] **Step 2: Rewrite `handleSend` for text messages**

Replace the text message path in `handleSend`:

```ts
if (!noteText.trim()) return;
const content = noteText.trim();
setInboxError(null);
setNoteText("");

const tempId = crypto.randomUUID();
const tempMsg: PendingMessage = {
  id: tempId,
  lead_id: selected.id,
  company_id: selected.company_id,
  content,
  role: "agent",
  created_at: new Date().toISOString(),
  _pending: true,
};

setLeads((prev) =>
  prev.map((l) =>
    l.id === selected.id ? { ...l, messages: [...l.messages, tempMsg] } : l
  )
);

startSend(async () => {
  try {
    const result = await sendNote(selected.id, content);
    if (result?.error) {
      // Error: remove temp, restore text
      toast.error(result.error);
      setNoteText(content);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === selected.id
            ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
            : l
        )
      );
    } else if (result?.success) {
      trackEvent("message_sent", { lead_id: selected.id });
      // Don't remove temp — realtime will arrive and replace it
      // Safety timeout: remove after 15s if realtime never arrives
      setTimeout(() => {
        setLeads((prev) =>
          prev.map((l) =>
            l.id === selected.id
              ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
              : l
          )
        );
      }, 15000);
    }
  } catch (e) {
    toast.error((e as Error).message);
    setNoteText(content);
    setLeads((prev) =>
      prev.map((l) =>
        l.id === selected.id
          ? { ...l, messages: l.messages.filter((m) => m.id !== tempId) }
          : l
      )
    );
  }
});
```

- [ ] **Step 3: Update realtime INSERT handler to deduplicate pending temp messages**

In the realtime INSERT messages handler, after `if (lead.messages.some((m) => m.id === newMsg.id)) return lead;`, change the return to:

```ts
// Remove any pending temp with matching content (optimistic dedup)
const withoutPending = lead.messages.filter((m) => {
  const pm = m as PendingMessage;
  if (!pm._pending) return true;
  const contentMatch = pm.content === newMsg.content;
  const timeClose = Math.abs(new Date(pm.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 30000;
  return !(contentMatch && timeClose);
});
return { ...lead, messages: [...withoutPending, newMsg] };
```

- [ ] **Step 4: Show clock icon on pending messages in render**

In the message render loop, where `ChatBubble` is rendered, add a pending indicator for `_pending` messages. Before the `<ChatBubble>` return, add a wrapper check:

```tsx
const isPending = (msg as PendingMessage)._pending === true;

return (
  <div key={msg.id} className={cn("contents", isPending && "opacity-70")}>
    <ChatBubble
      timestamp={msg.created_at}
      variant={...}
      isFirst={msg.isFirst}
      isLast={msg.isLast}
      hideLabel={msg.hideLabel}
      hideTime={msg.hideTime}
    >
      <span className="flex items-end gap-1.5">
        <span>{/* existing content */}</span>
        {isPending && <Clock size={10} className="shrink-0 opacity-50 mb-0.5" />}
      </span>
    </ChatBubble>
  </div>
);
```

Actually simpler: wrap the ChatBubble in a div with opacity-70 when pending, and show clock inside children:

```tsx
const isPending = !!(msg as PendingMessage)._pending;
const msgContent = mediaMeta?.media_url ? (/* existing media JSX */) : (
  <span className="flex items-end gap-1.5">
    {msg.content}
    {isPending && <Clock size={9} className="shrink-0 opacity-40 mb-0.5" />}
  </span>
);
return (
  <div key={msg.id} className={cn(isPending && "opacity-75 transition-opacity")}>
    <ChatBubble ...>
      {msgContent}
    </ChatBubble>
  </div>
);
```

- [ ] **Step 5: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

- [ ] **Step 6: Commit**

```
git add app/(app)/inbox/inbox-client.tsx
git commit -m "fix(inbox): optimistic message stays visible with clock icon, deduplication on realtime confirm"
```

---

## Task 7: Add Date Separators + Fix `relativeTime`

**Files:** Modify `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Fix `relativeTime` for dates > 6 days**

Replace the function (lines 36-45):

```ts
function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
```

- [ ] **Step 2: Extend `groupedMessages` to include date separator markers**

Replace the `groupedMessages` useMemo:

```ts
const groupedMessages = useMemo(() => {
  const msgs = selected?.messages ?? [];
  const result: Array<{ type: "separator"; date: string } | { type: "message" } & typeof msgs[0] & { isFirst: boolean; isLast: boolean; hideLabel: boolean; hideTime: boolean }> = [];

  msgs.forEach((msg, i) => {
    const prev = msgs[i - 1];

    // Date separator
    const msgDay = new Date(msg.created_at).toDateString();
    const prevDay = prev ? new Date(prev.created_at).toDateString() : null;
    if (!prevDay || msgDay !== prevDay) {
      result.push({ type: "separator", date: msg.created_at });
    }

    const isNote = msg.role === "note";
    const prevIsSame = prev && prev.role === msg.role && !isNote;
    const next = msgs[i + 1];
    const nextIsSame = next && next.role === msg.role && !isNote;

    const timeGapPrev = prev ? (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) : 0;
    const timeGapNext = next ? (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) : 0;
    const GAP_LIMIT = 5 * 60 * 1000;

    const isFirst = !prevIsSame || timeGapPrev > GAP_LIMIT;
    const isLast = !nextIsSame || timeGapNext > GAP_LIMIT;

    result.push({ type: "message", ...msg, isFirst, isLast, hideLabel: !isFirst, hideTime: !isLast });
  });

  return result;
}, [selected?.messages]);
```

- [ ] **Step 3: Update message render loop to handle separators**

Replace the `{groupedMessages.map((msg) => { ... })}` block:

```tsx
{groupedMessages.map((item) => {
  if (item.type === "separator") {
    return <DateSeparator key={`sep-${item.date}`} date={item.date} />;
  }

  const msg = item;
  const isDraft = (msg.metadata as any)?.is_draft === true;
  const isPending = !!(msg as PendingMessage)._pending;

  if (isDraft) {
    return (
      // ... existing draft JSX unchanged, just add key={msg.id} ...
    );
  }

  const mediaMeta = (msg.metadata as any);
  const msgContent = mediaMeta?.media_url ? (
    <div className="flex flex-col gap-1.5">
      {/* existing media rendering unchanged */}
    </div>
  ) : (
    <span className="flex items-end gap-1.5">
      {msg.content}
      {isPending && <Clock size={9} className="shrink-0 opacity-40 mb-0.5" />}
    </span>
  );

  return (
    <div key={msg.id} className={cn(isPending && "opacity-75 transition-opacity")}>
      <ChatBubble
        timestamp={msg.created_at}
        variant={
          msg.role === "user" ? "lead" :
          msg.role === "note" ? "note" :
          msg.role === "agent" ? "agent" :
          "ai"
        }
        isFirst={msg.isFirst}
        isLast={msg.isLast}
        hideLabel={msg.hideLabel}
        hideTime={msg.hideTime}
      >
        {msgContent}
      </ChatBubble>
    </div>
  );
})}
```

- [ ] **Step 4: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

- [ ] **Step 5: Commit**

```
git add app/(app)/inbox/inbox-client.tsx
git commit -m "feat(inbox): date separators in message timeline, fix relativeTime for old dates"
```

---

## Task 8: Toast Errors + Remove Inline Error Duplication

**Files:** Modify `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Remove `inboxError` state and all `setInboxError` calls**

Delete:
```ts
const [inboxError, setInboxError] = useState<string | null>(fetchError ?? null);
```

For every `setInboxError(...)` call — replace with `toast.error(...)`.
For every `setInboxError(null)` — delete.

- [ ] **Step 2: Handle `fetchError` prop on mount**

Replace the removed `useState` initialization with a `useEffect`:

```ts
useEffect(() => {
  if (fetchError) toast.error(`Erro ao carregar inbox: ${fetchError}`);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Remove the inline error banner from the list section**

Delete this block (around line 1036):
```tsx
{inboxError && (
  <div className="mx-3 mb-2 ...">
    ...
  </div>
)}
```

- [ ] **Step 4: Remove the inline error display below the input**

Delete this block (around line 1452):
```tsx
{inboxError && (
  <p className="mt-2 text-center text-[11px] font-bold text-[#DC2626]">Erro: {inboxError}</p>
)}
```

- [ ] **Step 5: Update `handleSend` file attachment error path**

Replace `setInboxError('Arquivo muito grande (máx 16 MB)');` with `toast.error('Arquivo muito grande (máx 16 MB)');`
Replace `setInboxError('Arquivo não suportado: ...')` with `toast.error(...)`
Replace `setInboxError(result.error ?? 'Erro ao enviar arquivo')` with `toast.error(...)`

- [ ] **Step 6: Add toast.success on successful send (optional polish)**

After `trackEvent("message_sent", ...)`, optionally:
```ts
// No toast — the message appearing in UI is sufficient feedback
```
(Do NOT add toast.success for normal sends — it's noise. Only keep toast.error.)

- [ ] **Step 7: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

- [ ] **Step 8: Commit**

```
git add app/(app)/inbox/inbox-client.tsx
git commit -m "fix(inbox): replace inline error display with toast, remove duplicate error rendering"
```

---

## Task 9: Message Pagination — Load More History

**Files:** Modify `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Add `loadingMoreFor` state**

```ts
const [loadingMoreFor, setLoadingMoreFor] = useState<string | null>(null);
const [hasMoreMessages, setHasMoreMessages] = useState<Map<string, boolean>>(new Map());
```

Initialize `hasMoreMessages` when leads load: if a lead has 50 messages, assume there might be more:

```ts
// After useState([leads])
const [hasMoreMessages] = useState<Map<string, boolean>>(() => {
  const m = new Map<string, boolean>();
  initialLeads.forEach((l) => {
    if (l.messages.length >= 50) m.set(l.id, true);
  });
  return m;
});
```

Wait — useState initializer can't set state from closure easily with setter. Use a ref for this:

```ts
const [loadingMoreFor, setLoadingMoreFor] = useState<string | null>(null);
const hasMoreMessagesRef = useRef<Map<string, boolean>>(
  new Map(initialLeads.filter((l) => l.messages.length >= 50).map((l) => [l.id, true]))
);
const [hasMore, setHasMore] = useState<Map<string, boolean>>(hasMoreMessagesRef.current);
```

- [ ] **Step 2: Add `handleLoadMore` callback**

```ts
const handleLoadMore = useCallback(async () => {
  if (!selected || loadingMoreFor) return;
  const oldest = selected.messages[0];
  if (!oldest) return;

  setLoadingMoreFor(selected.id);
  try {
    const older = await fetchOlderMessages(selected.id, oldest.created_at);
    if (older.length === 0) {
      setHasMore((prev) => { const next = new Map(prev); next.set(selected.id, false); return next; });
      return;
    }
    setLeads((prev) =>
      prev.map((l) =>
        l.id === selected.id
          ? { ...l, messages: [...older, ...l.messages] }
          : l
      )
    );
    if (older.length < 30) {
      setHasMore((prev) => { const next = new Map(prev); next.set(selected.id, false); return next; });
    }
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    setLoadingMoreFor(null);
  }
}, [selected, loadingMoreFor]);
```

- [ ] **Step 3: Add "Load more" button at top of messages area**

At the beginning of the messages area `<motion.div>`, before the `{isAutonomous && ...}` block:

```tsx
{hasMore.get(selected.id) && (
  <div className="flex justify-center pb-2">
    <button
      onClick={handleLoadMore}
      disabled={loadingMoreFor === selected.id}
      className="flex items-center gap-2 rounded-full border border-[#E4E4E7] bg-white px-4 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50"
    >
      {loadingMoreFor === selected.id ? (
        <Zap size={11} className="animate-spin text-[#2563EB]" />
      ) : (
        <ChevronLeft size={11} className="rotate-90" />
      )}
      {loadingMoreFor === selected.id ? "Carregando..." : "Carregar histórico"}
    </button>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

- [ ] **Step 5: Commit**

```
git add app/(app)/inbox/inbox-client.tsx
git commit -m "feat(inbox): load more message history with pagination"
```

---

## Task 10: Fix Mobile DOM + Draft UX + Channel Filter

**Files:** Modify `app/(app)/inbox/inbox-client.tsx`

- [ ] **Step 1: Fix mobile DOM — CSS hide instead of conditional unmount**

Replace the conditional `{showChatColumns && (...)}` wrapping around COL 2 and COL 3:

For COL 2 (chat section):
```tsx
{/* COL 2 — chat */}
<section className={cn(
  "flex flex-col transition-all duration-300",
  !showChatOnMobile ? "hidden lg:flex lg:flex-1" : "flex w-full lg:flex-1"
)}>
```
Remove the `{showChatColumns && (` wrapper. The `hidden lg:flex` on the section already handles mobile hide. But we need to keep the section always in the DOM.

Change:
```tsx
{showChatColumns && (
<section className={cn(...)}>
  ...
</section>
)}
```
to just:
```tsx
<section className={cn(
  "flex flex-col transition-all duration-300",
  !showChatOnMobile ? "hidden lg:flex lg:flex-1" : "flex w-full lg:flex-1"
)}>
  ...
</section>
```

Same for COL 3 (aside):
```tsx
<aside className="hidden flex-col gap-5 overflow-y-auto border-l border-[#E4E4E7] bg-white p-5 w-[280px] shrink-0 custom-scrollbar xl:flex z-10 select-none">
```
Remove the `{showChatColumns && (` wrapper. The `hidden xl:flex` already handles visibility.

Also delete `showChatColumns` variable since it's no longer used:
```ts
// DELETE this line:
const showChatColumns = !isMobile || showChatOnMobile;
```

- [ ] **Step 2: Fix draft editor UX — hide original bubble when editing**

In the draft rendering block, when `editingDraftId === msg.id`, hide the bubble content and show only the editor:

```tsx
if (isDraft) {
  return (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="flex flex-col items-end gap-2 self-end max-w-[85%]"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#14B8A6]">
        <Sparkles size={10} />
        Rascunho da IA{(msg.metadata as any)?.part ? ` (Parte ${(msg.metadata as any).part}/${(msg.metadata as any).total_parts})` : ''} · Aguardando aprovação
      </div>

      {editingDraftId === msg.id ? (
        // Edit mode: show ONLY the editor, not the original bubble
        <div className="flex flex-col gap-2 w-full">
          <textarea
            autoFocus
            value={editDraftText}
            onChange={(e) => setEditDraftText(e.target.value)}
            rows={4}
            className="w-full rounded-xl border-[1.5px] border-[#2563EB] bg-white px-3 py-2 text-[13px] text-[#09090B] outline-none resize-none focus:ring-2 focus:ring-[#2563EB]/10"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setEditingDraftId(null)}
              className="rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => handleEditAndSendDraft(msg.id, editDraftText)}
              disabled={draftPending || !editDraftText.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] transition-all disabled:opacity-50"
            >
              <Send size={10} />
              Enviar Editado
            </button>
          </div>
        </div>
      ) : (
        // View mode: show bubble + action buttons
        <>
          <div className="relative rounded-[14px] rounded-br-[3px] border-[1.5px] border-[#CCFBF1] bg-[#F0FDFA] px-4 py-3 text-[13px] leading-relaxed text-[#166534]">
            {msg.content}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDeleteDraft(msg.id)}
              disabled={draftPending}
              className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50"
            >
              <Trash size={10} /> Descartar
            </button>
            <button
              onClick={() => { setEditingDraftId(msg.id); setEditDraftText(msg.content); }}
              disabled={draftPending}
              className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#71717A] hover:bg-[#F4F4F5] transition-all disabled:opacity-50"
            >
              ✏️ Editar
            </button>
            <button
              onClick={() => handleApproveDraft(msg.id)}
              disabled={draftPending}
              className="flex items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#2563EB] px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1D4ED8] transition-all shadow-[0_2px_8px_rgba(37,99,235,0.22)] disabled:opacity-50"
            >
              <Check size={10} /> ✓ Aprovar e Enviar
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 3: Fix Copiloto mode banner — move to sticky header, not inline in timeline**

In the messages area, remove the inline ChatBubble for shadow mode:
```tsx
// DELETE:
{selected.control_mode === 'shadow' && (
  <ChatBubble variant="note">...</ChatBubble>
)}
```

Add it as a sticky banner above the scrollable area instead, between the chat header and the scrollable div:

```tsx
{selected.control_mode === 'shadow' && (
  <div className="flex items-center justify-center gap-1.5 border-b border-[#DBEAFE] bg-[#EFF6FF] px-4 py-1.5">
    <Sparkles size={10} className="text-[#2563EB]" />
    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">
      Modo Copiloto · Aprove rascunhos ou escreva diretamente
    </span>
  </div>
)}
```

Similarly move the `{isAutonomous && <ChatBubble variant="note">...</ChatBubble>}` to be the sticky banner for autonomous mode.

- [ ] **Step 4: Verify TypeScript**

```powershell
pnpm typecheck 2>&1 | Select-String "inbox"
```

- [ ] **Step 5: Commit**

```
git add app/(app)/inbox/inbox-client.tsx
git commit -m "fix(inbox): mobile DOM kept mounted, draft editor replaces bubble, mode banners sticky"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Full typecheck**

```powershell
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 2: Lint**

```powershell
pnpm lint 2>&1 | Select-String "inbox|chat-bubble|date-separator"
```

- [ ] **Step 3: Final commit if any remaining fixes**

```
git add -A
git commit -m "fix(inbox): final typecheck and lint cleanup"
```

---

## Summary of All Fixes Applied

| Issue | Task | Status |
|---|---|---|
| C1 — ordering by `last_message_at` | Task 1 + 4 | ✅ |
| C2 — lead limit increased to 100 | Task 1 | ✅ |
| C3 — message pagination | Task 9 | ✅ |
| A1 — "Ativo agora" dynamic | Task 5 | ✅ |
| A2 — typing indicator → is_processing | Task 5 | ✅ |
| A3 — optimistic message lifecycle | Task 6 | ✅ |
| A4 — date separators | Task 7 | ✅ |
| A5 — editingDraftId reset | Task 4 | ✅ |
| A6 — mobile DOM kept mounted | Task 10 | ✅ |
| M1 — relativeTime fix | Task 7 | ✅ |
| M2 — numeric unread badge | Task 4 | ✅ |
| M3 — error duplication → toast | Task 8 | ✅ |
| M4 — note text consistency | Task 2 | ✅ |
| M6 — draft editor replaces bubble | Task 10 | ✅ |
| M7 — mode banners sticky | Task 10 | ✅ |
| M8 — shadow mode admin client | Task 2 | ✅ |
| B7 — LIVE/OFFLINE null initial state | Task 4 | ✅ |
| I1 — toast system | Task 8 | ✅ |
| I2 — sending status clock icon | Task 6 | ✅ |
| I4 — is_processing indicator | Task 5 | ✅ |
| F1 — date separators | Task 7 | ✅ |
