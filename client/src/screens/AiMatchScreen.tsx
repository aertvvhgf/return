import { useEffect, useMemo, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Plus, SearchCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { CATEGORY_LABELS, type ItemCategory } from "@/lib/return";
import { EmptyState, PostCard, SectionHeading, type RouterOutputs } from "@/components/return/Primitives";
import { PostDetailDialog, type PostDetail } from "@/components/return/PostDetailDialog";
import { fromLocalDate } from "@/lib/return";
import { imageToSanitizedJpegDataUrl } from "@/lib/image";
import { useAppLanguage } from "@/lib/i18n";

type MatchPost = RouterOutputs["posts"]["match"]["candidates"][number];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

async function analyzeImageLocally(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 64 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("画像を読み取れませんでした。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0, green = 0, blue = 0, brightness = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      red += data[i]; green += data[i + 1]; blue += data[i + 2];
      brightness += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count += 1;
    }
    if (!count) return "写真の色・明るさを読み取れませんでした";
    const r = red / count, g = green / count, b = blue / count, light = brightness / count;
    let color = "中間色";
    if (Math.max(r, g, b) - Math.min(r, g, b) < 28) color = light < 68 ? "黒・暗色系" : light > 205 ? "白・明色系" : "灰色系";
    else if (r > 165 && g > 135 && b < 110) color = "黄・金色系";
    else if (r > g * 1.25 && r > b * 1.15) color = "赤系";
    else if (g > r * 1.18 && g > b * 1.08) color = "緑系";
    else if (b > r * 1.18 && b > g * 1.08) color = "青系";
    else if (r > 145 && b > 120 && g < 145) color = "紫系";
    const lightLabel = light < 75 ? "暗め" : light > 190 ? "明るめ" : "中間の明るさ";
    return `写真の端末内特徴: ${color}、${lightLabel}（平均明度 ${Math.round(light)} / 255）`;
  } finally {
    bitmap.close();
  }
}

