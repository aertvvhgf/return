import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { openChatThread } from "@/lib/chat-bus";
import { dateTimeLabel } from "@/lib/return";

export function NotificationBell({ signedIn, onLogin, onNavigate }: { signedIn: boolean; onLogin: () => void; onNavigate: (tab: string) => void }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const query = trpc.notifications.list.useQuery(undefined, { enabled: signedIn, refetchInterval: signedIn ? 15_000 : false, refetchOnWindowFocus: true });
  const latestSeen = useRef<number | null>(null);
  const lastSystemNotice = useRef<number | null>(null);
  useEffect(() => {
    const latest = query.data?.items[0]?.id;
    if (latest == null) return;
    if (latestSeen.current == null) { latestSeen.current = latest; return; }
    if (latest > latestSeen.current) {
      const newRows = query.data?.items.filter(item => item.id > latestSeen.current!).sort((a, b) => a.id - b.id) ?? [];
      latestSeen.current = latest;
      const eligible = newRows.filter(item => item.id !== lastSystemNotice.current);
      const mostRecent = eligible[eligible.length - 1];
      if (mostRecent && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(mostRecent.title, { body: mostRecent.summary, tag: `return-notice-${mostRecent.id}` });
        lastSystemNotice.current = mostRecent.id;
      }
    }
  }, [query.data]);
  const refresh = async () => { await Promise.all([utils.notifications.list.invalidate(), utils.notifications.preferences.invalidate()]); };
  const mark = trpc.notifications.markRead.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const remove = trpc.notifications.delete.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const removeAll = trpc.notifications.deleteAll.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const requestPermission = async () => {
    if (typeof Notification === "undefined") return toast.error("このブラウザはシステム通知に対応していません。アプリ内通知は利用できます。");
    const result = await Notification.requestPermission();
    toast.message(result === "granted" ? "ブラウザ通知を許可しました。アプリを開いている間に通知します。" : "ブラウザ通知は許可されませんでした。アプリ内通知は利用できます。");
  };

  return <div className="relative">
    <button type="button" aria-label={`通知${query.data?.unreadCount ? `、未読${query.data.unreadCount}件` : ""}`} aria-expanded={open} className="relative rounded-xl border border-border bg-white p-2.5 text-slate-600 hover:bg-accent" onClick={() => { if (!signedIn) return onLogin(); setOpen(!open); }}><Bell className="h-5 w-5" />{signedIn && !!query.data?.unreadCount && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{query.data.unreadCount > 99 ? "99+" : query.data.unreadCount}</span>}</button>
    {open && <div className="fixed inset-x-3 top-[76px] z-50 max-h-[calc(100dvh-96px)] min-w-0 overflow-hidden rounded-2xl border border-border bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:max-h-none sm:w-[min(92vw,420px)]">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border p-4"><div className="min-w-0"><h2 className="font-bold">通知</h2><p className="text-xs text-muted-foreground">未読 {query.data?.unreadCount ?? 0} 件</p></div><div className="flex shrink-0 gap-1"><button type="button" title="すべて既読" className="rounded-lg p-2 hover:bg-muted" onClick={() => markAll.mutate()}><CheckCheck className="h-4 w-4" /></button><button type="button" title="通知設定" className="rounded-lg p-2 hover:bg-muted" onClick={() => { setOpen(false); onNavigate("mypage"); }}><BellRing className="h-4 w-4" /></button></div></div>
      <div className="max-h-[calc(100dvh-190px)] overflow-y-auto overscroll-contain">{query.isLoading && <p className="p-6 text-center text-sm text-muted-foreground">通知を読み込み中…</p>}{query.data?.items.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">通知はありません。</p>}{query.data?.items.map(item => <article key={item.id} className={`min-w-0 border-b border-border p-4 ${item.readAt ? "bg-white" : "bg-teal-50/70"}`}>
        <button type="button" className="block w-full min-w-0 text-left" onClick={() => { if (!item.readAt) mark.mutate({ id: item.id }); setOpen(false); if (item.threadId) { openChatThread(item.threadId); return; } onNavigate(item.kind === "match" ? "mypage" : "mediation"); }}><div className="flex min-w-0 items-start justify-between gap-2"><b className="min-w-0 break-words text-sm">{item.title}</b>{!item.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-600" />}</div><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.summary}</p><p className="mt-2 text-[10px] text-muted-foreground">{dateTimeLabel(item.createdAt)}</p></button>
        <div className="mt-2 flex justify-end gap-2">{(item.mediationId || item.threadId) && <button className="inline-flex items-center gap-1 text-xs text-primary underline" onClick={() => { setOpen(false); if (item.threadId) { openChatThread(item.threadId); return; } onNavigate("mediation"); }}><ExternalLink className="h-3 w-3" />{item.threadId ? "トークへ" : "案件へ"}</button>}<button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-700" onClick={() => remove.mutate({ id: item.id })}><Trash2 className="h-3 w-3" />削除</button></div>
      </article>)}</div>
      <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" className="app-button-secondary w-full text-xs sm:w-auto" onClick={requestPermission}>ブラウザ通知を許可</button><button type="button" className="self-end text-xs font-semibold text-red-700 underline sm:self-auto" onClick={() => { if (window.confirm("保存済み通知をすべて削除しますか？")) removeAll.mutate(); }}>すべて削除</button></div>
    </div>}
  </div>;
}
