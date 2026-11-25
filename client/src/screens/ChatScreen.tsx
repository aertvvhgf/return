import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BellOff, Check, ChevronLeft, ImagePlus, MapPinned, MessageCircle, MessageSquarePlus, MoreVertical,
  Pin, Plus, Search, Send, ShieldAlert, Smile, Trash2, Users, X,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Dialog, EmptyState, type RouterOutputs } from "@/components/return/Primitives";
import { trpc } from "@/lib/trpc";
import { imageToSanitizedJpegDataUrl } from "@/lib/image";

type ChatThread = RouterOutputs["chat"]["list"][number];
type ChatMessage = RouterOutputs["chat"]["messages"]["messages"][number];

const FALLBACK_THREAD_ID = "00000000-0000-4000-8000-000000000000";
const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"] as const;
const AVATAR_COLORS = [
  "bg-teal-600", "bg-indigo-500", "bg-amber-500", "bg-rose-500", "bg-sky-600", "bg-emerald-600",
];

function avatarColor(seed: number | string) {
  const value = typeof seed === "number" ? seed : Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_COLORS[Math.abs(value) % AVATAR_COLORS.length];
}

function initialOf(name: string) {
  return Array.from(name.trim())[0] ?? "?";
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function listTimeLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  if (sameDay(date, now)) return timeLabel(date);
  if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date);
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }).format(date);
}

function dayLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  if (sameDay(date, now)) return "今日";
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (sameDay(date, yesterday)) return "昨日";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
}

