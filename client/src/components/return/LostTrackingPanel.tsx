import { useState } from "react";
import { BellRing, LoaderCircle, Pause, Play, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PhotoUpload } from "@/components/return/LocationAndPhoto";
import { EmptyState, PostCard, type RouterOutputs } from "@/components/return/Primitives";
import { PostDetailDialog, type PostDetail } from "@/components/return/PostDetailDialog";
import { CATEGORY_LABELS, dateInputValue, dateTimeLabel, fromLocalDate, type ItemCategory } from "@/lib/return";
import { trpc } from "@/lib/trpc";

type LostItem = RouterOutputs["personal"]["lost"]["list"][number];
type LostMatch = RouterOutputs["personal"]["lost"]["matches"][number];
const empty = { title: "", category: "other" as ItemCategory, details: "", lostAt: "", location: "", route: "", imageUrl: null as string | null };

export function LostTrackingPanel({ onLogin, signedIn, onNavigate }: { onLogin: () => void; signedIn: boolean; onNavigate: (tab: string) => void }) {
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedLostId, setSelectedLostId] = useState<number | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const utils = trpc.useUtils();
  const items = trpc.personal.lost.list.useQuery();
  const matches = trpc.personal.lost.matches.useQuery({ id: selectedLostId ?? 0 }, { enabled: selectedLostId !== null });
  const refresh = async () => { await Promise.all([utils.personal.lost.list.invalidate(), selectedLostId ? utils.personal.lost.matches.invalidate({ id: selectedLostId }) : Promise.resolve(), utils.notifications.list.invalidate()]); };
  const create = trpc.personal.lost.create.useMutation({ onSuccess: async () => { toast.success("追跡登録を保存しました。"); setForm(empty); setEditingId(null); await refresh(); }, onError: error => toast.error(error.message) });
  const update = trpc.personal.lost.update.useMutation({ onSuccess: async () => { toast.success("追跡登録を更新しました。"); setForm(empty); setEditingId(null); await refresh(); }, onError: error => toast.error(error.message) });
  const setActive = trpc.personal.lost.setActive.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const remove = trpc.personal.lost.delete.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!signedIn) return onLogin();
    const values = { ...form, lostAt: fromLocalDate(form.lostAt) ?? null, route: form.route || null };
    if (editingId) update.mutate({ id: editingId, values }); else create.mutate(values);
  };
  const edit = (item: LostItem) => {
    setEditingId(item.id);
    setForm({ title: item.title, category: item.category, details: item.details, lostAt: dateInputValue(item.lostAt), location: item.location, route: item.route ?? "", imageUrl: item.imageUrl ?? null });
  };

  return <div className="space-y-5">
    <form className="app-card space-y-4 p-5" onSubmit={submit}>
      <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">紛失物を追跡登録</h2><p className="mt-1 text-xs text-muted-foreground">登録後に新しい実投稿との候補を照合します。</p></div>{editingId && <button className="text-sm underline" type="button" onClick={() => { setEditingId(null); setForm(empty); }}>編集を中止</button>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><label><span className="app-label">品物の名前 *</span><input className="app-input" required maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label><label><span className="app-label">カテゴリ</span><select className="app-input" value={form.category} onChange={event => setForm({ ...form, category: event.target.value as ItemCategory })}>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="app-label">色・形・傷・付属品など *</span><textarea className="app-input app-textarea" required maxLength={3000} value={form.details} onChange={event => setForm({ ...form, details: event.target.value })} /></label>
        <label><span className="app-label">紛失日時</span><input className="app-input" type="datetime-local" value={form.lostAt} onChange={event => setForm({ ...form, lostAt: event.target.value })} /></label><label><span className="app-label">場所・エリア *</span><input className="app-input" required maxLength={200} value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} /></label>
        <label className="sm:col-span-2"><span className="app-label">路線・施設名（任意）</span><input className="app-input" maxLength={200} value={form.route} onChange={event => setForm({ ...form, route: event.target.value })} /></label>
      </div>
      <PhotoUpload value={form.imageUrl} onChange={imageUrl => setForm({ ...form, imageUrl })} />
      <div className="flex justify-end"><button className="app-button-primary" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "保存中…" : editingId ? "追跡登録を更新" : "追跡を開始"}</button></div>
    </form>
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><BellRing className="h-5 w-5 text-primary" />追跡中の紛失物</h2>
      {items.isLoading && <p className="py-6 text-sm text-muted-foreground">追跡登録を読み込み中…</p>}
      {!items.isLoading && items.data?.length === 0 && <EmptyState title="追跡登録はありません" detail="紛失物を登録すると、今後追加される実拾得投稿から似た候補を探して通知します。" />}
      <div className="space-y-3">{items.data?.map(item => <article key={item.id} className={`app-card p-4 ${!item.isActive ? "opacity-70" : ""}`}>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.title}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.isActive ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{item.isActive ? "追跡中" : "一時停止"}</span></div><p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABELS[item.category]} · {item.location} {item.route ? `· ${item.route}` : ""}</p><p className="mt-2 line-clamp-2 text-sm">{item.details}</p><p className="mt-1 text-xs text-muted-foreground">紛失: {dateTimeLabel(item.lostAt)}</p></div>
          <div className="flex flex-wrap gap-2"><button className="app-button-secondary text-xs" onClick={() => setSelectedLostId(selectedLostId === item.id ? null : item.id)}><Search className="h-3.5 w-3.5" />候補を確認</button><button className="app-button-secondary text-xs" onClick={() => edit(item)}>編集</button><button className="app-button-secondary text-xs" onClick={() => setActive.mutate({ id: item.id, active: !item.isActive })}>{item.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{item.isActive ? "一時停止" : "再開"}</button><button className="app-button-danger text-xs" onClick={() => { if (window.confirm("この追跡登録を解除して削除しますか？")) remove.mutate({ id: item.id }); }}><Trash2 className="h-3.5 w-3.5" />解除</button></div>
        </div>
        {selectedLostId === item.id && <div className="mt-4 border-t border-border pt-4">{matches.isFetching && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />実投稿を照合中</p>}{matches.data?.length === 0 && <p className="text-sm text-muted-foreground">この条件に近い実投稿はまだありません。新しい投稿が登録されると候補通知が届きます。</p>}<div className="grid gap-3 md:grid-cols-2">{matches.data?.map((candidate: LostMatch) => <PostCard key={candidate.id} post={candidate} score={candidate.score} matchedFeatures={candidate.matchedFeatures} onOpen={() => setSelectedPost(candidate)} />)}</div></div>}
      </article>)}</div>
    </section>
    <PostDetailDialog post={selectedPost} onClose={() => setSelectedPost(null)} signedIn={signedIn} onLogin={onLogin} onCaseCreated={() => onNavigate("mediation")} />
  </div>;
}
