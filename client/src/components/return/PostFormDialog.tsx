import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, type OwnedPost } from "@/components/return/Primitives";
import { MapPicker, PhotoUpload } from "@/components/return/LocationAndPhoto";
import { CATEGORY_LABELS, dateInputValue, fromLocalDate, type FacilityType, type ItemCategory } from "@/lib/return";
import { trpc } from "@/lib/trpc";
import { imageToSanitizedJpegDataUrl } from "@/lib/image";

const newForm = () => ({ title: "", category: "other" as ItemCategory, facilityType: "community" as FacilityType, color: "", shape: "", description: "", foundAt: dateInputValue(new Date()), storageUntil: "", placeLabel: "", deliveredTo: "", latitude: null as number | null, longitude: null as number | null, imageUrl: null as string | null, privateClues: "" });

export function PostFormDialog({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: OwnedPost | null; onSaved?: () => void }) {
  const [form, setForm] = useState(newForm());
  const [pendingPhotoDataUrl, setPendingPhotoDataUrl] = useState<string | null>(null);
  const [photoStorageConsent, setPhotoStorageConsent] = useState(false);
  const [photoAnalysisConsent, setPhotoAnalysisConsent] = useState(false);
  const [photoPublishConsent, setPhotoPublishConsent] = useState(false);
  const [quickPhotoBusy, setQuickPhotoBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const updateForm = (patch: Partial<ReturnType<typeof newForm>>) => setForm(current => ({ ...current, ...patch }));
  useEffect(() => {
    if (!open) return;
    setPendingPhotoDataUrl(null);
    setPhotoStorageConsent(false);
    if (!initial) {
      setPhotoAnalysisConsent(false);
      setPhotoPublishConsent(false);
      setForm(newForm());
      return;
    }
    const existingConsent = Boolean(initial.imageUrl && initial.photoConsentAt);
    setPhotoAnalysisConsent(existingConsent);
    setPhotoPublishConsent(existingConsent);
    setForm({ title: initial.title, category: initial.category, facilityType: initial.facilityType, color: initial.color, shape: initial.shape, description: initial.description, foundAt: dateInputValue(initial.foundAt), storageUntil: dateInputValue(initial.storageUntil), placeLabel: initial.placeLabel, deliveredTo: initial.deliveredTo, latitude: initial.latitude, longitude: initial.longitude, imageUrl: initial.imageUrl, privateClues: initial.privateClues });
  }, [open, initial]);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  const refresh = async () => { await Promise.all([utils.posts.search.invalidate(), utils.posts.map.invalidate(), utils.posts.mine.invalidate(), utils.personal.lost.list.invalidate()]); };
  const create = trpc.posts.create.useMutation({ onSuccess: async () => { await refresh(); toast.success("拾得物を公開投稿しました。"); onClose(); onSaved?.(); }, onError: error => toast.error(error.message) });
  const update = trpc.posts.update.useMutation({ onSuccess: async result => { if (!result.updated) return toast.error("投稿が見つかりませんでした。"); await refresh(); toast.success("投稿を更新しました。"); onClose(); onSaved?.(); }, onError: error => toast.error(error.message) });
  const analyzePhoto = trpc.posts.analyzePhoto.useMutation();
  const hasPhoto = Boolean(pendingPhotoDataUrl || form.imageUrl);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if ((form.latitude == null) !== (form.longitude == null)) return toast.error("地図上の位置が不完全です。位置を消すか、地図で選択してください。");
    if (hasPhoto && !photoStorageConsent) return toast.error("写真を保存するにはManus Storageへのアップロードに同意してください。");
    if (hasPhoto && (!photoAnalysisConsent || !photoPublishConsent)) return toast.error("写真を保存するには、Manus AI確認と公開表示の両方に同意してください。");
    const values = {
      ...form,
      imageUrl: pendingPhotoDataUrl ? null : form.imageUrl,
      photoDataUrl: pendingPhotoDataUrl ?? undefined,
      photoStorageConsent: hasPhoto && photoStorageConsent,
      photoConsent: hasPhoto && photoAnalysisConsent && photoPublishConsent,
      foundAt: fromLocalDate(form.foundAt) ?? new Date(),
      storageUntil: fromLocalDate(form.storageUntil),
      latitude: form.latitude,
      longitude: form.longitude,
    };
    if (initial) update.mutate({ id: initial.id, values }); else create.mutate(values);
  };
  const setPhoto = (dataUrl: string | null) => {
    setPendingPhotoDataUrl(dataUrl);
    if (!dataUrl) {
      setForm(current => ({ ...current, imageUrl: null }));
      setPhotoStorageConsent(false);
    }
    setPhotoAnalysisConsent(false);
    setPhotoPublishConsent(false);
  };
  const setPoint = (point: { latitude: number; longitude: number } | null) => setForm(current => ({ ...current, latitude: point?.latitude ?? null, longitude: point?.longitude ?? null }));
  const quickPostFromPhoto = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("JPEG・PNG・WebP画像を選択してください。");
    if (file.size > 5 * 1024 * 1024) return toast.error("画像サイズは5MB以下にしてください。");
    setQuickPhotoBusy(true);
    try {
      const dataUrl = await imageToSanitizedJpegDataUrl(file, 1600, 0.84);
      const draft = await analyzePhoto.mutateAsync({ photoDataUrl: dataUrl });
      setPendingPhotoDataUrl(dataUrl);
      setPhotoStorageConsent(false);
      setPhotoAnalysisConsent(false);
      setPhotoPublishConsent(false);
      updateForm({ title: draft.title, category: draft.category, color: draft.color, shape: draft.shape, description: draft.description });
      toast.success("写真から投稿の下書きを作成しました。内容・場所・届け先を確認して公開してください。");
    } catch (error) { toast.error(error instanceof Error ? error.message : "写真をAIで解析できませんでした。"); }
    finally { setQuickPhotoBusy(false); }
  };
  return <Dialog open={open} onClose={onClose} title={initial ? "拾得投稿を編集" : "拾得物を投稿"} wide>
    <form className="min-w-0 space-y-4" onSubmit={submit}>
      {!initial && <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4"><div className="flex items-start gap-3"><ImagePlus className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" /><div className="min-w-0 flex-1"><p className="font-bold text-teal-950">写真で簡単投稿</p><p className="mt-1 text-xs leading-5 text-teal-900/80">写真を1枚選ぶと、AIが品名・カテゴリ・色・特徴・説明の下書きを作成します。内容を確認・修正してから投稿できます。</p><label className={`mt-3 inline-flex app-button-primary ${quickPhotoBusy ? "pointer-events-none opacity-60" : ""}`}><span className="flex items-center gap-2">{quickPhotoBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{quickPhotoBusy ? "AIが解析中…" : "写真から作成"}</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={quickPhotoBusy} onChange={event => { void quickPostFromPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label></div></div></div>}
      <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-3 text-sm leading-6 text-teal-950"><ShieldCheck className="mr-2 inline h-4 w-4" />公開される説明・写真には、他人の氏名、連絡先、住所、SNS ID、カード番号を含めないでください。氏名の自動検出は完全ではありません。所有確認に必要な特徴は下の非公開メモに入力してください。</div>
      <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
        <label className="min-w-0"><span className="app-label">品物の名前 *</span><input ref={titleRef} className="app-input" required maxLength={160} value={form.title} onChange={event => updateForm({ title: event.target.value })} placeholder="例: 黒い折りたたみ傘" /></label>
        <label className="min-w-0"><span className="app-label">カテゴリ</span><select className="app-input" value={form.category} onChange={event => updateForm({ category: event.target.value as ItemCategory })}>{Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="min-w-0"><span className="app-label">拾得元の種別</span><select className="app-input" value={form.facilityType} onChange={event => updateForm({ facilityType: event.target.value as FacilityType })}><option value="community">利用者投稿</option><option value="rail">鉄道・駅</option><option value="police">警察署・交番</option><option value="bus">バス</option><option value="commercial">商業施設</option><option value="other">その他</option></select><span className="mt-1 block break-words text-xs text-muted-foreground">種別を選択しても、機関の公式データと連携するわけではありません。</span></label>
        <label className="min-w-0"><span className="app-label">拾得した日時 *</span><input className="app-input" type="datetime-local" required value={form.foundAt} onChange={event => updateForm({ foundAt: event.target.value })} /></label>
        <label className="min-w-0"><span className="app-label">保管期限（分かる場合）</span><input className="app-input" type="datetime-local" value={form.storageUntil} onChange={event => updateForm({ storageUntil: event.target.value })} /><span className="mt-1 block break-words text-xs text-muted-foreground">期限が近づいた投稿は検索画面で注意表示します。期限が未確認の場合は空欄にしてください。</span></label>
        <label className="min-w-0"><span className="app-label">色 *</span><input className="app-input" required maxLength={80} value={form.color} onChange={event => updateForm({ color: event.target.value })} placeholder="例: 黒、紺色" /></label>
        <label className="min-w-0"><span className="app-label">形・特徴 *</span><input className="app-input" required maxLength={160} value={form.shape} onChange={event => updateForm({ shape: event.target.value })} placeholder="例: 二つ折り、金色の金具" /></label>
        <label className="min-w-0"><span className="app-label">拾得場所（概略） *</span><input className="app-input" required maxLength={200} value={form.placeLabel} onChange={event => updateForm({ placeLabel: event.target.value })} placeholder="例: ○○駅周辺、○○公園付近" /></label>
        <label className="min-w-0"><span className="app-label">届け先・保管先 *</span><input className="app-input" required maxLength={200} value={form.deliveredTo} onChange={event => updateForm({ deliveredTo: event.target.value })} placeholder="例: 駅係員窓口、施設受付" /><span className="mt-1 block break-words text-xs text-muted-foreground">公開される欄です。個人宅の住所や番地は入力しないでください。</span></label>
        <label className="min-w-0 sm:col-span-2"><span className="app-label">公開する説明 *</span><textarea className="app-input app-textarea" required maxLength={3000} value={form.description} onChange={event => updateForm({ description: event.target.value })} placeholder="見つけた状況と、公開しても問題のない特徴を記載してください。" /></label>
      </div>
      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
        <p>写真は端末内でJPEGへ再圧縮して撮影メタデータを除去します。保存ボタンを押すまでは写真本体をサーバーへ送りません。送信後、Manus AIへ一時送信して安全確認し、合格後に限りManus Storageへ保存して公開します。自動審査は完全ではありません。AI審査に失敗した写真はStorageへ保存しません。投稿を削除すると公開一覧からは外れますが、Storageの物理ファイル自体は削除できず残る場合があります。Google Cloud VisionとWeb上の一致画像検索は未接続です。</p>
        <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={photoStorageConsent} onChange={event => setPhotoStorageConsent(event.target.checked)} /><span>AI審査に通った写真を投稿送信時にManus Storageへ保存することに同意します。投稿データを削除しても画像ファイル自体は残る場合があります。</span></label>
        {hasPhoto && <>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={photoAnalysisConsent} onChange={event => setPhotoAnalysisConsent(event.target.checked)} /><span>写真をManus AIへ一時送信し、公開安全性を確認することに同意します。</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={photoPublishConsent} onChange={event => setPhotoPublishConsent(event.target.checked)} /><span>AI確認を通過した場合、この写真を公開拾得投稿に表示することに同意します。顔・氏名・住所・連絡先・身分証・カード番号は含めていません。</span></label>
        </>}
      </div>
      <PhotoUpload value={pendingPhotoDataUrl ?? form.imageUrl} onChange={setPhoto} disabled={!photoStorageConsent} />
      <MapPicker latitude={form.latitude} longitude={form.longitude} onChange={setPoint} label="拾得地点（任意）" />
      {form.latitude != null && form.longitude != null && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />選択地点は公開時にぼかして表示します。</p>}
      <label><span className="app-label">所有者確認用の非公開メモ *（10文字以上）</span><textarea className="app-input min-h-20" required minLength={10} maxLength={2000} value={form.privateClues} onChange={event => updateForm({ privateClues: event.target.value })} placeholder="例: 内側の小さなシール、付属品、目立たない傷。電話番号や住所は書かないでください。" /><span className="mt-1 block text-xs text-muted-foreground">このメモは一般検索には表示されず、投稿者本人が所有確認に使います。</span></label>
      <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" className="app-button-secondary" onClick={onClose}>キャンセル</button><button className="app-button-primary" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "保存中…" : initial ? "変更を保存" : "投稿を公開"}</button></div>
    </form>
  </Dialog>;
}