function Avatar({ name, id, size = "md" }: { name: string; id: number | string; size?: "sm" | "md" | "lg" }) {
  const dimension = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm";
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${dimension} ${avatarColor(id)}`} aria-hidden>
      {initialOf(name)}
    </span>
  );
}

export default function ChatScreen({ userId, initialThreadId, onSeedUsed, profileCode, initialProfileCode }: {
  userId: number;
  initialThreadId?: string | null;
  onSeedUsed?: () => void;
  profileCode?: string | null;
  initialProfileCode?: string | null;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | "dm" | "group">("all");
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newTab, setNewTab] = useState<"dm" | "group">("dm");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState<number[]>([]);
  const [contactKeyword, setContactKeyword] = useState("");
  const [profileCodeInput, setProfileCodeInput] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionMenuId, setReactionMenuId] = useState<number | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addIds, setAddIds] = useState<number[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<"personal_information" | "harassment" | "fraud" | "unsafe_handover" | "spam" | "other">("other");
  const [reportDetails, setReportDetails] = useState("");
  const [confirmReport, setConfirmReport] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("1000");
  const [transferNote, setTransferNote] = useState("");
  const [transferPurpose, setTransferPurpose] = useState("返却のお礼");
  const [transferReference, setTransferReference] = useState("");
  const [transferStep, setTransferStep] = useState<1 | 2>(1);
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [swipedThreadId, setSwipedThreadId] = useState<string | null>(null);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>([]);
  const [hiddenThreadIds, setHiddenThreadIds] = useState<string[]>([]);
  const swipeStartX = useRef<number | null>(null);
  const swipeMoved = useRef(false);
  const utils = trpc.useUtils();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const threadPrefsKey = `return-chat-thread-prefs-${userId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(threadPrefsKey) || "{}") as { pinned?: unknown; hidden?: unknown };
      setPinnedThreadIds(Array.isArray(saved.pinned) ? saved.pinned.filter((id): id is string => typeof id === "string") : []);
      setHiddenThreadIds(Array.isArray(saved.hidden) ? saved.hidden.filter((id): id is string => typeof id === "string") : []);
    } catch { setPinnedThreadIds([]); setHiddenThreadIds([]); }
  }, [threadPrefsKey]);
  const saveThreadPrefs = (pinned: string[], hidden: string[]) => {
    setPinnedThreadIds(pinned); setHiddenThreadIds(hidden);
    localStorage.setItem(threadPrefsKey, JSON.stringify({ pinned, hidden }));
  };

  const list = trpc.chat.list.useQuery(undefined, { refetchInterval: 5_000, refetchOnWindowFocus: true });
  const detail = trpc.chat.messages.useQuery(
    { threadId: selectedId || FALLBACK_THREAD_ID, limit: 60 },
    { enabled: Boolean(selectedId), refetchInterval: selectedId ? 4_000 : false },
  );
  const contacts = trpc.chat.contacts.useQuery(undefined, { enabled: newOpen || addOpen });
  const profileLookup = trpc.chat.profileLookup.useQuery({ profileCode: profileCodeInput.trim().toUpperCase() }, { enabled: newOpen && newTab === "dm" && /^R[0-9]{7,}$/.test(profileCodeInput.trim().toUpperCase()) });

  useEffect(() => {
    if (!initialThreadId) return;
    setSelectedId(initialThreadId);
    onSeedUsed?.();
  }, [initialThreadId, onSeedUsed]);

  const threads = useMemo(() => {
    const rows = list.data ?? [];
    return rows.filter(row => {
      if (hiddenThreadIds.includes(row.id)) return false;
      if (filter === "dm" && row.kind !== "dm") return false;
      if (filter === "group" && row.kind !== "group") return false;
      if (!keyword.trim()) return true;
      return `${row.title} ${row.lastMessagePreview}`.toLowerCase().includes(keyword.trim().toLowerCase());
    }).sort((a, b) => Number(pinnedThreadIds.includes(b.id)) - Number(pinnedThreadIds.includes(a.id)) || new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [list.data, filter, keyword, hiddenThreadIds, pinnedThreadIds]);

  const selectedThread = list.data?.find(row => row.id === selectedId) ?? detail.data?.thread ?? null;
  const visibleMessages = useMemo(() => {
    const rows = detail.data?.messages ?? [];
    return messageSearch.trim() ? rows.filter(row => row.body.toLowerCase().includes(messageSearch.trim().toLowerCase())) : rows;
  }, [detail.data?.messages, messageSearch]);
  const otherContacts = useMemo(
    () => (contacts.data ?? []).filter(person => !(detail.data?.thread.members ?? []).some(member => member.id === person.id)),
    [contacts.data, detail.data?.thread.members],
  );

  const invalidate = async () => {
    await Promise.all([
      utils.chat.list.invalidate(),
      utils.chat.unreadCount.invalidate(),
      selectedId ? utils.chat.messages.invalidate({ threadId: selectedId, limit: 60 }) : Promise.resolve(),
    ]);
  };

  const send = trpc.chat.send.useMutation({
    onSuccess: async () => { setDraft(""); setAttachment(null); await invalidate(); },
    onError: error => toast.error(error.message),
  });
  const markRead = trpc.chat.markRead.useMutation({ onSuccess: async () => { await Promise.all([utils.chat.list.invalidate(), utils.chat.unreadCount.invalidate()]); } });
  const startDm = trpc.chat.startDm.useMutation({
    onSuccess: async result => {
      setNewOpen(false);
      setContactKeyword("");
      setSelectedId(result.threadId);
      await invalidate();
      toast.success(result.created ? "トークを開始しました。" : "既存のトークを開きました。");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    if (!initialProfileCode || !/^R[0-9]{7,}$/.test(initialProfileCode.trim().toUpperCase())) return;
    startDm.mutate({ profileCode: initialProfileCode.trim().toUpperCase() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProfileCode]);
  useEffect(() => {
    if (!qrOpen || !profileCode) return;
    void QRCode.toDataURL(`${window.location.origin}/?profile=${encodeURIComponent(profileCode)}#chat`, { width: 280, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [qrOpen, profileCode]);
  const createGroup = trpc.chat.createGroup.useMutation({
    onSuccess: async result => {
      setNewOpen(false);
      setGroupTitle("");
      setGroupMembers([]);
      setSelectedId(result.threadId);
      await invalidate();
      toast.success("グループトークを作成しました。");
    },
    onError: error => toast.error(error.message),
  });
  const rename = trpc.chat.updateGroup.useMutation({
    onSuccess: async () => { setRenameOpen(false); setMenuOpen(false); await invalidate(); toast.success("グループ名を変更しました。"); },
    onError: error => toast.error(error.message),
  });
  const addMembers = trpc.chat.addMembers.useMutation({
    onSuccess: async result => {
      setAddOpen(false);
      setAddIds([]);
      setMenuOpen(false);
      await invalidate();
      toast.success(`${result.added}人をグループに追加しました。`);
    },
    onError: error => toast.error(error.message),
  });
  const leave = trpc.chat.leave.useMutation({
    onSuccess: async () => { setMenuOpen(false); setSelectedId(""); await invalidate(); toast.success("グループから退出しました。"); },
    onError: error => toast.error(error.message),
  });
  const mute = trpc.chat.setMuted.useMutation({
    onSuccess: async result => { setMenuOpen(false); await invalidate(); toast.success(result.muted ? "このトークの通知をオフにしました。" : "このトークの通知をオンに戻しました。"); },
    onError: error => toast.error(error.message),
  });
  const block = trpc.chat.blockCounterpart.useMutation({
    onSuccess: async () => { setMenuOpen(false); await invalidate(); toast.success("相手をブロックしました。以降のメッセージ送信は停止されます。"); },
    onError: error => toast.error(error.message),
  });
  const react = trpc.chat.react.useMutation({ onSuccess: invalidate, onError: error => toast.error(error.message) });
  const pin = trpc.chat.pin.useMutation({ onSuccess: invalidate, onError: error => toast.error(error.message) });
  const report = trpc.chat.reportThread.useMutation({
    onSuccess: async result => {
      setReportOpen(false);
      setReportDetails("");
      setConfirmReport(false);
      setMenuOpen(false);
      toast.success(result.ownerNotificationAccepted ? "通報を保存し、運営者へ送信しました。確認・返信は保証されません。" : "通報は保存されましたが、運営者への通知に失敗しました。緊急時は公的機関へ相談してください。");
    },
    onError: error => toast.error(error.message),
  });

  // Mark the opened thread as read once its unread count is known.
  useEffect(() => {
    if (!selectedThread || selectedThread.unreadCount === 0) return;
    markRead.mutate({ threadId: selectedThread.id });
  }, [selectedThread?.id, selectedThread?.unreadCount]);

  useEffect(() => {
    if (!detail.data?.messages.length) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [detail.data?.messages.length, selectedId]);

  const submitDraft = () => {
    if (!selectedId || (!draft.trim() && !attachment) || send.isPending) return;
    send.mutate({ threadId: selectedId, body: draft.trim(), imageDataUrl: attachment?.url, attachmentName: attachment?.name });
  };

  const chooseImage = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("JPEG・PNG・WebP画像を選択してください。");
    if (file.size > 5 * 1024 * 1024) return toast.error("画像サイズは5MB以下にしてください。");
    setImageBusy(true);
    try {
      const dataUrl = await imageToSanitizedJpegDataUrl(file, 1600, 0.84);
      setAttachment({ url: dataUrl, name: file.name || "画像.jpg" });
      toast.success("画像を送信準備しました。送信ボタンで送れます。");
    } catch { toast.error("画像を安全に処理できませんでした。"); }
    finally { setImageBusy(false); }
  };

  const renderMessages = (messages: ChatMessage[]) => messages.map((message, index) => {
    if (message.kind === "system") {
      return <p key={message.id} className="mx-auto max-w-[85%] rounded-full bg-muted px-3 py-1.5 text-center text-[11px] leading-5 text-muted-foreground">{message.body}</p>;
    }
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const showDay = !previous || !sameDay(new Date(previous.createdAt), new Date(message.createdAt));
    const grouped = previous && previous.senderId === message.senderId && previous.kind === "text" && !showDay;
    const lastOfRun = !next || next.senderId !== message.senderId || next.kind !== "text";
    return (
      <div key={message.id}>
        {showDay && <p className="my-4 text-center text-[11px] font-semibold text-muted-foreground"><span className="rounded-full bg-muted px-3 py-1">{dayLabel(message.createdAt)}</span></p>}
        <div className={`flex items-end gap-2 ${message.isMine ? "flex-row-reverse" : ""} ${grouped ? "mt-1" : "mt-3"}`}>
          <span className="w-8 shrink-0">
            {!message.isMine && lastOfRun && <Avatar name={message.senderName} id={message.senderId} size="sm" />}
          </span>
          <div className={`max-w-[78%] sm:max-w-[70%] ${message.isMine ? "items-end" : "items-start"} flex flex-col`}>
            {!message.isMine && !grouped && selectedThread?.kind === "group" && <span className="mb-1 text-[10px] font-semibold text-muted-foreground">{message.senderName}</span>}
            <div className={`chat-line-bubble whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.isMine ? "chat-line-bubble-mine rounded-br-md" : "chat-line-bubble-other rounded-bl-md"}`}>
              {message.attachmentUrl && <img src={message.attachmentUrl} alt={message.attachmentName || "添付画像"} className="mb-2 max-h-56 max-w-full rounded-xl object-contain" />}
              {message.body !== "画像を送信しました" && message.body}
            </div>
            {message.reactions.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{message.reactions.map(reaction => <button key={reaction.emoji} type="button" className={`rounded-full border px-2 py-0.5 text-[11px] ${reaction.active ? "border-primary bg-accent text-primary" : "border-border bg-white text-muted-foreground"}`} onClick={() => react.mutate({ threadId: selectedId, messageId: message.id, emoji: reaction.emoji })}>{reaction.emoji} {reaction.count}</button>)}</div>}
            <div className="relative mt-1 flex gap-1"><button type="button" className={`rounded-full px-1.5 text-[11px] ${message.pinned ? "bg-amber-100 text-amber-700" : "text-muted-foreground hover:bg-accent"}`} onClick={() => pin.mutate({ threadId: selectedId, messageId: message.id, pinned: !message.pinned })} title={message.pinned ? "ピン留めを解除" : "ピン留め"}><Pin className={`h-3 w-3 ${message.pinned ? "fill-current" : ""}`} /></button><button type="button" className="rounded-full px-1.5 text-[11px] text-muted-foreground hover:bg-accent" onClick={() => setReactionMenuId(reactionMenuId === message.id ? null : message.id)} title="リアクションを追加"><Smile className="h-3 w-3" /></button>{reactionMenuId === message.id && <div className="absolute bottom-7 left-0 z-20 flex gap-1 rounded-full border border-border bg-white p-1 shadow-lg">{REACTION_OPTIONS.map(emoji => <button key={emoji} type="button" className="rounded-full p-1.5 text-base hover:bg-accent" onClick={() => { react.mutate({ threadId: selectedId, messageId: message.id, emoji }); setReactionMenuId(null); }} aria-label={`${emoji}リアクション`}>{emoji}</button>)}</div>}</div>
            {lastOfRun && <span className="mt-1 px-1 text-[10px] text-muted-foreground">{timeLabel(message.createdAt)}{message.isMine ? " · 送信済み" : ""}</span>}
          </div>
        </div>
      </div>
    );
  });

  return (
    <div className="chat-line-shell">
      <div className="chat-page-heading mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.12em] text-primary">拾得者・持ち主とのやり取り</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">トーク</h1>
          <p className="mt-1 text-sm text-muted-foreground">個人チャットとグループチャット。未読は5秒ごとに更新されます。</p>
        </div>
        <button className="app-button-primary" onClick={() => { setNewOpen(true); setNewTab("dm"); }}>
          <MessageSquarePlus className="h-4 w-4" />新しいトーク
        </button>
      </div>

      <div className="chat-line-panel app-card overflow-hidden">
        <div className="grid h-[calc(100dvh-13rem)] min-h-[560px] max-h-[900px] md:grid-cols-[clamp(260px,32%,340px)_minmax(0,1fr)]">
          <aside className={`min-h-0 flex-col border-border md:flex md:border-r ${selectedId ? "hidden" : "flex"}`}>
            <div className="border-b border-border p-3">
              <label className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="トークを検索" value={keyword} onChange={event => setKeyword(event.target.value)} />
                {keyword && <button aria-label="検索をクリア" onClick={() => setKeyword("")}><X className="h-4 w-4 text-muted-foreground" /></button>}
              </label>
              <div className="mt-2 flex gap-1">
                {([{ key: "all", label: "すべて" }, { key: "dm", label: "個人" }, { key: "group", label: "グループ" }] as const).map(item => (
                  <button key={item.key} onClick={() => setFilter(item.key)} aria-pressed={filter === item.key} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === item.key ? "bg-teal-600 text-white" : "bg-muted text-muted-foreground hover:bg-accent"}`}>{item.label}</button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.isLoading && <p className="p-6 text-center text-sm text-muted-foreground">トークを読み込み中…</p>}
              {list.isError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">トークを取得できませんでした。</p>}
              {!list.isLoading && threads.length === 0 && (
                <div className="p-4">
                  <EmptyState
                    title={keyword ? "一致するトークがありません" : "まだトークがありません"}
                    detail={keyword ? "検索語を変えてお試しください。" : "拾得投稿の詳細から「トークで質問」を押すか、仲介案件の相手と話すとここに表示されます。"}
                  />
                </div>
              )}
              {threads.map(thread => {
                const isSwiped = swipedThreadId === thread.id;
                const isPinned = pinnedThreadIds.includes(thread.id);
                return <div key={thread.id} className="chat-swipe-row border-b border-border/60">
                  <div className="chat-swipe-actions" aria-hidden={!isSwiped}>
                    <button type="button" className="chat-swipe-action chat-swipe-pin" onClick={() => { saveThreadPrefs(isPinned ? pinnedThreadIds.filter(id => id !== thread.id) : [...pinnedThreadIds, thread.id], hiddenThreadIds); setSwipedThreadId(null); }}><Pin className={`h-4 w-4 ${isPinned ? "fill-current" : ""}`} /><span>{isPinned ? "解除" : "固定"}</span></button>
                    <button type="button" className="chat-swipe-action chat-swipe-delete" onClick={() => { if (!window.confirm("このトークを一覧から削除しますか？メッセージ自体は相手側からは削除されません。")) return; saveThreadPrefs(pinnedThreadIds.filter(id => id !== thread.id), [...hiddenThreadIds, thread.id]); if (selectedId === thread.id) setSelectedId(""); setSwipedThreadId(null); }}><Trash2 className="h-4 w-4" /><span>削除</span></button>
                  </div>
                  <button
                    type="button"
                    onTouchStart={event => { swipeStartX.current = event.touches[0]?.clientX ?? null; swipeMoved.current = false; }}
                    onTouchMove={event => { if (swipeStartX.current == null) return; if (Math.abs((event.touches[0]?.clientX ?? swipeStartX.current) - swipeStartX.current) > 12) swipeMoved.current = true; }}
                    onTouchEnd={event => { const start = swipeStartX.current; const end = event.changedTouches[0]?.clientX ?? start ?? 0; swipeStartX.current = null; if (start != null && Math.abs(end - start) > 40) setSwipedThreadId(isSwiped ? null : thread.id); }}
                    onClick={() => { if (swipeMoved.current) { swipeMoved.current = false; return; } if (isSwiped) { setSwipedThreadId(null); return; } setSelectedId(thread.id); }}
                    className={`chat-swipe-content relative flex w-full items-center gap-3 px-3 py-3 text-left transition-transform ${thread.id === selectedId ? "bg-teal-50" : "bg-white hover:bg-muted/60"} ${isSwiped ? "-translate-x-36" : "translate-x-0"}`}
                  >
                    <Avatar name={thread.title} id={thread.kind === "group" ? thread.id : (thread.counterpartId ?? thread.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {isPinned && <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-amber-600" />}
                        {thread.kind === "group" && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                        <b className="truncate text-sm">{thread.title}</b>
                        {thread.communicationBlocked && <BellOff className="h-3 w-3 shrink-0 text-amber-600" />}
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{listTimeLabel(thread.lastMessageAt)}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="truncate text-xs text-muted-foreground">{thread.lastMessagePreview}</span>
                        {thread.unreadCount > 0 && <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{thread.unreadCount > 99 ? "99+" : thread.unreadCount}</span>}
                      </span>
                    </span>
                  </button>
                </div>;
              })}
            </div>
          </aside>

          <section className={`min-h-0 flex-col md:flex ${selectedId ? "flex" : "hidden"}`}>
            {!selectedThread ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary"><MessageCircle className="h-6 w-6" /></span>
                <p className="font-bold">トークを選んでください</p>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">左の一覧から会話を選ぶか、「新しいトーク」から相手を選んでください。</p>
              </div>
            ) : (
              <>
                <header className="chat-line-header flex items-center gap-2 border-b border-border px-3 py-2.5">
                  <button className="rounded-lg p-1.5 hover:bg-muted md:hidden" aria-label="トーク一覧へ戻る" onClick={() => setSelectedId("")}><ChevronLeft className="h-5 w-5" /></button>
                  <Avatar name={selectedThread.title} id={selectedThread.kind === "group" ? selectedThread.id : (selectedThread.counterpartId ?? selectedThread.id)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{selectedThread.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {selectedThread.kind === "group" ? `グループ・${selectedThread.memberCount}人` : "1対1のトーク"}
                      {selectedThread.topic ? ` · ${selectedThread.topic}` : ""}
                    </p>
                  </div>
                  <div className="relative">
                    <button className="rounded-lg p-2 hover:bg-muted" aria-label="トークのメニュー" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><MoreVertical className="h-4 w-4" /></button>
                    {menuOpen && <div className="absolute right-0 top-10 z-30 w-56 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-xl">
                      {selectedThread.kind === "group" && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setAddOpen(true); setAddIds([]); setMenuOpen(false); }}><Plus className="h-4 w-4" />メンバーを追加</button>}
                      {selectedThread.kind === "group" && selectedThread.members.some(member => member.isMe && member.role === "owner") && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setRenameValue(selectedThread.title); setRenameOpen(true); setMenuOpen(false); }}><Check className="h-4 w-4" />グループ名を変更</button>}
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => mute.mutate({ threadId: selectedThread.id, muted: true })}><BellOff className="h-4 w-4" />通知をオフ</button>
                      {selectedThread.kind === "group" && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => { if (window.confirm("このグループから退出しますか？")) leave.mutate({ threadId: selectedThread.id }); }}><ArrowLeft className="h-4 w-4" />グループを退出</button>}
                      {selectedThread.kind === "dm" && <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => { if (window.confirm("この相手をブロックしますか？以降のメッセージ送信が停止されます。")) block.mutate({ threadId: selectedThread.id }); }}><ShieldAlert className="h-4 w-4" />相手をブロック</button>}
                      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => { setReportOpen(true); setMenuOpen(false); }}><ShieldAlert className="h-4 w-4" />運営へ通報</button>
                    </div>}
                  </div>
                </header>

                <div className="chat-line-messages min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-5">
                  {detail.isLoading && <p className="p-6 text-center text-sm text-muted-foreground">メッセージを読み込み中…</p>}
                  {detail.isError && <p role="alert" className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">メッセージを取得できませんでした。</p>}
                  {detail.data && detail.data.messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">まだメッセージはありません。最初のメッセージを送ってみましょう。</p>}
                  {detail.data && renderMessages(detail.data.messages)}
                  <div ref={bottomRef} />
                </div>

                {detail.data && !detail.data.canPost && <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">ブロック状態のため送信できません。マイページのブロック一覧から解除できます。</p>}
                <form className="chat-line-composer border-t border-border p-2.5" onSubmit={event => { event.preventDefault(); submitDraft(); }}>
                  {attachment && <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/70 p-2"><img src={attachment.url} alt="送信する画像" className="h-14 w-14 rounded-lg object-cover" /><span className="min-w-0 flex-1 truncate text-xs">{attachment.name}</span><button type="button" className="rounded-full p-1 text-muted-foreground hover:bg-muted" onClick={() => setAttachment(null)} aria-label="画像を外す"><X className="h-4 w-4" /></button></div>}
                  <div className="flex items-end gap-2">
                    <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-stone-300 bg-white text-stone-600 hover:bg-stone-50" aria-label="画像を選択">
                      {imageBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" /> : <ImagePlus className="h-5 w-5" />}
                      <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusy || send.isPending} onChange={event => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
                    </label>
                    <textarea
                      className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-border bg-white px-3.5 py-2.5 text-sm leading-6 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                      rows={1}
                      value={draft}
                      maxLength={2000}
                      placeholder="メッセージを入力（Enterで送信 / Shift+Enterで改行）"
                      onChange={event => setDraft(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          submitDraft();
                        }
                      }}
                    />
                    <button className="app-button-primary h-11 px-4" disabled={(!draft.trim() && !attachment) || send.isPending || !detail.data?.canPost} aria-label="送信">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1.5 px-1 text-[10px] leading-4 text-muted-foreground">電話番号・メール・住所・SNS ID・外部リンクは送信できません。{draft.length > 1800 ? ` ${draft.length}/2000` : ""}</p>
                </form>
              </>
            )}
          </section>
        </div>
      </div>

      <div className="chat-line-shortcuts mt-3 grid grid-cols-4 gap-1 rounded-2xl border border-border bg-white/75 p-2 shadow-sm backdrop-blur md:hidden">
        <label className="chat-line-shortcut cursor-pointer"><ImagePlus className="h-5 w-5" /><span>画像</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusy} onChange={event => { void chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
        <button type="button" className="chat-line-shortcut" onClick={() => setTransferOpen(true)}><span className="text-lg font-black leading-none">￥</span><span>送金</span></button>
        <button type="button" className="chat-line-shortcut" onClick={() => toast.info("位置情報は正確な住所を送らず、仲介画面で確認してください。")}><MapPinned className="h-5 w-5" /><span>位置情報</span></button>
        <button type="button" className="chat-line-shortcut" onClick={() => toast.info("メッセージ予約は今後追加予定です。")}><MessageSquarePlus className="h-5 w-5" /><span>メッセージ予約</span></button>
      </div>

      <Dialog open={transferOpen} onClose={() => { setTransferOpen(false); setTransferStep(1); setTransferConfirm(false); }} title={transferStep === 1 ? "送金内容を入力" : "送金内容の最終確認"}>
        {transferStep === 1 ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); const amount = Number(transferAmount); if (!Number.isInteger(amount) || amount < 100 || amount > 100000) { toast.error("金額は100円〜100,000円で入力してください。"); return; } setTransferStep(2); }}>
          <div className="rounded-xl border border-border bg-muted/60 p-3"><p className="text-xs font-bold text-muted-foreground">送金先</p><p className="mt-1 font-bold">{selectedThread?.title || "このトークの相手"}</p><p className="mt-1 text-xs text-muted-foreground">{selectedThread?.kind === "group" ? "グループトーク：個人を送金先に指定できません" : "現在開いている個人トークの相手"}</p></div>
          <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">この画面では外部送金は実行されません。返却に関する謝礼は、仲介案件で相手の同意を得てから正式に手続きしてください。</p>
          <label><span className="app-label">送金目的</span><select className="app-input" value={transferPurpose} onChange={event => setTransferPurpose(event.target.value)}><option>返却のお礼</option><option>交通費の補助</option><option>保管費用の補助</option><option>その他</option></select></label>
          <label><span className="app-label">金額（円）</span><input className="app-input" type="number" min="100" max="100000" step="100" value={transferAmount} onChange={event => setTransferAmount(event.target.value)} required /><span className="mt-1 block text-xs text-muted-foreground">最低100円・上限100,000円／手数料は表示額に含まれません。</span></label>
          <label><span className="app-label">仲介案件ID（任意）</span><input className="app-input" maxLength={36} value={transferReference} onChange={event => setTransferReference(event.target.value)} placeholder="仲介画面の案件IDがあれば入力" /></label>
          <label><span className="app-label">相手に伝えるメッセージ（任意）</span><textarea className="app-input min-h-20" maxLength={300} value={transferNote} onChange={event => setTransferNote(event.target.value)} placeholder="例: 返却していただき、ありがとうございました。" /><span className="mt-1 block text-right text-xs text-muted-foreground">{transferNote.length}/300</span></label>
          <button className="app-button-primary w-full justify-center" type="submit" disabled={selectedThread?.kind === "group"}>確認画面へ進む</button>
        </form> : <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm"><p className="text-xs text-muted-foreground">送金先</p><p className="mt-1 text-lg font-bold">{selectedThread?.title || "このトークの相手"}</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">目的</dt><dd className="font-semibold">{transferPurpose}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">送金額</dt><dd className="text-xl font-black">¥{Number(transferAmount).toLocaleString()}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">手数料</dt><dd>未接続のため発生しません</dd></div>{transferReference && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">案件ID</dt><dd className="max-w-[65%] truncate font-mono text-xs">{transferReference}</dd></div>}</dl>{transferNote && <p className="mt-3 rounded-lg bg-muted p-3 text-sm leading-5">{transferNote}</p>}</div>
          <div className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-900"><b>重要：</b>現在はPayPay等の決済APIが未接続のため、実際の送金・引き落としは行われません。決済連携後も、相手の同意と仲介案件の確認が必要です。</div>
          <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm leading-5"><input type="checkbox" className="mt-1 h-4 w-4 accent-teal-700" checked={transferConfirm} onChange={event => setTransferConfirm(event.target.checked)} /><span>送金先・目的・金額を確認しました。外部送金はまだ実行されないことを理解しています。</span></label>
          <div className="flex gap-2"><button type="button" className="app-button-secondary flex-1" onClick={() => { setTransferStep(1); setTransferConfirm(false); }}>戻る</button><button type="button" className="app-button-primary flex-1" disabled={!transferConfirm} onClick={() => { setTransferOpen(false); setTransferStep(1); setTransferConfirm(false); toast.info("送金内容を確認しました。実際の送金は仲介画面の謝礼機能から、相手の同意後に行ってください。"); }}>内容を確定</button></div>
        </div>}
      </Dialog>

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} title="プロフィールQRコード">
        {profileCode ? <div className="flex flex-col items-center gap-4 text-center"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">プロフィールID</p><p className="mt-1 font-mono text-xl font-bold tracking-wider">{profileCode}</p></div><div className="rounded-2xl border border-border bg-white p-2 shadow-sm">{qrDataUrl ? <img src={qrDataUrl} alt={`${profileCode}のプロフィールQRコード`} className="h-64 w-64" /> : <div className="h-64 w-64 animate-pulse rounded-xl bg-muted" />}</div><p className="max-w-sm text-sm leading-6 text-muted-foreground">相手にこのQRコードを読み取ってもらうと、returnであなたとのトークを開始できます。</p><button className="app-button-secondary" onClick={() => void navigator.clipboard?.writeText(profileCode)}>プロフィールIDをコピー</button></div> : <p className="text-sm text-muted-foreground">プロフィールIDを準備中です。</p>}
      </Dialog>

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="新しいトーク">
        <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1">
          {([{ key: "dm", label: "個人チャット" }, { key: "group", label: "グループ" }] as const).map(item => (
            <button key={item.key} onClick={() => setNewTab(item.key)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${newTab === item.key ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}>{item.label}</button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2"><button type="button" className="app-button-secondary px-3 py-2 text-xs" onClick={() => { setNewOpen(false); setQrOpen(true); }}>自分のQRを表示</button><span className="text-xs text-muted-foreground">プロフィールIDまたは既存の連絡先から追加</span></div>
        <label className="mb-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="w-full bg-transparent text-sm outline-none" placeholder="名前またはプロフィールID（例 R0000123）" value={contactKeyword} onChange={event => { setContactKeyword(event.target.value); setProfileCodeInput(event.target.value); }} />
        </label>
        {profileLookup.data && <button type="button" className="mb-3 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-accent p-3 text-left" onClick={() => startDm.mutate({ profileCode: profileLookup.data!.profileCode! })}><Avatar name={profileLookup.data.name} id={profileLookup.data.id} size="sm" /><span className="flex-1"><b className="block text-sm">{profileLookup.data.name}</b><span className="font-mono text-xs text-muted-foreground">{profileLookup.data.profileCode}</span></span><span className="text-xs font-bold text-primary">トーク開始</span></button>}
        {/^R[0-9]{7,}$/.test(profileCodeInput.trim().toUpperCase()) && !profileLookup.isFetching && !profileLookup.data && <p className="mb-3 rounded-xl bg-muted p-3 text-xs text-muted-foreground">そのプロフィールIDのユーザーが見つかりません。</p>}
        {newTab === "group" && <label className="mb-3 block"><span className="app-label">グループ名</span><input className="app-input" value={groupTitle} maxLength={60} onChange={event => setGroupTitle(event.target.value)} placeholder="例: ○○駅での受け渡し相談" /></label>}
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{newTab === "dm" ? "やり取りできる相手" : `メンバー（${groupMembers.length}人選択中）`}</p>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          {contacts.isLoading && <p className="p-4 text-center text-sm text-muted-foreground">連絡先を読み込み中…</p>}
          {!contacts.isLoading && (contacts.data ?? []).length === 0 && <p className="p-4 text-sm leading-6 text-muted-foreground">まだやり取りできる相手がいません。拾得投稿の詳細から「トークで質問」を押すと、投稿者とのトークが始まります。</p>}
          {(contacts.data ?? []).filter(person => person.name.includes(contactKeyword.trim())).map(person => {
            const checked = groupMembers.includes(person.id);
            return (
              <button
                key={person.id}
                className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-muted/60"
                onClick={() => {
                  if (newTab === "dm") { startDm.mutate({ userId: person.id }); return; }
                  setGroupMembers(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id]);
                }}
              >
                <Avatar name={person.name} id={person.id} size="sm" />
                <span className="min-w-0 flex-1"><b className="block truncate text-sm">{person.name}</b><span className="text-[11px] text-muted-foreground">{person.hasThread ? "トークあり" : "仲介案件でつながっています"}</span></span>
                {newTab === "group" ? <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{checked && <Check className="h-3 w-3" />}</span> : <span className="text-xs font-bold text-primary">話す</span>}
              </button>
            );
          })}
        </div>
        {newTab === "group" && <div className="mt-4 flex justify-end"><button className="app-button-primary" disabled={!groupTitle.trim() || groupMembers.length === 0 || createGroup.isPending} onClick={() => createGroup.mutate({ title: groupTitle.trim(), memberIds: groupMembers })}><Users className="h-4 w-4" />グループを作成</button></div>}
      </Dialog>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="メンバーを追加">
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
          {otherContacts.length === 0 && <p className="p-4 text-sm text-muted-foreground">追加できる相手がいません。</p>}
          {otherContacts.map(person => {
            const checked = addIds.includes(person.id);
            return <button key={person.id} className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-muted/60" onClick={() => setAddIds(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])}>
              <Avatar name={person.name} id={person.id} size="sm" /><span className="flex-1 truncate text-sm font-semibold">{person.name}</span>
              <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{checked && <Check className="h-3 w-3" />}</span>
            </button>;
          })}
        </div>
        <div className="mt-4 flex justify-end"><button className="app-button-primary" disabled={!addIds.length || addMembers.isPending} onClick={() => addMembers.mutate({ threadId: selectedId, memberIds: addIds })}>追加する</button></div>
      </Dialog>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title="グループ名を変更">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); rename.mutate({ threadId: selectedId, title: renameValue.trim() }); }}>
          <label><span className="app-label">グループ名</span><input className="app-input" value={renameValue} maxLength={60} onChange={event => setRenameValue(event.target.value)} required /></label>
          <button className="app-button-primary" disabled={!renameValue.trim() || rename.isPending}>保存する</button>
        </form>
      </Dialog>

      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} title="トークの相手を運営へ通報">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!confirmReport) return; report.mutate({ threadId: selectedId, category: reportCategory, details: reportDetails, confirmDisclosure: true }); }}>
          <p className="text-sm leading-6">通報内容とトーク情報は保存され、returnプロジェクト運営者へ送信されます。確認・返信は保証されず、警察等への通報ではありません。</p>
          <label><span className="app-label">通報の種類</span><select className="app-input" value={reportCategory} onChange={event => setReportCategory(event.target.value as typeof reportCategory)}><option value="personal_information">個人情報の要求</option><option value="harassment">嫌がらせ・不適切な連絡</option><option value="fraud">詐欺の懸念</option><option value="unsafe_handover">危険な受け渡し</option><option value="spam">迷惑メッセージ</option><option value="other">その他</option></select></label>
          <label><span className="app-label">状況の説明</span><textarea className="app-input app-textarea" value={reportDetails} onChange={event => setReportDetails(event.target.value)} required minLength={5} maxLength={2000} placeholder="事実と日時を簡潔に記載してください。" /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmReport} onChange={event => setConfirmReport(event.target.checked)} /><span>通報内容を保存し、運営者へ送信することに同意します。</span></label>
          <button className="app-button-primary" disabled={!confirmReport || reportDetails.trim().length < 5 || report.isPending}>通報を送信</button>
        </form>
      </Dialog>

      <p className="mt-3 text-center text-xs text-muted-foreground">表示名は相手のプロフィール名です。電話番号・住所などの個人情報は共有しないでください。</p>
    </div>
  );
}
