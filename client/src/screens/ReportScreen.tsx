import { useEffect, useState } from "react";
import { Download, FilePlus2, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { RouterOutputs } from "@/components/return/Primitives";
import { EmptyState, SectionHeading } from "@/components/return/Primitives";
import { CATEGORY_LABELS, dateInputValue, dateTimeLabel, fromLocalDate } from "@/lib/return";
import { trpc } from "@/lib/trpc";
import { Dialog } from "@/components/return/Primitives";

type LossReport = RouterOutputs["personal"]["reports"]["list"][number];
type User = RouterOutputs["auth"]["me"];
const destinations = ["警察署・交番", "鉄道・駅係員", "バス会社", "商業施設・施設窓口"];
const blank = (user: User) => ({ fullName: user?.name ?? "", phone: user?.phone ?? "", itemName: "", category: "other", details: "", lostAt: "", location: "", route: "", destinations: [] as string[] });

export default function ReportScreen({ user }: { user: User }) {
  const [form, setForm] = useState(blank(user));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [printId, setPrintId] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const utils = trpc.useUtils();
  const reports = trpc.personal.reports.list.useQuery();
  useEffect(() => { if (!editingId && !form.fullName && user?.name) setForm(prev => ({ ...prev, fullName: user.name ?? "" })); }, [user?.name, form.fullName, editingId]);
  const create = trpc.personal.reports.create.useMutation({
    onSuccess: async () => { await utils.personal.reports.list.invalidate(); toast.success("遺失届の入力内容を保存しました。"); setForm(blank(user)); setEditingId(null); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.personal.reports.update.useMutation({
    onSuccess: async () => { await utils.personal.reports.list.invalidate(); toast.success("遺失届の下書きを更新しました。"); setForm(blank(user)); setEditingId(null); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.personal.reports.delete.useMutation({ onSuccess: async () => { await utils.personal.reports.list.invalidate(); toast.success("保存した入力データを削除しました。"); } });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setReviewOpen(true);
  };
  const confirmSave = () => {
    const values = { ...form, lostAt: fromLocalDate(form.lostAt) ?? null };
    if (editingId) update.mutate({ id: editingId, values }); else create.mutate(values);
    setReviewOpen(false);
  };
  const beginEdit = (report: LossReport) => {
    setEditingId(report.id);
    setForm({ fullName: report.fullName, phone: report.phone, itemName: report.itemName, category: report.category, details: report.details, lostAt: dateInputValue(report.lostAt), location: report.location, route: report.route ?? "", destinations: report.destinations });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const download = (report: LossReport) => {
    const content = ["遺失届入力メモ（提出用の下書き）", `氏名: ${report.fullName}`, `連絡先: ${report.phone}`, `品物: ${report.itemName}`, `分類: ${CATEGORY_LABELS[report.category as keyof typeof CATEGORY_LABELS] ?? report.category}`, `特徴: ${report.details}`, `紛失日時: ${dateTimeLabel(report.lostAt)}`, `場所: ${report.location}`, `路線・施設: ${report.route || "未入力"}`, `相談先候補: ${report.destinations.join("、") || "未選択"}`, "", "このファイルは入力内容の控えです。公的機関等へ提出・送信されていません。"].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `return-loss-report-${report.id}.txt`; anchor.click(); URL.revokeObjectURL(url);
  };
  const print = (report: LossReport) => { setPrintId(report.id); window.setTimeout(() => window.print(), 100); };

  return (
    <div>
      <SectionHeading eyebrow="入力をまとめる" title="遺失届データ作成" description="必要項目を保存して控えを印刷できます。警察・鉄道・バス等へ自動送信や届出は行いません。提出先の書式と要件は各機関にご確認ください。" />
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">この画面は入力・保存・印刷用です。ここに入力した内容は外部の警察・事業者に送信されません。電話番号や品物の詳細はアカウントに保存されるため、共有端末ではログアウトしてください。</div>
      <form className="app-card no-print space-y-4 p-5" onSubmit={submit}>
        <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{editingId ? "保存内容を編集" : "届出用情報を入力"}</h2>{editingId && <button type="button" className="text-sm underline" onClick={() => { setForm(blank(user)); setEditingId(null); }}>編集をやめる</button>}</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="app-label">氏名 *</span><input className="app-input" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} required maxLength={120} /></label>
          <label><span className="app-label">連絡先 *</span><input className="app-input" type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} required maxLength={40} autoComplete="tel" /></label>
          <label><span className="app-label">品物の名前 *</span><input className="app-input" value={form.itemName} onChange={event => setForm({ ...form, itemName: event.target.value })} required maxLength={160} /></label>
          <label><span className="app-label">分類 *</span><select className="app-input" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{Object.entries(CATEGORY_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="app-label">品物の特徴 *</span><textarea className="app-input app-textarea" value={form.details} onChange={event => setForm({ ...form, details: event.target.value })} required maxLength={3000} placeholder="色、形、メーカー、目印など。カード番号や暗証番号は入力しないでください。" /></label>
          <label><span className="app-label">紛失した日時</span><input className="app-input" type="datetime-local" value={form.lostAt} onChange={event => setForm({ ...form, lostAt: event.target.value })} /></label>
          <label><span className="app-label">紛失した場所 *</span><input className="app-input" value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} required maxLength={200} /></label>
          <label className="sm:col-span-2"><span className="app-label">路線・施設名</span><input className="app-input" value={form.route} onChange={event => setForm({ ...form, route: event.target.value })} maxLength={200} /></label>
        </div>
        <fieldset><legend className="app-label">相談先候補（実際の連携・提出は行いません）</legend><div className="grid gap-2 sm:grid-cols-2">{destinations.map(destination => <label key={destination} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={form.destinations.includes(destination)} onChange={event => setForm({ ...form, destinations: event.target.checked ? [...form.destinations, destination] : form.destinations.filter(value => value !== destination) })} />{destination}</label>)}</div></fieldset>
        <div className="flex flex-wrap justify-end gap-2"><button className="app-button-primary" disabled={create.isPending || update.isPending}><Save className="h-4 w-4" />{create.isPending || update.isPending ? "保存中…" : "内容を確認して保存"}</button></div>
      </form>
      <div className="no-print mt-8">
        <h2 className="mb-3 text-lg font-bold">保存済みデータ</h2>
        {reports.isLoading && <p className="py-6 text-sm text-muted-foreground">保存内容を読み込んでいます…</p>}
        {reports.data?.length === 0 && <EmptyState title="保存済みの届出データはありません" detail="上のフォームで入力し、アカウントに保存するとここに表示されます。" action={<span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><FilePlus2 className="h-4 w-4" />必要事項を入力して保存</span>} />}
        <div className="grid gap-3 md:grid-cols-2">{reports.data?.map(report => <article key={report.id} className="app-card p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{report.itemName}</h3><p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABELS[report.category as keyof typeof CATEGORY_LABELS] ?? report.category} · {report.location}</p><p className="mt-2 text-xs text-muted-foreground">更新 {dateTimeLabel(report.updatedAt)}</p></div><span className="app-badge">下書き</span></div>
          <div className="mt-3 flex flex-wrap gap-2"><button className="app-button-secondary text-sm" onClick={() => beginEdit(report)}>編集</button><button className="app-button-secondary text-sm" onClick={() => print(report)}><Printer className="h-4 w-4" />印刷・PDF保存</button><button className="app-button-secondary text-sm" onClick={() => download(report)}><Download className="h-4 w-4" />テキスト出力</button><button className="app-button-danger text-sm" onClick={() => { if (window.confirm("この保存データを削除しますか？")) remove.mutate({ id: report.id }); }}><Trash2 className="h-4 w-4" />削除</button></div>
        </article>)}</div>
      </div>
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="保存内容を確認">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">この内容はあなたのアカウントに下書きとして保存されます。警察・鉄道・バス会社などには送信・提出されません。電話番号等の個人情報が正しいか確認してください。</div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">氏名・連絡先</dt><dd className="font-semibold">{form.fullName} · {form.phone}</dd></div><div><dt className="text-xs text-muted-foreground">品物</dt><dd className="font-semibold">{form.itemName} · {CATEGORY_LABELS[form.category as keyof typeof CATEGORY_LABELS] ?? form.category}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">特徴</dt><dd className="whitespace-pre-wrap">{form.details}</dd></div><div><dt className="text-xs text-muted-foreground">日時</dt><dd>{dateTimeLabel(fromLocalDate(form.lostAt))}</dd></div><div><dt className="text-xs text-muted-foreground">場所・路線</dt><dd>{form.location} · {form.route || "路線未入力"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">相談先候補（外部送信なし）</dt><dd>{form.destinations.join("、") || "未選択"}</dd></div></dl>
        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4"><button className="app-button-secondary" onClick={() => setReviewOpen(false)}>戻って修正</button><button className="app-button-primary" onClick={confirmSave} disabled={create.isPending || update.isPending}><Save className="h-4 w-4" />保存する</button></div>
      </Dialog>
      {reports.data?.map(report => <article key={`print-${report.id}`} className={`print-only ${printId === report.id ? "print-active" : ""}`}><h1 className="mb-6 text-2xl font-bold">遺失届入力メモ</h1><p>氏名: {report.fullName}</p><p>連絡先: {report.phone}</p><p>品物: {report.itemName}（{CATEGORY_LABELS[report.category as keyof typeof CATEGORY_LABELS] ?? report.category}）</p><p>特徴: {report.details}</p><p>紛失日時: {dateTimeLabel(report.lostAt)}</p><p>場所: {report.location}</p><p>路線・施設: {report.route || "未入力"}</p><p>相談先候補: {report.destinations.join("、") || "未選択"}</p><p className="mt-8 border-t pt-4 text-sm">これは入力の控えです。公的機関等へ提出・送信されていません。</p></article>)}
    </div>
  );
}
