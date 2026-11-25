import { useEffect, useRef, useState } from "react";
import { Archive, Clipboard, LoaderCircle, LockKeyhole, Plus, RefreshCw, Search, Share2, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { PostCard, SectionHeading, type RouterOutputs } from "@/components/return/Primitives";
import { PostDetailDialog, type PostDetail } from "@/components/return/PostDetailDialog";
import { trpc } from "@/lib/trpc";
import { CATEGORY_KEYS, CATEGORY_LABELS, FACILITY_KEYS, FACILITY_LABELS, fromLocalDate, type FacilityType, type ItemCategory } from "@/lib/return";
import {
  createGuestShareCode,
  decryptGuestVault,
  emptyGuestVault,
  encryptGuestVault,
  GuestVaultTooLargeError,
  GUEST_CODE_STORAGE_KEY,
  parseGuestShareCode,
  type GuestSavedSearch,
  type GuestTracking,
  type GuestVaultData,
} from "@/lib/guest-vault";

export type GuestSearchDraft = { query: string; category: ItemCategory | null; facilityType: FacilityType | null; route?: string | null };
type GuestRunSearch = { query: string; category: ItemCategory | null; facilityType: FacilityType | null; route: string | null };
type GuestPost = RouterOutputs["posts"]["search"][number];
type Props = {
  signedIn: boolean;
  onLogin: () => void;
  onNavigate: (tab: string) => void;
  onRunSearch: (search: GuestRunSearch) => void;
  initialSearch?: GuestSearchDraft | null;
  onInitialSearchUsed: () => void;
};

type SyncStatus = "idle" | "loading" | "active" | "missing" | "expired" | "revoked" | "error";
const emptySearch = { label: "", query: "", category: "" as ItemCategory | "", facilityType: "" as FacilityType | "", route: "" };
const emptyTracking = { title: "", category: "other" as ItemCategory, details: "", lostAt: "", location: "", route: "" };

export function GuestSyncPanel({ signedIn, onLogin, onNavigate, onRunSearch, initialSearch, onInitialSearchUsed }: Props) {
  const [shareCode, setShareCode] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(GUEST_CODE_STORAGE_KEY) ?? "");
  const [codeInput, setCodeInput] = useState("");
  const [status, setStatus] = useState<SyncStatus>(shareCode ? "loading" : "idle");
  const [vault, setVault] = useState<GuestVaultData>(emptyGuestVault);
  const [revision, setRevision] = useState<number | null>(null);
  const revisionRef = useRef<number | null>(null);
  const [searchForm, setSearchForm] = useState(emptySearch);
  const [trackingForm, setTrackingForm] = useState(emptyTracking);
  const [selectedTrackingId, setSelectedTrackingId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [isCodeVisible, setIsCodeVisible] = useState(false);
  const loadVault = trpc.guestSync.load.useMutation();
  const saveVault = trpc.guestSync.save.useMutation();
  const revokeVault = trpc.guestSync.revoke.useMutation();
  const activeTracking = vault.tracking.find(item => item.id === selectedTrackingId) ?? null;
  const trackingCandidates = trpc.posts.search.useQuery({
    query: activeTracking ? `${activeTracking.title} ${activeTracking.details}`.trim() : undefined,
    route: activeTracking?.route || activeTracking?.location || undefined,
    category: activeTracking?.category,
    sort: "relevance",
    limit: 8,
  }, { enabled: Boolean(activeTracking), staleTime: 0 });

  const setRevisionValue = (value: number | null) => {
    revisionRef.current = value;
    setRevision(value);
  };

  useEffect(() => {
    if (!initialSearch) return;
    setSearchForm({
      label: initialSearch.query.trim() || "保存した検索条件",
      query: initialSearch.query,
      category: (initialSearch.category ?? "") as ItemCategory | "",
      facilityType: (initialSearch.facilityType ?? "") as FacilityType | "",
      route: initialSearch.route ?? "",
    });
  }, [initialSearch]);

  useEffect(() => {
    if (!shareCode) return;
    let alive = true;
    let busy = false;
    const syncFromCloud = async (quiet: boolean) => {
      if (busy) return;
      busy = true;
      if (!quiet) setStatus("loading");
      try {
        const parsed = parseGuestShareCode(shareCode);
        const remote = await loadVault.mutateAsync({ accessKey: parsed.accessKey });
        if (!alive) return;
        if (remote.status === "active" && remote.encryptedPayload) {
          if (revisionRef.current === null || remote.revision > revisionRef.current) {
            const data = await decryptGuestVault(remote.encryptedPayload, shareCode);
            if (!alive) return;
            setVault(data);
            setRevisionValue(remote.revision);
          }
          setStatus("active");
        } else {
          setRevisionValue(remote.revision);
          setVault(emptyGuestVault());
          setStatus(remote.status === "missing" ? "missing" : remote.status);
        }
      } catch {
        if (alive) {
          setStatus("error");
          if (!quiet) toast.error("共有ボックスを読み込めませんでした。通信または共有コードを確認してください。");
        }
      } finally {
        busy = false;
      }
    };
    void syncFromCloud(false);
    const timer = window.setInterval(() => void syncFromCloud(true), 15_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [shareCode]);

  const createBox = async () => {
    if (status === "active") {
      toast.error("新しい共有ボックスを作る前に、現在のコードを失効してください。");
      return;
    }
    try {
      const nextCode = createGuestShareCode();
      const encryptedPayload = await encryptGuestVault(emptyGuestVault(), nextCode);
      const parsed = parseGuestShareCode(nextCode);
      const result = await saveVault.mutateAsync({ accessKey: parsed.accessKey, expectedRevision: null, encryptedPayload });
      if (result.status !== "saved") {
        toast.error("共有ボックスを作成できませんでした。新しいコードでもう一度お試しください。");
        return;
      }
      window.localStorage.setItem(GUEST_CODE_STORAGE_KEY, nextCode);
      setShareCode(nextCode);
      setVault(emptyGuestVault());
      setRevisionValue(result.revision);
      setStatus("active");
      setIsCodeVisible(true);
      toast.success("共有ボックスを作成しました。コードを別端末へ安全に共有してください。");
    } catch {
      toast.error("共有ボックスを作成できませんでした。ブラウザーの暗号化機能を確認してください。");
    }
  };

  const restoreBox = async () => {
    try {
      const parsed = parseGuestShareCode(codeInput);
      const remote = await loadVault.mutateAsync({ accessKey: parsed.accessKey });
      if (remote.status !== "active" || !remote.encryptedPayload) {
        const text = remote.status === "missing" ? "このコードの共有ボックスは見つかりません。コードを再確認してください。" : remote.status === "expired" ? "この共有ボックスは90日間アクセスがなく期限切れです。新しいコードを作成してください。" : "この共有コードは失効済みです。新しいコードを作成してください。";
        toast.error(text);
        setStatus(remote.status === "missing" ? "missing" : remote.status);
        return;
      }
      const data = await decryptGuestVault(remote.encryptedPayload, codeInput.trim());
      window.localStorage.setItem(GUEST_CODE_STORAGE_KEY, codeInput.trim());
      setShareCode(codeInput.trim());
      setVault(data);
      setRevisionValue(remote.revision);
      setStatus("active");
      setCodeInput("");
      toast.success("共有ボックスをこの端末に復元しました。");
    } catch {
      toast.error("コードを復元できませんでした。コードが正しいか、コピー漏れがないか確認してください。");
    }
  };

  const refreshNow = async () => {
    if (!shareCode) return;
    try {
      const parsed = parseGuestShareCode(shareCode);
      const remote = await loadVault.mutateAsync({ accessKey: parsed.accessKey });
      if (remote.status === "active" && remote.encryptedPayload && (revisionRef.current === null || remote.revision > revisionRef.current)) {
        setVault(await decryptGuestVault(remote.encryptedPayload, shareCode));
        setRevisionValue(remote.revision);
      } else if (remote.status !== "active") {
        setStatus(remote.status);
        setRevisionValue(remote.revision);
        setVault(emptyGuestVault());
      }
      toast.success("共有ボックスを確認しました。");
    } catch {
      toast.error("共有ボックスを更新できませんでした。");
    }
  };

  const commitVault = async (next: GuestVaultData) => {
    if (status !== "active" || !shareCode) {
      toast.error("先に共有ボックスを作成するか、別端末から復元してください。");
      return false;
    }
    try {
      const parsed = parseGuestShareCode(shareCode);
      const encryptedPayload = await encryptGuestVault(next, shareCode);
      const result = await saveVault.mutateAsync({ accessKey: parsed.accessKey, expectedRevision: revisionRef.current, encryptedPayload });
      if (result.status === "saved") {
        setVault(next);
        setRevisionValue(result.revision);
        return true;
      }
      if (result.status === "conflict" && result.encryptedPayload) {
        setVault(await decryptGuestVault(result.encryptedPayload, shareCode));
        setRevisionValue(result.revision);
        setStatus("active");
        toast.error("別端末で先に変更されました。最新の内容を読み込みました。操作をもう一度行ってください。");
        return false;
      }
      if (result.status === "conflict") {
        setStatus("active");
        toast.error("別端末の変更と競合しました。共有ボックスを再読込してから操作してください。");
        return false;
      }
      setStatus(result.status === "missing" ? "missing" : result.status);
      toast.error(result.status === "expired" ? "共有ボックスの期限が切れました。新しいコードを作成してください。" : "共有コードが失効または利用できません。");
      return false;
    } catch (error) {
      toast.error(error instanceof GuestVaultTooLargeError ? error.message : "変更を同期できませんでした。ネットワークを確認して再度お試しください。");
      return false;
    }
  };

  const addSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (vault.savedSearches.length >= 40) return toast.error("共有検索条件は40件まで保存できます。");
    const item: GuestSavedSearch = {
      id: crypto.randomUUID(), label: searchForm.label.trim() || searchForm.query.trim() || "共有検索条件",
      query: searchForm.query.trim(), category: searchForm.category || null, facilityType: searchForm.facilityType || null,
      route: searchForm.route.trim() || null, updatedAt: new Date().toISOString(),
    };
    if (await commitVault({ ...vault, savedSearches: [item, ...vault.savedSearches] })) {
      setSearchForm(emptySearch);
      if (initialSearch) onInitialSearchUsed();
      toast.success("共有検索条件を同期しました。");
    }
  };

  const addTracking = async (event: React.FormEvent) => {
    event.preventDefault();
    if (vault.tracking.length >= 40) return toast.error("共有追跡条件は40件まで保存できます。");
    const item: GuestTracking = {
      id: crypto.randomUUID(), title: trackingForm.title.trim(), category: trackingForm.category,
      details: trackingForm.details.trim(), lostAt: fromLocalDate(trackingForm.lostAt)?.toISOString() ?? null,
      location: trackingForm.location.trim(), route: trackingForm.route.trim() || null,
      isActive: true, updatedAt: new Date().toISOString(),
    };
    if (await commitVault({ ...vault, tracking: [item, ...vault.tracking] })) {
      setTrackingForm(emptyTracking);
      toast.success("共有追跡条件を同期しました。");
    }
  };

  const revoke = async () => {
    if (!shareCode || !window.confirm("この共有コードを失効しますか？他の端末も次回同期時からアクセスできなくなり、暗号文はサーバー上で消去されます。")) return;
    try {
      const parsed = parseGuestShareCode(shareCode);
      const result = await revokeVault.mutateAsync({ accessKey: parsed.accessKey });
      if (result.status === "revoked" || result.status === "missing") {
        window.localStorage.removeItem(GUEST_CODE_STORAGE_KEY);
        setShareCode("");
        setVault(emptyGuestVault());
        setRevisionValue(null);
        setStatus("idle");
        toast.success("共有コードを失効しました。");
      } else {
        setStatus(result.status);
        toast.error("期限切れのボックスは復元できません。新しいコードを作成してください。");
      }
    } catch {
      toast.error("共有コードを失効できませんでした。");
    }
  };

  const copyCode = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      toast.success("共有コードをコピーしました。パスワードと同じように安全に共有してください。");
    } catch {
      setIsCodeVisible(true);
      toast.error("自動コピーできません。表示されたコードを選択してコピーしてください。");
    }
  };
  const shareCodeToDevice = async () => {
    if (!shareCode || !navigator.share) return copyCode();
    try { await navigator.share({ title: "return 共有ボックス", text: `returnの共有コードです。アプリの共有ボックスで復元してください。\n${shareCode}` }); }
    catch { /* user cancelled */ }
  };

  const removeSearch = (id: string) => void commitVault({ ...vault, savedSearches: vault.savedSearches.filter(item => item.id !== id) }).then(saved => { if (saved) toast.success("共有検索条件を削除しました。"); });
  const toggleTracking = (item: GuestTracking) => void commitVault({ ...vault, tracking: vault.tracking.map(current => current.id === item.id ? { ...current, isActive: !current.isActive, updatedAt: new Date().toISOString() } : current) });
  const removeTracking = (id: string) => void commitVault({ ...vault, tracking: vault.tracking.filter(item => item.id !== id) }).then(saved => { if (saved) toast.success("共有追跡条件を解除しました。"); });

  return <section className="app-card space-y-5 p-5 sm:p-6">
    <SectionHeading eyebrow="ログイン不要の共有" title="共有ボックス" description="複数アカウント・ゲスト端末で検索条件と追跡条件を共有します。個人アカウント情報や仲介案件は共有されません。" />
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
      <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p><b>アカウント同期と共有ボックスは別です。</b>公開中の実投稿は全員に表示されます。プロフィール・遺失届・通知は本人アカウントだけ、仲介は当事者だけに同期します。共有ボックスのコードを使うと、検索/追跡条件だけをログインなしでも共同利用できます。</p></div>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <p className="flex items-center gap-2 font-bold"><LockKeyhole className="h-4 w-4" />共有コードはボックスの鍵です</p>
      <p className="mt-1">コードを知る人は内容を読み書きできます。氏名・電話番号・住所・届出情報などは登録せず、信頼できる相手だけに渡してください。紛失すると復元できません。データはAES-GCMで端末内暗号化され、最終アクセスから90日で期限切れになります。</p>
    </div>

    {status === "active" && shareCode ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 font-bold text-emerald-950"><UsersRound className="h-4 w-4" />共有ボックス接続中 · {vault.savedSearches.length}検索 · {vault.tracking.length}追跡</p><button className="app-button-secondary text-xs" type="button" onClick={() => void refreshNow()} disabled={loadVault.isPending}><RefreshCw className="h-3.5 w-3.5" />今すぐ同期</button></div>
      <div className="mt-3 flex flex-wrap gap-2"><button className="app-button-secondary text-xs" type="button" onClick={() => void shareCodeToDevice()}><Share2 className="h-3.5 w-3.5" />別端末へ共有</button><button className="app-button-secondary text-xs" type="button" onClick={() => void copyCode()}><Clipboard className="h-3.5 w-3.5" />コードをコピー</button><button className="app-button-secondary text-xs" type="button" onClick={() => setIsCodeVisible(!isCodeVisible)}>{isCodeVisible ? "コードを隠す" : "コードを表示"}</button><button className="app-button-danger text-xs" type="button" onClick={() => void revoke()} disabled={revokeVault.isPending}><Trash2 className="h-3.5 w-3.5" />失効・削除</button></div>
      {isCodeVisible && <input className="app-input mt-3 font-mono text-xs" readOnly value={shareCode} aria-label="共有コード" />}
      <p className="mt-2 text-xs text-emerald-900/80">他の端末・アカウントはこのコードを入力して復元します。変更は約15秒ごとに再読込され、同時編集の競合は上書きせず通知します。</p>
    </div> : <div className="rounded-xl border border-border p-4">
      {status === "loading" && <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />共有ボックスを確認中…</p>}
      {(status === "expired" || status === "revoked") && <p className="mb-3 text-sm text-amber-800">この共有コードは{status === "expired" ? "期限切れ" : "失効済み"}です。新しいボックスを作成してください。</p>}
      {status === "error" && <p className="mb-3 text-sm text-red-700">共有ボックスを読み込めませんでした。通信を確認して再試行してください。</p>}
      <div className="flex flex-col gap-3 sm:flex-row"><button className="app-button-primary" type="button" onClick={() => void createBox()} disabled={saveVault.isPending || status === "loading"}><Plus className="h-4 w-4" />新しい共有ボックスを作成</button><span className="self-center text-xs text-muted-foreground">または別端末から復元</span></div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className="app-input min-w-0 flex-1 font-mono text-xs" value={codeInput} onChange={event => setCodeInput(event.target.value)} placeholder="RETURN-GUEST-V1.… の共有コード" aria-label="別端末の共有コード" /><button className="app-button-secondary shrink-0" type="button" onClick={() => void restoreBox()} disabled={!codeInput.trim() || loadVault.isPending}><RefreshCw className="h-4 w-4" />この端末へ復元</button></div>
    </div>}

    {(status === "active" || status === "missing") && <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <form className="rounded-xl border border-border p-4" onSubmit={addSearch}>
          <h3 className="flex items-center gap-2 font-bold"><Search className="h-4 w-4 text-primary" />共有検索条件を追加</h3>
          <p className="mt-1 text-xs text-muted-foreground">一括確認の「共有ボックスに保存」から来た検索条件は自動入力されています。</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="app-label">条件名</span><input className="app-input" maxLength={80} value={searchForm.label} onChange={event => setSearchForm({ ...searchForm, label: event.target.value })} placeholder="例: 青い傘" /></label><label><span className="app-label">検索語</span><input className="app-input" maxLength={200} value={searchForm.query} onChange={event => setSearchForm({ ...searchForm, query: event.target.value })} placeholder="品名・色・特徴" /></label>
            <label><span className="app-label">カテゴリ</span><select className="app-input" value={searchForm.category} onChange={event => setSearchForm({ ...searchForm, category: event.target.value as ItemCategory | "" })}><option value="">すべて</option>{CATEGORY_KEYS.map(key => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}</select></label><label><span className="app-label">拾得元</span><select className="app-input" value={searchForm.facilityType} onChange={event => setSearchForm({ ...searchForm, facilityType: event.target.value as FacilityType | "" })}><option value="">すべて</option>{FACILITY_KEYS.map(key => <option key={key} value={key}>{FACILITY_LABELS[key]}</option>)}</select></label><label className="sm:col-span-2"><span className="app-label">路線・施設名（任意）</span><input className="app-input" maxLength={200} value={searchForm.route} onChange={event => setSearchForm({ ...searchForm, route: event.target.value })} /></label></div>
          <button className="app-button-primary mt-3" disabled={status !== "active" || saveVault.isPending}><Plus className="h-4 w-4" />共有条件を保存</button>
        </form>
        <section className="space-y-2"><h3 className="font-bold">共有検索条件</h3>{vault.savedSearches.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">まだ共有検索条件はありません。</p>}{vault.savedSearches.map((item: GuestSavedSearch) => <article key={item.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"><div className="min-w-0"><b>{item.label}</b><p className="mt-1 text-xs text-muted-foreground">{item.query || "すべての投稿"} {item.category ? `· ${CATEGORY_LABELS[item.category]}` : ""} {item.facilityType ? `· ${FACILITY_LABELS[item.facilityType]}` : ""} {item.route ? `· ${item.route}` : ""}</p></div><div className="flex gap-2"><button className="app-button-secondary text-xs" type="button" onClick={() => onRunSearch({ query: item.query, category: item.category, facilityType: item.facilityType, route: item.route ?? null })}>この条件で検索</button><button className="app-button-danger text-xs" type="button" onClick={() => removeSearch(item.id)}><Trash2 className="h-3.5 w-3.5" />削除</button></div></article>)}</section>
      </div>

      <div className="space-y-4">
        <form className="rounded-xl border border-border p-4" onSubmit={addTracking}>
          <h3 className="flex items-center gap-2 font-bold"><Archive className="h-4 w-4 text-primary" />共有紛失物追跡条件を追加</h3>
          <p className="mt-1 text-xs text-muted-foreground">条件は暗号化して同期されます。個人名・連絡先ではなく品物の特徴だけを登録してください。</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="app-label">品物 *</span><input className="app-input" required maxLength={160} value={trackingForm.title} onChange={event => setTrackingForm({ ...trackingForm, title: event.target.value })} /></label><label><span className="app-label">カテゴリ</span><select className="app-input" value={trackingForm.category} onChange={event => setTrackingForm({ ...trackingForm, category: event.target.value as ItemCategory })}>{CATEGORY_KEYS.map(key => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}</select></label><label className="sm:col-span-2"><span className="app-label">色・形・傷・付属品など *</span><textarea className="app-input app-textarea" required maxLength={1200} value={trackingForm.details} onChange={event => setTrackingForm({ ...trackingForm, details: event.target.value })} /></label><label><span className="app-label">紛失日時</span><input className="app-input" type="datetime-local" value={trackingForm.lostAt} onChange={event => setTrackingForm({ ...trackingForm, lostAt: event.target.value })} /></label><label><span className="app-label">エリア *</span><input className="app-input" required maxLength={200} value={trackingForm.location} onChange={event => setTrackingForm({ ...trackingForm, location: event.target.value })} /></label><label className="sm:col-span-2"><span className="app-label">路線・施設名</span><input className="app-input" maxLength={200} value={trackingForm.route} onChange={event => setTrackingForm({ ...trackingForm, route: event.target.value })} /></label></div>
          <button className="app-button-primary mt-3" disabled={status !== "active" || saveVault.isPending}><Plus className="h-4 w-4" />追跡条件を同期</button>
        </form>
        <section className="space-y-2"><h3 className="font-bold">共有追跡条件</h3>{vault.tracking.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">まだ共有追跡条件はありません。自動通知ではなく、実投稿を手動で照合できます。</p>}{vault.tracking.map((item: GuestTracking) => <article key={item.id} className="rounded-xl border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><b>{item.title}</b><p className="mt-1 text-xs text-muted-foreground">{CATEGORY_LABELS[item.category]} · {item.location} {item.route ? `· ${item.route}` : ""}</p><p className="mt-1 text-sm">{item.details}</p></div><div className="flex gap-2"><button className="app-button-secondary text-xs" type="button" onClick={() => setSelectedTrackingId(selectedTrackingId === item.id ? null : item.id)}><Search className="h-3.5 w-3.5" />実投稿と照合</button><button className="app-button-secondary text-xs" type="button" onClick={() => toggleTracking(item)}>{item.isActive ? "一時停止" : "再開"}</button><button className="app-button-danger text-xs" type="button" onClick={() => removeTracking(item.id)}><Trash2 className="h-3.5 w-3.5" />削除</button></div></div></article>)}</section>
        {activeTracking && <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-3"><h4 className="font-bold">「{activeTracking.title}」の実投稿候補</h4>{trackingCandidates.isLoading && <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />公開投稿を検索中…</p>}{trackingCandidates.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">近い実投稿はありません。公開一覧は最新状態です。</p>}<div className="mt-2 space-y-2">{trackingCandidates.data?.map((post: GuestPost) => <PostCard key={post.id} post={post} onOpen={() => setSelectedPost(post)} />)}</div><p className="mt-2 text-xs text-muted-foreground">候補は参考情報です。所有者確認や仲介を始める場合はログインが必要です。</p></section>}
      </div>
    </div>}
    <PostDetailDialog post={selectedPost} onClose={() => setSelectedPost(null)} signedIn={signedIn} onLogin={onLogin} onCaseCreated={() => onNavigate("mediation")} />
  </section>;
}
