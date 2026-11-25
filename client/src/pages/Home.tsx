import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { FileText, Handshake, LogIn, LogOut, MapPinned, Menu, MessagesSquare, PackagePlus, Search, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { NotificationBell } from "@/components/return/NotificationBell";
import { LocalLoginDialog } from "@/components/return/LocalLoginDialog";
import { applySettings, DEFAULT_SETTINGS, type UserSettings } from "@/components/return/AccountSettings";
import { EmptyState, type OwnedPost, type RouterOutputs } from "@/components/return/Primitives";
import { trpc } from "@/lib/trpc";
import type { FacilityType, ItemCategory } from "@/lib/return";
import { tLabel, useAppLanguage, type AppLanguage } from "@/lib/i18n";
const PostFormDialog = lazy(() => import("@/components/return/PostFormDialog").then(module => ({ default: module.PostFormDialog })));
const SearchScreen = lazy(() => import("@/screens/SearchScreen"));
const AiMatchScreen = lazy(() => import("@/screens/AiMatchScreen"));
const MapScreen = lazy(() => import("@/screens/MapScreen"));
const ReportScreen = lazy(() => import("@/screens/ReportScreen"));
const MyPageScreen = lazy(() => import("@/screens/MyPageScreen"));
const SafetyScreen = lazy(() => import("@/screens/SafetyScreen"));
const MediationScreen = lazy(() => import("@/screens/MediationScreen"));
const ChatScreen = lazy(() => import("@/screens/ChatScreen"));

type User = Exclude<RouterOutputs["auth"]["me"], null>;
type SearchSeed = { query: string; category: ItemCategory | null; facilityType: FacilityType | null; route: string | null };
type Tab = "search" | "ai-match" | "map" | "report" | "mypage" | "safety-center" | "mediation" | "chat";
const NAV_ITEMS: { id: Tab; label: string; icon: typeof Search; description: string }[] = [
  { id: "search", label: "一括確認", icon: Search, description: "実投稿をまとめて検索" },
  { id: "ai-match", label: "AI Search", icon: Sparkles, description: "紛失物の候補照合" },
  { id: "map", label: "拾得マップ", icon: MapPinned, description: "位置から探す" },
  { id: "chat", label: "トーク", icon: MessagesSquare, description: "拾得者・持ち主とやり取り" },
  { id: "report", label: "遺失届", icon: FileText, description: "届出用情報を作成" },
  { id: "mediation", label: "仲介管理", icon: Handshake, description: "案件の確認と安全な受渡し" },
  { id: "mypage", label: "マイページ", icon: UserRound, description: "プロフィール・保存データ" },
  { id: "safety-center", label: "安全・連携", icon: ShieldCheck, description: "安全設定・外部連携状態" },
];
const PRIMARY_NAV_IDS: Tab[] = ["search", "ai-match", "map", "chat", "mypage"];
const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter(item => PRIMARY_NAV_IDS.includes(item.id));
const SECONDARY_NAV_ITEMS = NAV_ITEMS.filter(item => !PRIMARY_NAV_IDS.includes(item.id));
const VALID_TABS = new Set<string>(NAV_ITEMS.map(item => item.id));

function LoginRequired({ onLogin, title = "ログインが必要です", detail = "この機能はアカウントにデータを保存し、別の端末にも同期します。ログイン後にご利用ください。" }: { onLogin: () => void; title?: string; detail?: string }) {
  return <div className="app-card p-5 sm:p-8"><EmptyState title={title} detail={detail} action={<button className="app-button-primary" onClick={onLogin}><LogIn className="h-4 w-4" />ログインして続ける</button>} /></div>;
}

export default function Home() {
  const auth = useAuth();
  const user = auth.user as User | null;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const value = window.location.hash.replace(/^#/, "");
    return VALID_TABS.has(value) ? value as Tab : "search";
  });
  const [searchSeed, setSearchSeed] = useState<SearchSeed | null>(null);
  const [guestSearchDraft, setGuestSearchDraft] = useState<SearchSeed | null>(null);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<OwnedPost | null>(null);
  const [openPostAfterLogin, setOpenPostAfterLogin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState<string | null>(null);
  const [profileSeed] = useState<string | null>(() => new URLSearchParams(window.location.search).get("profile"));
  const language = useAppLanguage();
  const signedIn = auth.isAuthenticated && Boolean(user);
  const chatUnread = trpc.chat.unreadCount.useQuery(undefined, { enabled: signedIn, refetchInterval: signedIn ? 15_000 : false, refetchOnWindowFocus: true });
  const unreadTotal = chatUnread.data?.count ?? 0;
  const savedSettings = trpc.personal.profile.settings.useQuery(undefined, { enabled: signedIn, staleTime: 60_000, refetchOnWindowFocus: true });
  useEffect(() => {
    if (!signedIn) { applySettings(DEFAULT_SETTINGS); return; }
    if (!savedSettings.data) return;
    applySettings(savedSettings.data as UserSettings);
  }, [signedIn, savedSettings.data]);

  const onLogin = useCallback(() => setLoginOpen(true), []);
  const goTab = useCallback((tab: string) => {
    if (!VALID_TABS.has(tab)) return;
    setActiveTab(tab as Tab);
    window.history.replaceState(null, "", `/#${tab}`);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: document.documentElement.classList.contains("reduce-motion") ? "auto" : "smooth" });
  }, []);
  const onGuestSearchRequested = useCallback((seed: SearchSeed) => {
    setGuestSearchDraft(seed);
    goTab("mypage");
  }, [goTab]);
  const onPresetApplied = useCallback(() => setSearchSeed(null), []);
  useEffect(() => {
    const onHash = () => { const tab = window.location.hash.replace(/^#/, ""); if (VALID_TABS.has(tab)) setActiveTab(tab as Tab); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const onOpenChat = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      if (detail) setChatSeed(detail);
      goTab("chat");
    };
    window.addEventListener("return:open-chat", onOpenChat as EventListener);
    return () => window.removeEventListener("return:open-chat", onOpenChat as EventListener);
  }, [goTab]);
  useEffect(() => {
    const onOpenLogin = () => setLoginOpen(true);
    window.addEventListener("return:open-login", onOpenLogin);
    return () => window.removeEventListener("return:open-login", onOpenLogin);
  }, []);
  useEffect(() => {
    const title = tLabel(NAV_ITEMS.find(item => item.id === activeTab)?.label ?? "一括確認", language);
    document.title = `${title} | return`;
  }, [activeTab, language]);

  const openPost = () => {
    if (!signedIn) { setOpenPostAfterLogin(true); return onLogin(); }
    setEditingPost(null);
    setPostDialogOpen(true);
  };
  const editPost = (post: OwnedPost) => {
    setEditingPost(post);
    setPostDialogOpen(true);
  };
  const logout = async () => {
    if (!window.confirm("ログアウトしますか？")) return;
    try { await auth.logout(); toast.success("ログアウトしました。"); goTab("search"); }
    catch { toast.error("ログアウトできませんでした。もう一度お試しください。"); }
  };

  let page: ReactNode;
  if (activeTab === "search") page = <SearchScreen signedIn={signedIn} onLogin={onLogin} onNavigate={goTab} onPost={openPost} preset={searchSeed} onPresetApplied={onPresetApplied} onGuestSaveSearch={onGuestSearchRequested} />;
  else if (activeTab === "ai-match") page = <AiMatchScreen signedIn={signedIn} onLogin={onLogin} onNavigate={goTab} />;
  else if (activeTab === "map") page = <MapScreen signedIn={signedIn} onLogin={onLogin} onNavigate={goTab} />;
  else if (activeTab === "report") page = signedIn && user ? <ReportScreen user={user} /> : <LoginRequired onLogin={onLogin} title="遺失届データの保存にはログインが必要です" detail="入力した届出用情報はあなたのアカウントに保存し、別の端末からも確認できます。公的機関への自動提出は行いません。" />;
  else if (activeTab === "chat") page = signedIn && user ? <ChatScreen userId={user.id} profileCode={user.profileCode || `R${String(user.id).padStart(7, "0")}`} initialProfileCode={profileSeed} initialThreadId={chatSeed} onSeedUsed={() => setChatSeed(null)} /> : <LoginRequired onLogin={onLogin} title="トークの利用にはログインが必要です" detail="メッセージと参加メンバーはアカウントに保存され、同じアカウントの別の端末へ同期されます。" />;
  else if (activeTab === "mypage") page = <MyPageScreen user={user} signedIn={signedIn} onLogin={onLogin} onNavigate={goTab} onEditPost={editPost} onRunSearch={seed => setSearchSeed({ ...seed, category: seed.category as ItemCategory | null, facilityType: seed.facilityType as FacilityType | null })} initialGuestSearch={guestSearchDraft} onGuestSearchDraftUsed={() => setGuestSearchDraft(null)} />;
  else if (activeTab === "safety-center") page = <SafetyScreen user={user} signedIn={signedIn} onLogin={onLogin} />;
  else if (activeTab === "mediation") page = signedIn && user ? <MediationScreen userId={user.id} /> : <LoginRequired onLogin={onLogin} title="仲介の利用にはログインが必要です" detail="仲介申請・メッセージ・受け渡し確認は参加者のアカウント間でのみ利用できます。" />;
  else page = <LoginRequired onLogin={onLogin} />;

  const activeItem = NAV_ITEMS.find(item => item.id === activeTab) ?? NAV_ITEMS[0];
  return (
    <div className="app-shell pb-24 lg:pb-0">
      <header className="ios-header no-print sticky top-0 z-50 border-b bg-white/95 backdrop-blur-xl">
        <div className="container flex h-[68px] items-center justify-between gap-3">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => goTab("search")} aria-label="return ホーム">
            <img src="/return-icon-192.png" alt="return" className="h-10 w-10 shrink-0 rounded-[14px] object-cover shadow-sm" />
            <span className="min-w-0"><span className="block text-lg font-extrabold leading-5 tracking-tight text-slate-900">return</span><span className="hidden text-[10px] font-medium tracking-wide text-slate-500 sm:block">見つけて、持ち主へ。</span></span>
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 md:flex"><span className={`h-2 w-2 rounded-full ${signedIn ? "bg-emerald-500" : "bg-slate-400"}`} />{signedIn ? "アカウントと同期中" : "公開検索・ゲスト利用"}</div>
          <div className="flex items-center gap-2">
            <label className="hidden items-center gap-1 rounded-lg border border-border bg-white px-2 py-1.5 text-xs sm:flex"><span className="sr-only">表示言語</span><select className="bg-transparent text-xs font-semibold outline-none" value={language} onChange={event => { const next = event.target.value as AppLanguage; localStorage.setItem("return-language", next); window.dispatchEvent(new CustomEvent("return:language", { detail: next })); }}><option value="ja">日本語</option><option value="en">English</option><option value="zh">中文</option><option value="ko">한국어</option></select></label>
            <NotificationBell signedIn={signedIn} onLogin={onLogin} onNavigate={goTab} />
            {signedIn && user ? <div className="hidden items-center gap-2 sm:flex"><button className="max-w-36 truncate text-sm font-semibold text-slate-700 hover:text-primary" onClick={() => goTab("mypage")} title="マイページ">{user.name?.trim() || "名前未設定"}</button><button className="app-button-secondary px-2.5 py-2 text-xs" onClick={() => void logout()} title="ログアウト"><LogOut className="h-4 w-4" /><span className="hidden md:inline">ログアウト</span></button></div> : <button className="app-button-primary px-3 py-2 text-sm" onClick={onLogin}><LogIn className="h-4 w-4" /><span>ログイン</span></button>}
            <button className="rounded-xl border border-border p-2.5 text-slate-600 lg:hidden" aria-label={mobileMenuOpen ? "メニューを閉じる" : "メニュー"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {mobileMenuOpen && <div className="relative z-50 border-t border-border bg-white px-4 pb-4 pt-2 lg:hidden"><p className="px-2 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">return の機能</p><p className="px-2 pb-1 pt-2 text-[11px] font-bold text-primary">探す・つながる</p><div className="grid grid-cols-2 gap-1">{PRIMARY_NAV_ITEMS.map(item => { const Icon = item.icon; return <button key={item.id} className="app-nav-link" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => goTab(item.id)}><Icon className="h-4 w-4" /><span>{tLabel(item.label, language)}</span>{item.id === "chat" && unreadTotal > 0 && <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">{unreadTotal > 9 ? "9+" : unreadTotal}</span>}</button>; })}</div><p className="px-2 pb-1 pt-3 text-[11px] font-bold text-primary">手続き・安全</p><div className="grid grid-cols-2 gap-1">{SECONDARY_NAV_ITEMS.map(item => { const Icon = item.icon; return <button key={item.id} className="app-nav-link" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => goTab(item.id)}><Icon className="h-4 w-4" /><span>{tLabel(item.label, language)}</span></button>; })}</div>{signedIn && <button className="app-nav-link mt-2" onClick={() => void logout()}><LogOut className="h-4 w-4" />ログアウト</button>}</div>}
      </header>

      <div className="container mx-auto flex gap-6 py-5 lg:py-7">
        <aside className="no-print hidden w-[230px] shrink-0 lg:block">
          <div className="sticky top-[92px] space-y-4">
            <div className="app-card p-3">
              <p className="px-2 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-[.15em] text-slate-400">メイン</p>
              <nav aria-label="メインメニュー" className="space-y-1">{PRIMARY_NAV_ITEMS.map(item => { const Icon = item.icon; return <button key={item.id} className="app-nav-link" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => goTab(item.id)}><Icon className="h-[18px] w-[18px] shrink-0" /><span>{tLabel(item.label, language)}</span>{item.id === "chat" && unreadTotal > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{unreadTotal > 99 ? "99+" : unreadTotal}</span>}</button>; })}</nav>
              <p className="px-2 pb-1 pt-4 text-[10px] font-extrabold uppercase tracking-[.15em] text-slate-400">手続き・安全</p>
              <nav aria-label="手続きと安全" className="space-y-1">{SECONDARY_NAV_ITEMS.map(item => { const Icon = item.icon; return <button key={item.id} className="app-nav-link" aria-current={activeTab === item.id ? "page" : undefined} onClick={() => goTab(item.id)}><Icon className="h-[18px] w-[18px] shrink-0" /><span>{tLabel(item.label, language)}</span></button>; })}</nav>
              <div className="mt-3 border-t border-border pt-3"><button className="app-button-primary w-full justify-center py-3" onClick={openPost}><PackagePlus className="h-4 w-4" />拾得物を投稿</button></div>
            </div>
            <div className="rounded-xl border border-teal-100 bg-teal-50/80 p-4"><p className="text-xs font-bold text-teal-950">安全な仲介のために</p><p className="mt-1 text-xs leading-5 text-teal-900/80">公開投稿に住所・電話番号を書かず、受け渡しは人目のある場所で。</p><button className="mt-2 text-xs font-bold text-teal-800 underline" onClick={() => goTab("safety-center")}>安全の案内を見る</button></div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-6 lg:pb-0" id="main-content">
          <div className="mb-4 flex items-center justify-between gap-3 lg:hidden"><div className="min-w-0"><p className="text-xs font-bold text-primary">{activeItem.description}</p><h1 className="truncate text-lg font-bold">{tLabel(activeItem.label, language)}</h1></div><button className="app-button-primary shrink-0 px-3 py-2 text-sm" onClick={openPost}><PackagePlus className="h-4 w-4" />投稿</button></div>
          <div className="min-h-[70vh]"><Suspense fallback={<div className="app-card flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />画面を読み込んでいます…</div>}>{page}</Suspense></div>
          <footer className="no-print mt-10 border-t border-border py-5 text-center text-xs leading-5 text-muted-foreground">return · なくし物を探す人と拾得者をつなぐサービス<br />警察・交通事業者など外部機関の照会・提出は未接続です。手続きは各公式窓口でご確認ください。</footer>
        </main>
      </div>

      <nav className="ios-bottom-nav no-print fixed z-40 border-t bg-white/90 px-1 pt-1 backdrop-blur-xl lg:hidden" style={{ paddingBottom: "max(env(safe-area-inset-bottom), .25rem)" }} aria-label="モバイルナビゲーション">
        <div className="flex">{PRIMARY_NAV_ITEMS.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => goTab(item.id)} aria-current={activeTab === item.id ? "page" : undefined} className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold ${activeTab === item.id ? "text-primary" : "text-slate-500"}`}><Icon className="h-[18px] w-[18px]" /><span className="whitespace-nowrap">{tLabel(item.label, language)}</span>{item.id === "chat" && unreadTotal > 0 && <span className="absolute right-2 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">{unreadTotal > 9 ? "9+" : unreadTotal}</span>}</button>; })}</div>
      </nav>
      {postDialogOpen && <Suspense fallback={null}><PostFormDialog open={postDialogOpen} initial={editingPost} onClose={() => { setPostDialogOpen(false); setEditingPost(null); }} onSaved={() => setEditingPost(null)} /></Suspense>}
      <LocalLoginDialog open={loginOpen} onClose={() => { setLoginOpen(false); setOpenPostAfterLogin(false); }} onSuccess={async () => { await auth.refresh(); if (openPostAfterLogin) { setOpenPostAfterLogin(false); setEditingPost(null); setPostDialogOpen(true); } }} />
    </div>
  );
}
