import { useEffect, useState } from "react";
import { Bell, Bookmark, FileText, Handshake, Heart, LockKeyhole, MessagesSquare, Package, Share2, ShieldAlert, Sparkles, Star, Trophy, UserRound, UserRoundCheck, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import { AccountSettings } from "@/components/return/AccountSettings";
import { GuestSyncPanel, type GuestSearchDraft } from "@/components/return/GuestSyncPanel";
import { LostTrackingPanel } from "@/components/return/LostTrackingPanel";
import { NotificationSettingsPanel } from "@/components/return/NotificationSettingsPanel";
import { EmptyState, SectionHeading, type OwnedPost, type RouterOutputs } from "@/components/return/Primitives";
import { CATEGORY_LABELS, MEDIATION_STATUS, dateTimeLabel } from "@/lib/return";
import { trpc } from "@/lib/trpc";

type User = Exclude<RouterOutputs["auth"]["me"], null>;
type SavedSearch = RouterOutputs["personal"]["savedSearches"]["list"][number];
type SavedSearchSeed = Pick<SavedSearch, "query" | "category" | "facilityType" | "route">;
const sections = [
  { id: "account", label: "プロフィール・設定", icon: UserRound },
  { id: "lost", label: "紛失物追跡", icon: UserRoundSearch },
  { id: "saved", label: "保存済み検索", icon: Bookmark },
  { id: "posts", label: "自分の投稿", icon: Package },
  { id: "cases", label: "仲介案件", icon: Handshake },
  { id: "community", label: "評価・フォロー", icon: Star },
  { id: "blocked", label: "ブロック中", icon: ShieldAlert },
  { id: "notice", label: "通知設定", icon: Bell },
  { id: "shared", label: "共有ボックス", icon: Share2 },
] as const;

type Section = (typeof sections)[number]["id"];

export default function MyPageScreen({ user, signedIn, onLogin, onNavigate, onEditPost, onRunSearch, initialGuestSearch, onGuestSearchDraftUsed }: {
  user: User | null;
  signedIn: boolean;
  onLogin: () => void;
  onNavigate: (tab: string) => void;
  onEditPost: (post: OwnedPost) => void;
  onRunSearch: (search: SavedSearchSeed) => void;
  initialGuestSearch?: GuestSearchDraft | null;
  onGuestSearchDraftUsed: () => void;
}) {
  const [section, setSection] = useState<Section>(initialGuestSearch ? "shared" : "account");
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const utils = trpc.useUtils();
  const searches = trpc.personal.savedSearches.list.useQuery(undefined, { enabled: signedIn && section === "saved" });
  const posts = trpc.posts.mine.useQuery(undefined, { enabled: signedIn && section === "posts" });
  const cases = trpc.mediation.list.useQuery(undefined, { enabled: signedIn && section === "cases" });
  const community = trpc.community.overview.useQuery(undefined, { enabled: signedIn && section === "community" });
  const blockedUsers = trpc.mediation.myBlocks.useQuery(undefined, { enabled: signedIn && section === "blocked" });
  const reports = trpc.personal.reports.list.useQuery(undefined, { enabled: signedIn && section === "account" });
  const deleteSearch = trpc.personal.savedSearches.delete.useMutation({ onSuccess: async () => { await utils.personal.savedSearches.list.invalidate(); toast.success("保存検索を削除しました。"); } });
  const archivePost = trpc.posts.archive.useMutation({ onSuccess: async () => { await Promise.all([utils.posts.mine.invalidate(), utils.posts.search.invalidate(), utils.posts.map.invalidate()]); toast.success("投稿を公開一覧から削除しました。"); }, onError: error => toast.error(error.message) });
  const unblockUser = trpc.mediation.unblockUser.useMutation({ onSuccess: async () => { await Promise.all([utils.mediation.myBlocks.invalidate(), utils.mediation.list.invalidate(), utils.posts.search.invalidate(), utils.posts.map.invalidate(), utils.personal.lost.matches.invalidate()]); toast.success("ブロックを解除しました。"); }, onError: error => toast.error(error.message) });
  const followUser = trpc.community.follow.useMutation({ onSuccess: async () => { await utils.community.overview.invalidate(); toast.success("フォローしました。"); }, onError: error => toast.error(error.message) });
  const unfollowUser = trpc.community.unfollow.useMutation({ onSuccess: async () => { await utils.community.overview.invalidate(); toast.success("フォローを解除しました。"); }, onError: error => toast.error(error.message) });
  const reviewUser = trpc.community.review.useMutation({ onSuccess: async () => { await utils.community.overview.invalidate(); toast.success("評価を保存しました。"); }, onError: error => toast.error(error.message) });

  useEffect(() => { if (initialGuestSearch) setSection("shared"); }, [initialGuestSearch]);

  const guestPanel = <GuestSyncPanel
    signedIn={signedIn}
    onLogin={onLogin}
    onNavigate={onNavigate}
    onRunSearch={onRunSearch}
    initialSearch={initialGuestSearch}
    onInitialSearchUsed={onGuestSearchDraftUsed}
  />;

  if (!signedIn) return <div className="space-y-5">
    <SectionHeading eyebrow="あなたのreturn" title="マイページ" description="プロフィール・届出・個人の追跡・通知はログイン後にアカウント単位で管理します。共有ボックスは個人情報と分離して利用できます。" />
    <div className="app-card p-5"><EmptyState title="個人ページにはログインが必要です" detail="架空プロフィールは表示しません。ログインするとあなた自身の保存データを別の端末と同期できます。" action={<button className="app-button-primary" onClick={onLogin}>ログイン</button>} /></div>
    {guestPanel}
  </div>;

  return <div>
    <SectionHeading eyebrow="あなたのreturn" title="マイページ" description="プロフィール、追跡、保存済みデータ、投稿、仲介、通知設定をアカウント単位で管理します。共有ボックスは複数アカウント/ゲストとの共同利用用です。" />
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="app-card h-fit space-y-1 p-3" aria-label="マイページのメニュー">
        {sections.map(item => <button key={item.id} className="app-nav-link" aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}><item.icon className="h-4 w-4" />{item.label}</button>)}
      </nav>
      <div className="min-w-0 space-y-4">
        {section === "account" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="app-card p-4"><span className="text-xs text-muted-foreground">ログイン</span><b className="mt-1 block">{user?.name?.trim() || "名前未設定"}</b></div><div className="app-card p-4"><span className="text-xs text-muted-foreground">保存した届出データ</span><b className="mt-1 block">{reports.data?.length ?? 0}件</b></div><div className="app-card p-4"><span className="text-xs text-muted-foreground">プロフィールID</span><b className="mt-1 block font-mono">{user ? (user.profileCode || `R${String(user.id).padStart(7, "0")}`) : "—"}</b></div></div><AccountSettings signedIn={signedIn} user={user} onLogin={onLogin} /><button className="app-button-secondary no-print" onClick={() => onNavigate("chat")}><MessagesSquare className="h-4 w-4" />トーク・QRコードを開く</button><button className="app-button-secondary no-print" onClick={() => onNavigate("report")}><FileText className="h-4 w-4" />遺失届データを作成・確認</button></div>}
        {section === "lost" && <LostTrackingPanel signedIn={signedIn} onLogin={onLogin} onNavigate={onNavigate} />}
        {section === "saved" && <section className="app-card p-5"><h2 className="mb-4 font-bold">保存済み検索</h2>{searches.isLoading && <p className="text-sm text-muted-foreground">保存条件を読み込み中…</p>}{searches.data?.length === 0 && <EmptyState title="保存済み検索はありません" detail="一括確認で条件を検索し、「検索条件を保存」を選ぶとここに追加されます。" />}
          <div className="space-y-3">{searches.data?.map((search: SavedSearch) => <div key={search.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"><div><h3 className="font-bold">{search.label}</h3><p className="mt-1 text-sm text-muted-foreground">{search.query || "すべての投稿"} {search.category ? `· ${CATEGORY_LABELS[search.category as keyof typeof CATEGORY_LABELS] ?? search.category}` : ""} {search.route ? `· ${search.route}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">保存: {dateTimeLabel(search.createdAt)}</p></div><div className="flex gap-2"><button className="app-button-primary text-sm" onClick={() => { onRunSearch(search); onNavigate("search"); }}>この条件で検索</button><button className="app-button-danger text-sm" onClick={() => { if (window.confirm("この検索条件を削除しますか？")) deleteSearch.mutate({ id: search.id }); }}>削除</button></div></div>)}</div>
        </section>}
        {section === "posts" && <section className="app-card p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold">自分の拾得投稿</h2><p className="mt-1 text-xs text-muted-foreground">削除すると公開検索・地図から見えなくなります。写真は保存領域に残る場合があります。</p></div><button className="app-button-secondary text-sm" onClick={() => onNavigate("search")}>検索・投稿</button></div>{posts.isLoading && <p className="text-sm text-muted-foreground">投稿を読み込み中…</p>}{posts.data?.length === 0 && <EmptyState title="投稿はありません" detail="拾得物を投稿すると、公開中のものがここに表示されます。" />}
          <div className="space-y-3">{posts.data?.map(post => <div key={post.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-start"><div className="flex min-w-0 gap-3">{post.imageUrl ? <img src={post.imageUrl} alt="投稿写真" className="h-16 w-20 rounded-lg object-cover" /> : <div className="flex h-16 w-20 items-center justify-center rounded-lg bg-muted text-primary"><Package className="h-5 w-5" /></div>}<div className="min-w-0"><h3 className="font-bold">{post.title} <span className="app-badge ml-1">{post.status === "active" ? "公開中" : "解決済み"}</span></h3><p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABELS[post.category]} · {post.placeLabel} · {dateTimeLabel(post.foundAt)}</p></div></div><div className="flex gap-2"><button className="app-button-secondary text-sm" onClick={() => onEditPost(post)}>編集</button><button className="app-button-danger text-sm" disabled={archivePost.isPending} onClick={() => { if (window.confirm("この投稿を公開一覧から削除しますか？進行中の仲介案件がある場合は先に終了してください。公開からは外れますが、画像ファイルはStorage上に残る場合があります。")) archivePost.mutate({ id: post.id }); }}>削除</button></div></div>)}</div>
        </section>}
        {section === "cases" && <section className="app-card p-5"><h2 className="mb-4 font-bold">仲介案件</h2>{cases.data?.length === 0 && <EmptyState title="案件はありません" detail="投稿者との仲介申請は、この画面から進捗を確認できます。" />}{cases.data?.map(item => <button key={item.id} className="mb-2 flex w-full items-center justify-between rounded-xl border border-border p-4 text-left hover:bg-accent" onClick={() => onNavigate("mediation")}><span><b className="block">{item.postTitle}</b><span className="text-xs text-muted-foreground">{item.side === "owner" ? "あなたの投稿" : "あなたの申請"} · {dateTimeLabel(item.updatedAt)}</span></span><span className="app-badge">{MEDIATION_STATUS[item.status]}</span></button>)}</section>}
        {section === "community" && <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="app-card p-4"><span className="text-xs text-muted-foreground">あなたの評価</span><b className="mt-1 flex items-center gap-1 text-2xl"><Star className="h-5 w-5 fill-amber-400 text-amber-400" />{community.data?.receivedAverage?.toFixed(1) ?? "0.0"}</b><span className="text-xs text-muted-foreground">{community.data?.receivedCount ?? 0}件</span></div>
            <div className="app-card p-4"><span className="text-xs text-muted-foreground">フォロー中</span><b className="mt-1 block text-2xl">{community.data?.following.length ?? 0}</b></div>
            <div className="app-card p-4"><span className="text-xs text-muted-foreground">フォロワー</span><b className="mt-1 block text-2xl">{community.data?.followerCount ?? 0}</b></div>
            <div className="app-card p-4"><span className="text-xs text-muted-foreground">評価した件数</span><b className="mt-1 block text-2xl">{community.data?.givenCount ?? 0}</b></div>
          </div>
          <div className="app-card overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 via-white to-purple-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-white shadow-sm"><Trophy className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">returnランク</p><h2 className="text-2xl font-black">レベル {community.data?.level ?? 1}</h2><p className="text-sm text-muted-foreground">{community.data?.points ?? 0}ポイント</p></div></div><div className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-purple-700"><Sparkles className="mr-1 inline h-3.5 w-3.5" />次のレベルまで {Math.max(0, (community.data?.nextLevelPoints ?? 100) - (community.data?.points ?? 0))}pt</div></div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-purple-500 transition-all" style={{ width: `${community.data?.levelProgress ?? 0}%` }} /></div>
            <p className="mt-2 text-right text-xs text-muted-foreground">レベル進捗 {community.data?.levelProgress ?? 0}%</p>
            <div className="mt-5 border-t border-amber-200/70 pt-4"><div className="mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-600" /><h3 className="font-bold">称号一覧</h3></div><div className="grid gap-2 sm:grid-cols-2">{community.data?.titles.map(title => <div key={title.id} className={`flex items-center gap-3 rounded-xl border p-3 ${title.unlocked ? "border-amber-200 bg-white/90" : "border-border/60 bg-white/40 opacity-65"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${title.unlocked ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{title.unlocked ? <Trophy className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}</span><span className="min-w-0"><b className="block text-sm">{title.name}{title.unlocked && <span className="ml-2 text-[10px] text-amber-700">獲得済み</span>}</b><span className="text-xs text-muted-foreground">{title.description}</span></span></div>)}</div></div>
          </div>
          <div className="app-card p-5">
            <div className="mb-4 flex items-center gap-2"><Heart className="h-5 w-5 text-rose-500" /><div><h2 className="font-bold">取引相手を評価・フォロー</h2><p className="mt-1 text-xs text-muted-foreground">受け渡し完了後の相手だけが対象です。評価は後から変更できます。</p></div></div>
            {community.isLoading && <p className="text-sm text-muted-foreground">評価対象を読み込み中…</p>}
            {community.data?.eligible.length === 0 && <EmptyState title="評価できる完了案件はありません" detail="仲介案件の受け渡しが完了すると、ここから相手を評価できます。" />}
            <div className="space-y-3">{community.data?.eligible.map(item => { const rating = reviewRatings[item.mediationId] ?? 0; const isFollowing = community.data?.following.some(person => person.userId === item.targetId); return <div key={item.mediationId} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{item.targetName}</b><p className="text-xs text-muted-foreground">{item.targetCode || `ユーザー #${item.targetId}`} · {item.postTitle}</p></div><button type="button" className="app-button-secondary px-3 py-2 text-xs" disabled={followUser.isPending || unfollowUser.isPending} onClick={() => isFollowing ? unfollowUser.mutate({ userId: item.targetId }) : followUser.mutate({ userId: item.targetId })}>{isFollowing ? <><UserRoundCheck className="h-4 w-4" />フォロー中</> : <><UserRoundSearch className="h-4 w-4" />フォロー</>}</button></div><div className="mt-3 flex items-center gap-1" aria-label="評価を選択">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} className="rounded p-1 hover:bg-amber-50" onClick={() => setReviewRatings(previous => ({ ...previous, [item.mediationId]: value }))} aria-label={`${value}つ星`}><Star className={`h-6 w-6 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} /></button>)}<span className="ml-2 text-xs text-muted-foreground">{rating ? `${rating}/5` : "星を選択"}</span></div><div className="mt-2 flex gap-2"><input className="app-input flex-1" maxLength={500} placeholder="コメント（任意）" value={reviewComments[item.mediationId] ?? ""} onChange={event => setReviewComments(previous => ({ ...previous, [item.mediationId]: event.target.value }))} /><button type="button" className="app-button-primary shrink-0 px-3 py-2 text-sm" disabled={!rating || reviewUser.isPending} onClick={() => reviewUser.mutate({ mediationId: item.mediationId, rating, comment: reviewComments[item.mediationId] ?? "" })}>評価を保存</button></div></div>; })}</div>
          </div>
          <div className="app-card p-5"><h2 className="mb-3 font-bold">受け取った評価</h2>{community.data?.reviews.length === 0 && <p className="text-sm text-muted-foreground">まだ評価はありません。</p>}<div className="space-y-3">{community.data?.reviews.map(review => <div key={review.id} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between"><b className="text-sm">{review.reviewerName}</b><span className="flex items-center gap-1 text-sm text-amber-600"><Star className="h-4 w-4 fill-current" />{review.rating}/5</span></div>{review.comment && <p className="mt-2 text-sm leading-6 text-muted-foreground">{review.comment}</p>}<p className="mt-1 text-[11px] text-muted-foreground">{dateTimeLabel(review.createdAt)}</p></div>)}</div></div>
        </section>}
        {section === "blocked" && <section className="app-card p-5"><h2 className="mb-2 font-bold">ブロック中の相手</h2><p className="mb-4 text-sm text-muted-foreground">一覧はあなたにだけ表示されます。解除すると、新しい仲介申請やメッセージが可能になります。</p>{blockedUsers.isLoading && <p className="text-sm text-muted-foreground">ブロック一覧を読み込み中…</p>}{blockedUsers.isError && <p role="alert" className="text-sm text-red-700">ブロック一覧を取得できませんでした。再読み込みしてください。</p>}{blockedUsers.data?.length === 0 && <EmptyState title="ブロック中の相手はいません" detail="仲介案件内で相手をブロックすると、ここに表示されます。" />}<div className="space-y-3">{blockedUsers.data?.map(item => <div key={item.userId} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center"><div><b>アカウント #{item.userId}</b><p className="mt-1 text-sm text-muted-foreground">関連投稿: {item.sourcePostTitle ?? "投稿は削除済み、または非公開です"}</p><p className="mt-1 text-xs text-muted-foreground">ブロック開始: {dateTimeLabel(item.createdAt)}</p></div><button className="app-button-secondary" disabled={unblockUser.isPending} onClick={() => { if (window.confirm("この相手のブロックを解除しますか？相手があなたをブロックしている場合は連絡できないままです。")) unblockUser.mutate({ userId: item.userId }); }}>ブロック解除</button></div>)}</div></section>}
        {section === "notice" && <NotificationSettingsPanel />}
        {section === "shared" && guestPanel}
      </div>
    </div>
  </div>;
}
