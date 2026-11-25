import { useEffect, useMemo, useState } from "react";
import { LocateFixed, Layers, LoaderCircle, MapPin, Navigation } from "lucide-react";
import { MapView } from "@/components/Map";
import { EmptyState, PostCard, SectionHeading, type RouterOutputs } from "@/components/return/Primitives";
import { PostDetailDialog, type PostDetail } from "@/components/return/PostDetailDialog";
import { CATEGORY_LABELS, FACILITY_LABELS, type FacilityType, type ItemCategory } from "@/lib/return";
import { trpc } from "@/lib/trpc";
import { useAppLanguage } from "@/lib/i18n";

type MapPost = RouterOutputs["posts"]["map"][number];
export default function MapScreen({
  onLogin, signedIn, onNavigate }: { onLogin: () => void; signedIn: boolean; onNavigate: (tab: string) => void }) {
  const language = useAppLanguage();
  const en = language === "en";
  const [category, setCategory] = useState("");
  const [facility, setFacility] = useState("");
  const [map, setMap] = useState<any>(null);
  const [selected, setSelected] = useState<MapPost | null>(null);
  const [detailPost, setDetailPost] = useState<PostDetail | null>(null);
  const categories = trpc.posts.map.useQuery({ category: category ? category as ItemCategory : undefined, facilityType: facility ? facility as FacilityType : undefined }, { staleTime: 30_000 });
  const center = useMemo(() => ({ lat: 35.6812, lng: 139.7671 }), []);
  const locateMe = () => {
    window.dispatchEvent(new Event("return:locate-map"));
  };

  return (
    <div>
      <SectionHeading eyebrow={en ? "FIND BY LOCATION" : "位置から探す"} title={en ? "Found Map" : "拾得マップ"} description="公開位置はおよそ1km単位にぼかして表示します。正確な受け渡し場所は、仲介中の当事者だけで確認してください。" />
      <div className="app-card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
        <label className="flex-1"><span className="app-label">カテゴリ</span><select className="app-input" value={category} onChange={event => setCategory(event.target.value)}><option value="">すべてのカテゴリ</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="flex-1"><span className="app-label">拾得元</span><select className="app-input" value={facility} onChange={event => setFacility(event.target.value)}><option value="">すべての拾得元</option>{Object.entries(FACILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Layers className="h-4 w-4" />{categories.data?.length ?? 0}件</div><button type="button" className="app-button-secondary px-3 py-2 text-xs" onClick={locateMe}><LocateFixed className="h-4 w-4" />{en ? "My location" : "現在地"}</button></div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.75fr)]">
        <div className="ios-map-card relative z-0 app-card overflow-hidden"><MapView className="h-[min(52vh,460px)] min-h-[320px] sm:h-[520px]" initialCenter={center} initialZoom={11} onMapReady={setMap} fallbackMarkers={(categories.data ?? []).filter(post => post.latitude != null && post.longitude != null).map(post => ({ id: post.id, title: post.title, position: { lat: post.latitude!, lng: post.longitude! }, onClick: () => setSelected(post) }))} label="拾得物の概略位置マップ" /></div>
        <div className="space-y-3">
          {categories.isLoading && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />地図上の投稿を読み込み中</div>}
          {categories.isError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">地図情報を読み込めません。通信状態を確認して再読み込みしてください。<button className="mt-2 block underline" onClick={() => void categories.refetch()}>再試行</button></div>}
          {!categories.isLoading && !categories.isError && categories.data?.length === 0 && <EmptyState title="地図に投稿がありません" detail="位置が指定された実際の拾得投稿が登録されると、ここに表示されます。サンプル位置や架空の投稿はありません。" />}
          {selected && <div className="app-card border-teal-300 p-4"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><MapPin className="h-4 w-4" />選択した投稿</div><PostCard post={selected} onOpen={() => setDetailPost(selected)} />{selected.latitude != null && selected.longitude != null && <a className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}><Navigation className="h-3.5 w-3.5" />{en ? "Open exact location in Google Maps" : "Googleマップで正確な位置を開く"}</a>}</div>}
          {!!categories.data?.length && <div className="app-card p-4"><h2 className="mb-3 text-sm font-bold">地図に登録された投稿</h2><div className="max-h-[320px] space-y-2 overflow-y-auto">{categories.data.map(post => <button key={post.id} type="button" onClick={() => { setSelected(post); if (map && post.latitude != null && post.longitude != null) map.panTo([post.latitude, post.longitude]); }} className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="min-w-0"><b className="block truncate text-sm">{post.title}</b><span className="text-xs text-muted-foreground">{post.placeLabel} · {FACILITY_LABELS[post.facilityType]}</span></span></button>)}</div></div>}
        </div>
      </div>
      <PostDetailDialog post={detailPost} onClose={() => setDetailPost(null)} signedIn={signedIn} onLogin={onLogin} onCaseCreated={() => onNavigate("mediation")} />
    </div>
  );
}
