import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, LoaderCircle, MapPin, Search, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { CATEGORY_KEYS, CATEGORY_LABELS, FACILITY_KEYS, FACILITY_LABELS, type FacilityType, type ItemCategory } from "@/lib/return";
import { EmptyState, PostCard, SectionHeading, type PublicPost } from "@/components/return/Primitives";
import { PostDetailDialog } from "@/components/return/PostDetailDialog";

const categoryKeys = CATEGORY_KEYS;
const facilityKeys = FACILITY_KEYS;
export type SearchPreset = { query: string; category: ItemCategory | null; facilityType: FacilityType | null; route: string | null };

type Props = {
  signedIn: boolean;
  onLogin: () => void;
  onNavigate: (tab: string) => void;
  onPost: () => void;
  preset?: SearchPreset | null;
  onPresetApplied: () => void;
  onGuestSaveSearch: (search: SearchPreset) => void;
};

export default function SearchScreen({ signedIn, onLogin, onNavigate, onPost, preset, onPresetApplied, onGuestSaveSearch }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [facility, setFacility] = useState("");
  const [route, setRoute] = useState("");
  const [sort, setSort] = useState<"relevance" | "recent" | "oldest">("relevance");
  const [selected, setSelected] = useState<PublicPost | null>(null);
  useEffect(() => {
    if (!preset) return;
    setQuery(preset.query);
    setCategory(preset.category ?? "");
    setFacility(preset.facilityType ?? "");
    setRoute(preset.route ?? "");
    onPresetApplied();
  }, [preset, onPresetApplied]);

  const utils = trpc.useUtils();
  const searchInput = useMemo(() => ({
    query: query.trim() || undefined,
    route: route.trim() || undefined,
    category: category ? category as ItemCategory : undefined,
    facilityType: facility ? facility as FacilityType : undefined,
    sort,
    limit: 100,
  }), [query, route, category, facility, sort]);
  const results = trpc.posts.search.useQuery(searchInput, { staleTime: 20_000 });
  const saveSearch = trpc.personal.savedSearches.create.useMutation({
    onSuccess: async () => { await utils.personal.savedSearches.invalidate(); toast.success("個人用の検索条件を保存しました。マイページから再利用できます。"); },
    onError: error => toast.error(error.message),
  });

  const currentPreset = (): SearchPreset => ({
    query: query.trim(),
    category: category ? category as ItemCategory : null,
    facilityType: facility ? facility as FacilityType : null,
    route: route.trim() || null,
  });

  const savePersonalSearch = () => {
    const label = window.prompt("この個人用検索条件の名前を入力してください", query || "落とし物検索");
    if (!label?.trim()) return;
    saveSearch.mutate({ ...currentPreset(), label });
  };

  const saveSharedSearch = () => {
    onGuestSaveSearch(currentPreset());
    toast.success("共有ボックスに検索条件を追加できます。画面の案内に従ってください。");
  };

  return <div>
    <SectionHeading eyebrow="見つける" title="一括確認" description="利用者が実際に投稿した拾得物を、品名・特徴・場所から探せます。警察・交通事業者のデータはこの一覧に混ぜていません。" action={<button className="app-button-primary" onClick={onPost}><MapPin className="h-4 w-4" />拾得物を投稿</button>} />

    <div className="app-card mb-6 p-4 sm:p-5">
      <label className="app-label" htmlFor="lost-search">品名・色・特徴・場所で検索</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input id="lost-search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} className="app-input pl-10" placeholder="例: 黒い財布、青い傘、○○駅" /></div>
        <button type="button" className="app-button-primary sm:min-w-32" onClick={() => void results.refetch()}><Search className="h-4 w-4" />検索</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">よく使う検索:</span>{["iPhone", "財布", "鍵", "AirPods"].map(term => <button key={term} type="button" className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-slate-700 hover:border-primary hover:bg-accent" onClick={() => setQuery(term)}>{term}</button>)}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label><span className="app-label">カテゴリ</span><select className="app-input" value={category} onChange={event => setCategory(event.target.value)}><option value="">すべて</option>{categoryKeys.map(key => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}</select></label>
        <label><span className="app-label">拾得元</span><select className="app-input" value={facility} onChange={event => setFacility(event.target.value)}><option value="">すべて</option>{facilityKeys.map(key => <option key={key} value={key}>{FACILITY_LABELS[key]}</option>)}</select></label>
        <label><span className="app-label">路線・施設名</span><input className="app-input" value={route} onChange={event => setRoute(event.target.value)} placeholder="例: ○○線" /></label>
        <label><span className="app-label">並び替え</span><select className="app-input" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="relevance">関連度順</option><option value="recent">新しい順</option><option value="oldest">古い順</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">{results.isLoading ? "投稿を確認中…" : `${results.data?.length ?? 0}件の公開投稿`}</p>
        <div className="flex flex-wrap gap-2">
          <button className="app-button-secondary text-sm" onClick={() => onNavigate("map")}><MapPin className="h-4 w-4" />地図で見る</button>
          {signedIn && <button className="app-button-secondary text-sm" onClick={savePersonalSearch} disabled={saveSearch.isPending}><BookmarkPlus className="h-4 w-4" />個人用に保存</button>}
          <button className="app-button-secondary text-sm" onClick={saveSharedSearch}><Share2 className="h-4 w-4" />共有ボックスへ保存</button>
        </div>
      </div>
    </div>

    {results.isError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">投稿を読み込めませんでした。通信を確認して再読み込みしてください。<button className="ml-2 underline" onClick={() => void results.refetch()}>再試行</button></div>}
    {!!results.data?.filter(post => post.storageUntil && new Date(post.storageUntil).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000).length && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><b>保管期限の確認が必要な投稿があります。</b><p className="mt-1 text-xs">期限が7日以内、または期限を過ぎた公開投稿が含まれます。期限や保管先は投稿者・施設へ直接ご確認ください。予約や施設照会は行いません。</p></div>}
    {results.isLoading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" />投稿を読み込み中</div> : results.data?.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{results.data.map(post => <PostCard key={post.id} post={post} onOpen={() => setSelected(post)} />)}</div> : <EmptyState title={query ? "該当する投稿はありません" : "まだ拾得投稿がありません"} detail={query ? "検索語やカテゴリを変えてお試しください。実際の投稿が登録されると、ここに表示されます。" : "この一覧には実際に利用者が登録した投稿だけを表示します。架空のサンプル投稿はありません。"} action={!signedIn ? <button className="app-button-secondary" onClick={onLogin}>ログインして投稿する</button> : <button className="app-button-primary" onClick={onPost}>拾得物を投稿する</button>} />}

    <PostDetailDialog post={selected} onClose={() => setSelected(null)} signedIn={signedIn} onLogin={onLogin} onCaseCreated={() => onNavigate("mediation")} />
    <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><Sparkles className="mt-0.5 h-4 w-4 shrink-0" /><p>警察・鉄道・バス会社の外部データ照会はまだ接続していません。安全・連携センターでデモ状態を確認できます。</p></div>
  </div>;
}