export default function AiMatchScreen({ signedIn, onLogin, onNavigate }: { signedIn: boolean; onLogin: () => void; onNavigate: (tab: string) => void }) {
  const language = useAppLanguage();
  const en = language === "en";
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ItemCategory>("other");
  const [details, setDetails] = useState("");
  const [location, setLocation] = useState("");
  const [route, setRoute] = useState("");
  const [lostAtLocal, setLostAtLocal] = useState("");
  const [photoFeatures, setPhotoFeatures] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [imageSummary, setImageSummary] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoAiConsent, setPhotoAiConsent] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const combinedPhotoFeatures = useMemo(() => [imageSummary, photoFeatures.trim()].filter(Boolean).join("; "), [imageSummary, photoFeatures]);
  const input = useMemo(() => ({
    title,
    category,
    details,
    location,
    route: route || undefined,
    photoFeatures: combinedPhotoFeatures || undefined,
    lostAt: fromLocalDate(lostAtLocal),
  }), [title, category, details, location, route, combinedPhotoFeatures, lostAtLocal]);
  const match = trpc.posts.match.useMutation({ onError: () => toast.error("照合に失敗しました。通信状態を確認してください。") });
  const [selected, setSelected] = useState<PostDetail | null>(null);
  const [tracked, setTracked] = useState(false);
  const utils = trpc.useUtils();
  const createTracking = trpc.personal.lost.create.useMutation({
    onSuccess: async () => { await utils.personal.lost.list.invalidate(); toast.success("紛失物の追跡登録を保存しました。"); setTracked(true); },
    onError: error => toast.error(error.message),
  });
  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) return toast.error("JPG・PNG・WebPの画像を選んでください。");
    if (file.size > MAX_PHOTO_BYTES) return toast.error("写真は10MiB以下を選んでください。");
    const preview = URL.createObjectURL(file);
    setPhotoPreview(preview);
    setPhotoName(file.name);
    setImageSummary("");
    setPhotoDataUrl(null);
    setPhotoAiConsent(false);
    try {
      const [summary, aiSafeImage] = await Promise.all([analyzeImageLocally(file), imageToSanitizedJpegDataUrl(file, 768, 0.78)]);
      setImageSummary(summary);
      setPhotoDataUrl(aiSafeImage);
      toast.success("写真の色・明るさを端末内で解析しました。");
    } catch {
      setPhotoPreview(null);
      setPhotoName("");
      setPhotoDataUrl(null);
      toast.error("この画像を端末内で読み取れませんでした。別の画像を選んでください。");
      URL.revokeObjectURL(preview);
    }
  };
  const runMatch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return toast.error("まず品物の名前を入力してください。");
    setTracked(false);
    setCompareIds([]);
    match.reset();
    const consentedImage = signedIn && photoAiConsent ? photoDataUrl ?? undefined : undefined;
    try {
      await match.mutateAsync({ ...input, photoDataUrl: consentedImage, photoConsent: Boolean(consentedImage) });
    } catch { /* The mutation's onError displays a recoverable message. */ }
  };
  const saveTracking = () => {
    if (!signedIn) return onLogin();
    createTracking.mutate({ title, category, details: [details, combinedPhotoFeatures && `写真の特徴: ${combinedPhotoFeatures}`].filter(Boolean).join("\n").slice(0, 3000), location, route: route || null, lostAt: fromLocalDate(lostAtLocal) ?? null, imageUrl: null });
  };
  const toggleCompare = (id: number) => {
    if (compareIds.includes(id)) return setCompareIds(ids => ids.filter(value => value !== id));
    if (compareIds.length >= 3) return toast.message("比較できる候補は3件までです。先に候補を外してください。");
    setCompareIds(ids => [...ids, id]);
  };
  const comparePosts = match.data?.candidates.filter(candidate => compareIds.includes(candidate.id)) ?? [];

  return (
    <div>
      <SectionHeading eyebrow={en ? "MATCH CANDIDATES" : "候補を照合"} title="AI Search" description={en ? "Search with only an item name. Add details, location, or a photo to improve results." : "品物の名前だけでも検索できます。特徴・場所・写真を追加すると候補の精度が上がります。持ち主を自動で確定せず、最終確認は当事者が行います。"} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]">
        <form className="app-card space-y-4 p-5" onSubmit={runMatch}>
          <div className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-3 text-sm leading-6 text-teal-950">
            <Sparkles className="mt-1 h-4 w-4 shrink-0" />
            <p>
              {signedIn ? "照合では入力情報・端末内で計算した写真要約・実投稿の公開情報を使ってManus AIが候補を順位付けします。写真本体は下の同意チェックをオンにした時だけ送信します。" : "ゲスト照合はAIを使わない類似度計算です。写真画像は送信せず、端末内で計算した色・明るさの要約だけを使います。ログインすると、同意した場合に写真本体もManus AIで照合できます。"}
              {" "}画像本体を送信する場合は端末内で縮小・メタデータ除去し、サーバーでもJPEGメタデータを除去します。このアプリのDB/Storageには保存しません。サーバー側でも氏名らしい表現・連絡先・郵便番号・詳細住所・SNS ID・長い番号らしい文字列を可能な範囲で伏せますが、検出は完全ではありません。氏名、電話番号、メール、カード番号、住所、SNS IDは入力しないでください。AIに接続できない時はAIなし類似度計算に切り替えます。スコアは目安で、所有者を証明するものではありません。
            </p>
          </div>
          <label><span className="app-label">{en ? "Item name *" : "品物の名前 *"}</span><input className="app-input" value={title} onChange={event => setTitle(event.target.value)} required maxLength={160} placeholder={en ? "e.g. black wallet" : "例: 黒い二つ折り財布"} /></label>
          <div><span className="app-label">{en ? "Quick choices" : "かんたん入力"}</span><div className="flex flex-wrap gap-2">{(en ? ["Wallet", "Smartphone", "Keys", "Umbrella", "AirPods"] : ["財布", "スマートフォン", "鍵", "傘", "AirPods"]).map(value => <button type="button" key={value} className="app-button-secondary px-3 py-1.5 text-xs" onClick={() => { setTitle(value); setDetails(details || `${value} ${en ? "looking for" : "を探しています"}`); }}>{value}</button>)}</div></div>
          <label><span className="app-label">{en ? "Category (optional)" : "カテゴリ（任意）"}</span><select className="app-input" value={category} onChange={event => setCategory(event.target.value as ItemCategory)}>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><span className="app-label">{en ? "Details (optional)" : "特徴（任意）"}</span><textarea className="app-input app-textarea" value={details} onChange={event => setDetails(event.target.value)} maxLength={3000} placeholder="色・形・傷など。空欄でも検索できます。" /></label>
          <label><span className="app-label">{en ? "Lost area (optional)" : "紛失した場所・エリア（任意）"}</span><input className="app-input" value={location} onChange={event => setLocation(event.target.value)} maxLength={200} placeholder="例: ○○駅周辺。空欄でも検索できます。" /></label>
          <label><span className="app-label">路線・施設名（任意）</span><input className="app-input" value={route} onChange={event => setRoute(event.target.value)} maxLength={200} placeholder="例: ○○線、○○ショッピングモール" /></label>
          <label><span className="app-label">紛失した日時（任意）</span><input className="app-input" type="datetime-local" value={lostAtLocal} onChange={event => setLostAtLocal(event.target.value)} /></label>
          <div className="space-y-2"><span className="app-label">参考写真（任意・10MiB以下）</span><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-700 hover:border-primary hover:bg-accent"><ImagePlus className="h-5 w-5" />写真を選択<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={event => { void uploadPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
            {photoPreview && <div className="flex items-center gap-3 rounded-xl border border-border p-3"><img src={photoPreview} alt="端末内で解析する参考写真" className="h-16 w-16 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{photoName}</p><p className="mt-1 text-xs text-muted-foreground">{imageSummary || "画像を端末内で解析中…"}</p></div><button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="写真を削除" onClick={() => { setPhotoPreview(null); setPhotoName(""); setImageSummary(""); setPhotoDataUrl(null); setPhotoAiConsent(false); }}><X className="h-4 w-4" /></button></div>}
          </div>
          {photoPreview && signedIn && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-slate-50 p-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 accent-teal-700" disabled={!photoDataUrl} checked={photoAiConsent} onChange={event => setPhotoAiConsent(event.target.checked)} /><span><b>任意:</b> この照合に限り、端末内で縮小・メタデータ除去した写真をManus AIへ送り、品物の見た目も候補照合に使うことに同意します。画像はこのアプリのDB/Storageに保存しません。</span></label>}
          {photoPreview && !signedIn && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-muted-foreground">ゲストでは画像本体を送信しません。色・明るさの要約だけで候補を計算します。ログイン後、明示同意すると画像のAI照合を使えます。</p>}
          <label><span className="app-label">写真で気づいた{en ? "Details (optional)" : "特徴（任意）"}</span><textarea className="app-input min-h-20" value={photoFeatures} onChange={event => setPhotoFeatures(event.target.value)} maxLength={800} placeholder="例: 写真の右上に金色の金具が見える" /></label>
          <p className="text-xs leading-5 text-muted-foreground">写真は端末内で平均色・明るさを計算します。画像全体を送るのは、ログイン中に上の同意をオンにした場合だけです。原写真のEXIF等を含むメタデータは除去し、このアプリのDB/Storageへは保存しません。個人情報の写り込んだ写真は選ばないでください。</p>
          <div className="flex flex-col gap-2 sm:flex-row"><button className="app-button-primary flex-1" disabled={match.isPending || !title.trim()}><SearchCheck className="h-4 w-4" />{match.isPending ? "実投稿を照合中…" : "この条件で探す"}</button><button type="button" className="app-button-secondary" disabled={!title.trim() || createTracking.isPending || tracked} onClick={saveTracking}>{tracked ? "追跡に登録済み" : createTracking.isPending ? "保存中…" : "追跡登録に保存"}</button></div>
          {!signedIn && <button type="button" className="w-full text-center text-xs font-semibold text-primary underline" onClick={onLogin}>ログインしてManus AI照合と追跡保存を利用</button>}
        </form>

        <section className="space-y-4" aria-live="polite">
          <div className="app-card p-5">
              <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">照合候補</h2>{match.data && <span className="app-badge">{match.data.method === "ai" ? "Manus AI照合" : match.data.method === "guest" ? "AIなし類似度 · ログイン後AI" : match.data.method === "limit" ? "AIなし類似度 · AI利用上限" : match.data.method === "empty" ? "実投稿なし" : "AIなし類似度 · AI未応答"} · {match.data.candidates.length}件</span>}</div>
            {match.isPending && <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" />特徴と場所を照合しています</div>}
            {match.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">候補を読み込めませんでした。入力を保持しています。もう一度お試しください。</div>}
            {!match.isPending && !match.isError && !match.data && <EmptyState title="検索条件を入力してください" detail="入力内容は候補照合に使用します。登録されている拾得投稿のみを検索します。" />}
            {!match.isPending && match.data?.candidates.length === 0 && <EmptyState title="一致候補はまだありません" detail="条件を広げるか、紛失物追跡に保存してください。新しい実投稿が登録されると、候補通知が届きます。" />}
            {!!match.data?.candidates.length && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">{match.data.candidates.map((candidate: MatchPost) => <div key={candidate.id}><PostCard post={candidate} score={candidate.matchScore} matchedFeatures={candidate.matchedFeatures} onOpen={() => setSelected(candidate)} /><button type="button" className={`mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${compareIds.includes(candidate.id) ? "bg-teal-100 text-teal-900" : "border border-border text-slate-700 hover:bg-accent"}`} onClick={() => toggleCompare(candidate.id)}>{compareIds.includes(candidate.id) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{compareIds.includes(candidate.id) ? "比較中から外す" : "3件比較に追加"}</button></div>)}</div>}
          </div>
          {!!comparePosts.length && <div className="app-card p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-bold">候補を比較</h3><p className="text-xs text-muted-foreground">最大3件。比較結果は参考情報です。</p></div><button className="text-xs font-semibold text-muted-foreground underline" onClick={() => setCompareIds([])}>比較をクリア</button></div><div className="overflow-x-auto"><table className="min-w-[600px] border-collapse text-left text-sm"><tbody>
            <tr><th className="w-28 border p-2 text-xs text-muted-foreground">項目</th>{comparePosts.map(post => <td key={post.id} className="border p-2 font-bold">{post.title}</td>)}</tr>
            <tr><th className="border p-2 text-xs text-muted-foreground">一致度</th>{comparePosts.map(post => <td key={post.id} className="border p-2 font-bold text-teal-800">{post.matchScore}%</td>)}</tr>
            <tr><th className="border p-2 text-xs text-muted-foreground">カテゴリ</th>{comparePosts.map(post => <td key={post.id} className="border p-2">{CATEGORY_LABELS[post.category]}</td>)}</tr>
            <tr><th className="border p-2 text-xs text-muted-foreground">色・形</th>{comparePosts.map(post => <td key={post.id} className="border p-2">{post.color}・{post.shape}</td>)}</tr>
            <tr><th className="border p-2 text-xs text-muted-foreground">拾得日時</th>{comparePosts.map(post => <td key={post.id} className="border p-2">{new Date(post.foundAt).toLocaleString("ja-JP")}</td>)}</tr>
            <tr><th className="border p-2 text-xs text-muted-foreground">概略場所</th>{comparePosts.map(post => <td key={post.id} className="border p-2">{post.placeLabel}</td>)}</tr>
          </tbody></table></div></div>}
        </section>
      </div>
      <PostDetailDialog post={selected} onClose={() => setSelected(null)} signedIn={signedIn} onLogin={onLogin} onCaseCreated={() => onNavigate("mediation")} />
    </div>
  );
}
