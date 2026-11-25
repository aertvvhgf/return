import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Clock3, LoaderCircle, MessageCircle, Send, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { MapPicker } from "@/components/return/LocationAndPhoto";
import { MapView } from "@/components/Map";
import { EmptyState, SectionHeading } from "@/components/return/Primitives";
import { Dialog } from "@/components/return/Primitives";
import { HANDOVER_METHOD_LABELS, MEDIATION_STATUS, dateInputValue, dateTimeLabel } from "@/lib/return";
import { trpc } from "@/lib/trpc";
import { openChatThread } from "@/lib/chat-bus";

const caseIdFallback = "00000000-0000-4000-8000-000000000000";
function HandoverPinMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const marker = useRef<google.maps.Marker | null>(null);
  useEffect(() => {
    if (!map) return;
    const point = { lat: latitude, lng: longitude };
    if (marker.current) marker.current.setPosition(point);
    else marker.current = new google.maps.Marker({ map, position: point, title: "当事者間で合意した受け渡し位置" });
    map.panTo(point);
    return () => { marker.current?.setMap(null); marker.current = null; };
  }, [map, latitude, longitude]);
  return <div className="mt-4 rounded-xl border border-teal-100 p-3"><p className="mb-2 text-xs font-semibold text-teal-900">この正確な地図ピンは仲介参加者だけが見られます。</p><MapView className="h-52" initialCenter={{ lat: latitude, lng: longitude }} initialZoom={15} onMapReady={setMap} label="当事者間で合意した受け渡し位置" /></div>;
}
export default function MediationScreen({ userId }: { userId: number }) {
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [rewardAmount, setRewardAmount] = useState("1000");
  const [decisionNote, setDecisionNote] = useState("");
  const [handoverMethod, setHandoverMethod] = useState<"public_facility" | "police_station" | "facility_reception">("public_facility");
  const [handoverPlace, setHandoverPlace] = useState("");
  const [handoverAt, setHandoverAt] = useState("");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<"personal_information" | "harassment" | "fraud" | "unsafe_handover" | "other">("other");
  const [reportDetails, setReportDetails] = useState("");
  const [safetyReportOpen, setSafetyReportOpen] = useState(false);
  const [safetyReportCategory, setSafetyReportCategory] = useState<"personal_information" | "harassment" | "fraud" | "unsafe_handover" | "spam" | "other">("other");
  const [safetyReportDetails, setSafetyReportDetails] = useState("");
  const [confirmReportDisclosure, setConfirmReportDisclosure] = useState(false);
  const utils = trpc.useUtils();
  const list = trpc.mediation.list.useQuery(undefined, { refetchInterval: 20_000 });
  useEffect(() => { if (!selectedId && list.data?.[0]) setSelectedId(list.data[0].id); }, [selectedId, list.data]);
  const detail = trpc.mediation.detail.useQuery({ id: selectedId || caseIdFallback }, { enabled: Boolean(selectedId), refetchInterval: selectedId ? 15_000 : false });
  const refresh = async () => { await Promise.all([utils.mediation.list.invalidate(), selectedId ? utils.mediation.detail.invalidate({ id: selectedId }) : Promise.resolve(), utils.notifications.list.invalidate()]); };
  const refreshAfterBlock = async () => { await Promise.all([refresh(), utils.mediation.myBlocks.invalidate(), utils.posts.search.invalidate(), utils.posts.map.invalidate(), utils.personal.lost.matches.invalidate()]); };
  const mutationOptions = { onError: (error: { message: string }) => toast.error(error.message) };
  const sendMessage = trpc.mediation.sendMessage.useMutation({ ...mutationOptions, onSuccess: async () => { setMessage(""); await refresh(); } });
  const decide = trpc.mediation.decide.useMutation({ ...mutationOptions, onSuccess: async () => { toast.success("申請への対応を記録しました。"); setDecisionNote(""); await refresh(); } });
  const advance = trpc.mediation.advanceToHandover.useMutation({ ...mutationOptions, onSuccess: async () => { toast.success("受け渡し相談を開始しました。"); await refresh(); } });
  const propose = trpc.mediation.proposeHandover.useMutation({ ...mutationOptions, onSuccess: async () => { toast.success("受け渡し案を相手に送りました。"); setCoordinates(null); await refresh(); } });
  const accept = trpc.mediation.acceptHandover.useMutation({ ...mutationOptions, onSuccess: async () => { toast.success("同意を記録しました。"); await refresh(); } });
  const complete = trpc.mediation.confirmComplete.useMutation({ ...mutationOptions, onSuccess: async result => { toast.success(result.completed ? "双方の完了確認がそろいました。" : "完了確認を送りました。相手の確認をお待ちください。"); await refresh(); } });
  const cancel = trpc.mediation.cancel.useMutation({ ...mutationOptions, onSuccess: async () => { toast.success("案件を終了しました。"); await refresh(); } });
  const report = trpc.mediation.report.useMutation({ ...mutationOptions, onSuccess: result => { toast.success(result.notice); setReportOpen(false); setReportDetails(""); void refresh(); } });
  const submitSafetyReport = trpc.mediation.submitCaseReport.useMutation({ ...mutationOptions, onSuccess: async result => { toast.success(result.ownerNotificationAccepted ? "通報を保存し、運営者へ送信しました。確認・返信は保証されません。" : "通報は保存されましたが、運営者への通知に失敗しました。緊急時は公的機関へ直接相談してください。"); setSafetyReportOpen(false); setSafetyReportDetails(""); setConfirmReportDisclosure(false); await refresh(); } });
  const blockCounterparty = trpc.mediation.blockCounterparty.useMutation({ ...mutationOptions, onSuccess: async () => { toast.success("相手をブロックしました。新しい申請・メッセージ・受け渡し操作を停止しました。"); await refreshAfterBlock(); } });
  const rewardList = trpc.paypay.listForMediation.useQuery({ mediationId: selectedId || caseIdFallback }, { enabled: Boolean(selectedId) });
  const createReward = trpc.paypay.createRequest.useMutation({ onSuccess: async result => { toast.success(result.message); await rewardList.refetch(); }, onError: error => toast.error(error.message) });
  const agreeReward = trpc.paypay.agree.useMutation({ onSuccess: async () => { toast.success("謝礼案への同意を記録しました。"); await rewardList.refetch(); }, onError: error => toast.error(error.message) });
  const startRewardPayment = trpc.paypay.startPayment.useMutation({ onSuccess: async result => { toast.warning(result.message); await rewardList.refetch(); }, onError: error => toast.error(error.message) });
  const startChat = trpc.chat.startDm.useMutation({
    ...mutationOptions,
    onSuccess: result => { toast.success("相手とのトークを開きました。"); openChatThread(result.threadId); },
  });
  const activeCase = detail.data;
  const isOwner = activeCase?.ownerId === userId;
  const myAccepted = isOwner ? activeCase?.ownerAccepted : activeCase?.applicantAccepted;
  const canMessage = Boolean(activeCase && !activeCase.communicationBlocked && !["cancelled", "handover_completed"].includes(activeCase.status));

  useEffect(() => {
    if (activeCase?.handoverAt) setHandoverAt(dateInputValue(activeCase.handoverAt));
    if (activeCase?.handoverPlace) setHandoverPlace(activeCase.handoverPlace);
    if (activeCase?.handoverMethod) setHandoverMethod(activeCase.handoverMethod);
    if (activeCase?.handoverLatitude != null && activeCase?.handoverLongitude != null) setCoordinates({ latitude: activeCase.handoverLatitude, longitude: activeCase.handoverLongitude });
  }, [activeCase?.id, activeCase?.handoverAt, activeCase?.handoverPlace, activeCase?.handoverMethod, activeCase?.handoverLatitude, activeCase?.handoverLongitude]);

  return (
    <div>
      <SectionHeading eyebrow="当事者だけのやり取り" title="仲介管理" description="確認情報やメッセージは案件参加者だけが見られます。住所・電話番号・SNS IDを共有せず、公共の場所で安全に受け渡してください。" />
      {list.isLoading && <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" />案件を読み込み中</div>}
      {list.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">仲介案件を取得できませんでした。再読み込みしてください。</div>}
      {!list.isLoading && list.data?.length === 0 && <EmptyState title="仲介案件はありません" detail="実際の拾得投稿から所有確認を申請すると、ここに案件と進捗が表示されます。" />}
      {!!list.data?.length && <div className="grid gap-4 xl:grid-cols-[minmax(260px,.7fr)_minmax(0,1.7fr)]">
        <aside className="app-card h-fit p-3">
          <h2 className="px-2 py-2 text-sm font-bold">あなたの案件 ({list.data.length})</h2>
          <div className="space-y-1">{list.data.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${item.id === selectedId ? "border-teal-300 bg-teal-50" : "border-transparent hover:bg-muted"}`}>
            <div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-bold">{item.postTitle}</span><span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-teal-800">{MEDIATION_STATUS[item.status]}</span></div>
            <p className="mt-2 text-xs text-muted-foreground">{item.side === "owner" ? "あなたの拾得投稿" : "あなたの申請"} · 更新 {dateTimeLabel(item.updatedAt)}</p>
          </button>)}</div>
        </aside>
        <section className="min-w-0">
          {detail.isLoading && <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" />案件の詳細を読み込み中</div>}
          {activeCase && <div className="space-y-4">
            <div className="app-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">{isOwner ? "投稿者" : "申請者"}として参加</p><h2 className="mt-1 text-xl font-bold">{activeCase.post?.title ?? "拾得物投稿"}</h2><p className="mt-1 text-sm text-muted-foreground">相手の氏名・連絡先は公開せず、アプリ内で仲介します。</p></div><span className="app-badge">{MEDIATION_STATUS[activeCase.status]}</span></div>
              <div className="mt-4 grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-2"><p className="text-sm"><span className="text-xs text-muted-foreground">拾得場所（概略）</span><br /><b>{activeCase.post?.placeLabel ?? "非公開"}</b></p><p className="text-sm"><span className="text-xs text-muted-foreground">届け先・保管先</span><br /><b>{activeCase.post?.deliveredTo ?? "投稿者へアプリ内で確認"}</b></p></div>
              <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/70 p-4 text-sm leading-6"><b>申請時の所有確認情報</b><p className="mt-1 whitespace-pre-wrap">{activeCase.evidence}</p></div>
              <div className="mt-3 flex flex-wrap gap-2"><button className="app-button-secondary" disabled={startChat.isPending} onClick={() => startChat.mutate({ userId: isOwner ? activeCase.applicantId : activeCase.ownerId })}><MessageCircle className="h-4 w-4" />トークで相談する</button></div>
              {isOwner && activeCase.verificationHint && <div className="mt-3 rounded-xl border border-dashed border-teal-300 bg-white p-4 text-sm leading-6"><b>投稿者だけが見る非公開の確認メモ</b><p className="mt-1 whitespace-pre-wrap">{activeCase.verificationHint}</p><p className="mt-2 text-xs text-muted-foreground">申請者には返していません。公開情報だけでなくこの内容も参考にして、手作業で確認してください。</p></div>}
              <div className="mt-4 flex flex-wrap gap-2">{["申請確認待ち", "所有確認中", "受け渡し相談中", "受け渡し予定", "完了"].map((label, index) => { const order = ["application_pending", "verification_in_progress", "handover_discussion", "handover_scheduled", "handover_completed"]; const current = order.indexOf(activeCase.status); const done = activeCase.status === "cancelled" ? index === 0 : current >= index; return <span key={label} className={`rounded-full px-3 py-1.5 text-xs font-bold ${done ? "bg-teal-100 text-teal-900" : "bg-muted text-muted-foreground"}`}>{done ? <Check className="mr-1 inline h-3 w-3" /> : <Clock3 className="mr-1 inline h-3 w-3" />}{label}</span>; })}</div>
              {activeCase.communicationBlocked && <p role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">この相手との連絡・新しい受け渡し操作は停止中です。過去のメッセージは確認でき、通報と案件終了は利用できます。</p>}
            </div>

            {isOwner && !activeCase.communicationBlocked && activeCase.status === "application_pending" && <div className="app-card space-y-3 p-5">
              <h3 className="font-bold">所有確認申請に対応</h3><label><span className="app-label">返答メモ（追加確認やお断りの理由）</span><textarea className="app-input min-h-20" value={decisionNote} onChange={event => setDecisionNote(event.target.value)} maxLength={1200} placeholder="電話や住所を尋ねず、品物の特徴をアプリ内で確認してください。" /></label>
              <div className="flex flex-wrap gap-2"><button className="app-button-primary" disabled={decide.isPending} onClick={() => decide.mutate({ id: activeCase.id, action: "approve", note: decisionNote.trim() || "所有確認のやり取りを開始します。" })}><Check className="h-4 w-4" />承認して確認を開始</button><button className="app-button-secondary" disabled={decisionNote.trim().length < 2 || decide.isPending} onClick={() => decide.mutate({ id: activeCase.id, action: "request_more", note: decisionNote })}>追加確認を依頼</button><button className="app-button-danger" disabled={decisionNote.trim().length < 2 || decide.isPending} onClick={() => { if (window.confirm("この申請を終了しますか？理由は参加者だけに表示されます。")) decide.mutate({ id: activeCase.id, action: "reject", note: decisionNote }); }}><X className="h-4 w-4" />申請を拒否</button></div>
            </div>}
            {isOwner && !activeCase.communicationBlocked && activeCase.status === "verification_in_progress" && <div className="app-card p-5"><h3 className="font-bold">所有確認が済みましたか？</h3><p className="mt-1 text-sm text-muted-foreground">特徴を確認した後に受け渡し相談へ進めます。申請者の本人確定は自動で行いません。</p><button className="app-button-primary mt-3" onClick={() => advance.mutate({ id: activeCase.id })} disabled={advance.isPending}>受け渡し相談へ進む</button></div>}

            {!activeCase.communicationBlocked && activeCase.status === "handover_discussion" && <div className="app-card p-5">
              <h3 className="font-bold">安全な受け渡し案</h3><p className="mb-4 mt-1 text-sm text-muted-foreground">自宅や人目のない場所ではなく、公共施設・警察署/交番・施設受付を選んでください。</p>
              {activeCase.handoverAt && <div className="mb-4 rounded-xl bg-teal-50 p-3 text-sm"><b>現在の案:</b> {HANDOVER_METHOD_LABELS[activeCase.handoverMethod ?? ""] ?? "場所未設定"} · {activeCase.handoverPlace} · {dateTimeLabel(activeCase.handoverAt)}<br /><span className="text-xs">相手の同意が必要です。双方が同意すると予定が確定します。</span></div>}
              {!myAccepted && activeCase.handoverAt && activeCase.handoverPlace && <button className="app-button-primary mb-4" onClick={() => accept.mutate({ id: activeCase.id })} disabled={accept.isPending}><Check className="h-4 w-4" />この案に同意する</button>}
              <form className="space-y-3 border-t border-border pt-4" onSubmit={event => { event.preventDefault(); const at = new Date(handoverAt); if (Number.isNaN(at.getTime())) return toast.error("受け渡し日時を指定してください。"); propose.mutate({ id: activeCase.id, method: handoverMethod, place: handoverPlace, at, latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null }); }}>
                <p className="text-sm font-semibold">{activeCase.handoverAt ? "別の案を提案" : "場所と日時を提案"}</p>
                <label><span className="app-label">受け渡し場所の種類</span><select className="app-input" value={handoverMethod} onChange={event => setHandoverMethod(event.target.value as typeof handoverMethod)}>{Object.entries(HANDOVER_METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label><span className="app-label">施設名（自宅住所は入力しない）</span><input className="app-input" required minLength={2} maxLength={160} value={handoverPlace} onChange={event => setHandoverPlace(event.target.value)} placeholder="例: ○○駅の駅係員窓口" /></label>
                <label><span className="app-label">日時</span><input className="app-input" type="datetime-local" required value={handoverAt} onChange={event => setHandoverAt(event.target.value)} /></label>
                <MapPicker latitude={coordinates?.latitude} longitude={coordinates?.longitude} onChange={setCoordinates} label="任意の地図ピン（概略）" />
                <button className="app-button-secondary" disabled={propose.isPending}>受け渡し案を送る</button>
              </form>
            </div>}
            {!activeCase.communicationBlocked && activeCase.status === "handover_scheduled" && <div className="app-card border-teal-200 p-5"><h3 className="font-bold">双方が同意した受け渡し予定</h3><p className="mt-2 text-sm">{HANDOVER_METHOD_LABELS[activeCase.handoverMethod ?? ""]} · {activeCase.handoverPlace}<br />{dateTimeLabel(activeCase.handoverAt)}</p>{activeCase.handoverLatitude != null && activeCase.handoverLongitude != null && <HandoverPinMap latitude={activeCase.handoverLatitude} longitude={activeCase.handoverLongitude} />}<p className="mt-2 text-xs text-muted-foreground">受け渡しを終えたら完了確認を押してください。両者の確認後に案件が終了します。</p><p className="mt-2 text-sm">あなたの確認: {isOwner ? (activeCase.ownerCompleted ? "済" : "未") : (activeCase.applicantCompleted ? "済" : "未")} ／ 相手の確認: {isOwner ? (activeCase.applicantCompleted ? "済" : "未") : (activeCase.ownerCompleted ? "済" : "未")}</p><button className="app-button-primary mt-3" disabled={complete.isPending || (isOwner ? activeCase.ownerCompleted : activeCase.applicantCompleted)} onClick={() => complete.mutate({ id: activeCase.id })}><Check className="h-4 w-4" />受け渡し完了を確認</button></div>}

            <div className="app-card border-amber-200 bg-amber-50/50 p-5"><h3 className="font-bold">謝礼（PayPay）</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">受け渡し完了後の謝礼額を当事者間で合意できます。現在はPayPay加盟店契約・認証情報が未接続のため、外部送金は開始されません。</p><div className="mt-3 flex flex-wrap items-end gap-2"><label className="text-sm"><span className="app-label">金額（円）</span><input className="app-input w-32" type="number" min="100" max="100000" step="100" value={rewardAmount} onChange={event => setRewardAmount(event.target.value)} /></label>{!isOwner && <button className="app-button-secondary" disabled={createReward.isPending} onClick={() => createReward.mutate({ mediationId: activeCase.id, amountJpy: Number(rewardAmount) })}>謝礼案を作成</button>}</div>{rewardList.data?.map(item => <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm"><span>{item.amountJpy.toLocaleString()}円 · {item.status}</span>{item.status === "draft" && <button className="app-button-secondary px-3 py-2 text-xs" onClick={() => agreeReward.mutate({ id: item.id })}>同意する</button>}{item.status === "agreed" && !isOwner && <button className="app-button-primary px-3 py-2 text-xs" onClick={() => startRewardPayment.mutate({ id: item.id })}>PayPay支払いを開始</button>}</div>)}</div>

            <div className="app-card p-5">
              <div className="mb-3 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-bold"><MessageCircle className="h-4 w-4 text-primary" />案件内メッセージ</h3><span className="text-xs text-muted-foreground">参加者だけが閲覧</span></div>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-muted/50 p-3">{activeCase.messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">まだメッセージはありません。</p>}{activeCase.messages.map(item => <div key={item.id} className={`max-w-[92%] rounded-xl p-3 text-sm ${item.senderId === userId ? "ml-auto bg-teal-100 text-teal-950" : "bg-white"}`}><p className="whitespace-pre-wrap">{item.body}</p><p className="mt-1 text-right text-[10px] opacity-70">{dateTimeLabel(item.createdAt)}</p></div>)}</div>
              {canMessage && <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); sendMessage.mutate({ id: activeCase.id, body: message }); }}><textarea className="app-input min-h-16 flex-1" value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} placeholder="氏名・住所・電話番号・外部リンクを書かずに連絡してください。" /><button className="app-button-primary sm:self-end" disabled={sendMessage.isPending || !message.trim()}><Send className="h-4 w-4" />送信</button></form>}
              {activeCase.communicationBlocked && <p className="mt-3 text-sm text-amber-900">ブロック状態のため新しいメッセージを送信できません。</p>}
            </div>

            {activeCase.reports.length > 0 && <div className="app-card p-5"><h3 className="mb-2 font-bold">自分用の相談メモ</h3>{activeCase.reports.map(item => <p key={item.id} className="border-t border-border py-2 text-sm">{item.category}: {item.details} <span className="block text-xs text-muted-foreground">{dateTimeLabel(item.createdAt)}</span></p>)}</div>}
            <div className="flex flex-wrap gap-2"><button className="app-button-secondary" onClick={() => setReportOpen(true)}><ShieldAlert className="h-4 w-4" />自分用メモ</button><button className="app-button-secondary" onClick={() => setSafetyReportOpen(true)}><ShieldAlert className="h-4 w-4" />運営へ通報</button><button className="app-button-danger" disabled={blockCounterparty.isPending} onClick={() => { if (window.confirm("この相手をブロックしますか？新しい申請・メッセージ・受け渡し操作が止まります。通報と案件終了は可能です。")) blockCounterparty.mutate({ id: activeCase.id }); }}>自分側で相手をブロック</button>{!['cancelled', 'handover_completed'].includes(activeCase.status) && <button className="app-button-danger" disabled={cancel.isPending} onClick={() => { if (window.confirm("この案件を終了しますか？")) cancel.mutate({ id: activeCase.id }); }}><X className="h-4 w-4" />案件を終了</button>}</div>
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>「自分用メモ」はあなたのアカウント内だけに保存されます。「運営へ通報」は同意後に内容をreturnプロジェクト運営者へ送信しますが、確認・返信は保証されず、警察への通報ではありません。緊急時は公的機関へ直接相談してください。</p></div>
          </div>}
        </section>
      </div>}
      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} title="安全上の相談を記録">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!activeCase) return; report.mutate({ id: activeCase.id, category: reportCategory, details: reportDetails }); }}>
          <label><span className="app-label">相談の種類</span><select className="app-input" value={reportCategory} onChange={event => setReportCategory(event.target.value as typeof reportCategory)}><option value="personal_information">個人情報を求められた</option><option value="harassment">嫌がらせ・不適切な連絡</option><option value="fraud">詐欺の懸念</option><option value="unsafe_handover">危険な受け渡し提案</option><option value="other">その他</option></select></label>
          <label><span className="app-label">記録する内容</span><textarea className="app-input app-textarea" value={reportDetails} onChange={event => setReportDetails(event.target.value)} required minLength={5} maxLength={2000} /></label>
          <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950">この記録はあなたのアカウント内だけに保存され、相手や運営へ自動送信されません。緊急時は公的機関へ直接連絡してください。</div>
          <button className="app-button-primary" disabled={report.isPending || reportDetails.trim().length < 5}><ShieldAlert className="h-4 w-4" />相談記録を保存</button>
        </form>
      </Dialog>
      <Dialog open={safetyReportOpen} onClose={() => setSafetyReportOpen(false)} title="運営へ通報">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!activeCase || !confirmReportDisclosure) return; submitSafetyReport.mutate({ id: activeCase.id, category: safetyReportCategory, details: safetyReportDetails, confirmDisclosure: true }); }}>
          <p className="text-sm leading-6">通報内容と案件情報は保存され、returnプロジェクト運営者へ送信されます。運営者が確認・返信することは保証されません。警察等への通報ではありません。</p>
          <label><span className="app-label">通報の種類</span><select className="app-input" value={safetyReportCategory} onChange={event => setSafetyReportCategory(event.target.value as typeof safetyReportCategory)}><option value="personal_information">個人情報を求められた</option><option value="harassment">嫌がらせ・不適切な連絡</option><option value="fraud">詐欺の懸念</option><option value="unsafe_handover">危険な受け渡し提案</option><option value="spam">迷惑投稿・スパム</option><option value="other">その他</option></select></label>
          <label><span className="app-label">状況の説明</span><textarea className="app-input app-textarea" value={safetyReportDetails} onChange={event => setSafetyReportDetails(event.target.value)} required minLength={5} maxLength={2000} placeholder="事実と日時を簡潔に記載してください。パスワード、認証コード、カード番号は書かないでください。" /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmReportDisclosure} onChange={event => setConfirmReportDisclosure(event.target.checked)} className="mt-1" /><span>通報内容を保存し、returnプロジェクト運営者へ送信することに同意します。</span></label>
          <button className="app-button-primary" disabled={submitSafetyReport.isPending || !confirmReportDisclosure || safetyReportDetails.trim().length < 5}><ShieldAlert className="h-4 w-4" />運営へ通報を送信</button>
        </form>
      </Dialog>
    </div>
  );
}
