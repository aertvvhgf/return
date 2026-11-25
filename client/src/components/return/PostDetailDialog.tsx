import { useState } from "react";
import { MessageCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, type RouterOutputs } from "@/components/return/Primitives";
import { CATEGORY_LABELS, FACILITY_LABELS, dateTimeLabel } from "@/lib/return";
import { trpc } from "@/lib/trpc";
import { openChatThread } from "@/lib/chat-bus";

type SearchPost = RouterOutputs["posts"]["search"][number];
type MapPost = RouterOutputs["posts"]["map"][number];
type MatchPost = RouterOutputs["posts"]["match"]["candidates"][number];
type TrackedMatchPost = RouterOutputs["personal"]["lost"]["matches"][number];
export type PostDetail = SearchPost | MapPost | MatchPost | TrackedMatchPost;

export function PostDetailDialog({ post, onClose, signedIn, onLogin, onCaseCreated }: { post: PostDetail | null; onClose: () => void; signedIn: boolean; onLogin: () => void; onCaseCreated: () => void }) {
  const [applying, setApplying] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<"personal_information" | "harassment" | "fraud" | "unsafe_handover" | "spam" | "other">("other");
  const [reportDetails, setReportDetails] = useState("");
  const [confirmDisclosure, setConfirmDisclosure] = useState(false);
  const utils = trpc.useUtils();
  const startCase = trpc.mediation.start.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.mediation.list.invalidate(), utils.notifications.list.invalidate(), utils.posts.search.invalidate(), utils.posts.map.invalidate()]);
      toast.success("仲介申請を送信しました。投稿者の返答をお待ちください。");
      setApplying(false);
      setEvidence("");
      onClose();
      onCaseCreated();
    },
    onError: error => toast.error(error.message),
  });
  const startChat = trpc.chat.startWithPost.useMutation({
    onSuccess: result => {
      toast.success("投稿者とのトークを開きました。");
      setApplying(false);
      onClose();
      openChatThread(result.threadId);
    },
    onError: error => toast.error(error.message),
  });
  const submitReport = trpc.mediation.submitPostReport.useMutation({
    onSuccess: async result => {
      toast.success(result.ownerNotificationAccepted ? "通報を保存し、運営者へ送信しました。確認・返信は保証されません。" : "通報は保存されましたが、運営者への通知に失敗しました。緊急時は公的機関へ直接相談してください。");
      setReportOpen(false);
      setReportDetails("");
      setConfirmDisclosure(false);
      await Promise.all([utils.posts.search.invalidate(), utils.posts.map.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  if (!post) return null;
  return (
    <>
    <Dialog open={Boolean(post)} onClose={() => { setApplying(false); onClose(); }} title={applying ? "安全な仲介を申請" : post.title} wide>
      {!applying ? <div className="space-y-4">
        {post.imageUrl && <img src={post.imageUrl} alt={`${post.title}の品物写真`} className="max-h-72 w-full rounded-xl bg-muted object-contain" />}
        <div className="flex flex-wrap gap-2"><span className="app-badge">{CATEGORY_LABELS[post.category]}</span><span className="app-badge">{FACILITY_LABELS[post.facilityType]}</span></div>
        <div className="grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-2">
          <p><span className="text-xs text-muted-foreground">拾得日時</span><br /><b>{dateTimeLabel(post.foundAt)}</b></p>
          <p><span className="text-xs text-muted-foreground">色・形</span><br /><b>{post.color}・{post.shape}</b></p>
          <p><span className="text-xs text-muted-foreground">拾得場所（概略）</span><br /><b>{post.placeLabel}</b></p>
          <p><span className="text-xs text-muted-foreground">届け先・保管先</span><br /><b>{post.deliveredTo}</b></p>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-7">{post.description}</p>
        <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4 text-sm leading-6 text-teal-950"><ShieldCheck className="mr-2 inline h-4 w-4" />所有者だけが知る傷・付属品・購入時期などを申請時に記入してください。正確な個人情報を公開せず、投稿者とはアプリ内でやり取りできます。</div>
        {post.isMine ? <p className="text-sm text-muted-foreground">これはあなたの投稿です。マイページから編集・削除できます。</p> : <div className="flex flex-col gap-2 sm:flex-row"><button className="app-button-primary flex-1" onClick={() => signedIn ? setApplying(true) : onLogin()}><ShieldCheck className="h-4 w-4" />所有確認を申請</button><button className="app-button-secondary" disabled={startChat.isPending} onClick={() => signedIn ? startChat.mutate({ postId: post.id }) : onLogin()}><MessageCircle className="h-4 w-4" />トークで質問</button><button className="app-button-secondary" onClick={() => signedIn ? setReportOpen(true) : onLogin()}><ShieldAlert className="h-4 w-4" />運営へ通報</button></div>}
      </div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); startCase.mutate({ postId: post.id, evidence }); }}>
        <div className="rounded-xl bg-muted/70 p-4 text-sm leading-6"><b>{post.title}</b>への申請です。氏名・住所・電話番号・カード番号などは記載しないでください。</div>
        <label><span className="app-label">所有者本人と分かる特徴 <span className="text-red-600">必須</span></span><textarea className="app-input app-textarea" value={evidence} onChange={event => setEvidence(event.target.value)} minLength={10} maxLength={2000} required placeholder="例: 表面右下の傷、内側の小さなシール、ケースに入っていた物など" /></label>
        <p className="text-xs leading-5 text-muted-foreground">確認情報は投稿者と申請者だけに共有されます。自動判定で持ち主を決めるものではありません。</p>
        <div className="flex justify-end gap-2"><button type="button" className="app-button-secondary" onClick={() => setApplying(false)}>戻る</button><button className="app-button-primary" disabled={startCase.isPending || evidence.trim().length < 10}>{startCase.isPending ? "送信中…" : "安全な仲介を申請"}</button></div>
      </form>}
    </Dialog>
    <Dialog open={reportOpen} onClose={() => setReportOpen(false)} title="拾得投稿を運営へ通報">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!post || !confirmDisclosure) return; submitReport.mutate({ postId: post.id, category: reportCategory, details: reportDetails, confirmDisclosure: true }); }}>
        <p className="text-sm leading-6">通報内容と投稿情報は保存され、returnプロジェクト運営者へ送信されます。確認・返信は保証されず、警察等への通報ではありません。</p>
        <label><span className="app-label">通報の種類</span><select className="app-input" value={reportCategory} onChange={event => setReportCategory(event.target.value as typeof reportCategory)}><option value="personal_information">個人情報の掲載</option><option value="harassment">嫌がらせ・不適切な内容</option><option value="fraud">詐欺の懸念</option><option value="unsafe_handover">危険な受け渡し提案</option><option value="spam">迷惑投稿・スパム</option><option value="other">その他</option></select></label>
        <label><span className="app-label">状況の説明</span><textarea className="app-input app-textarea" required minLength={5} maxLength={2000} value={reportDetails} onChange={event => setReportDetails(event.target.value)} placeholder="事実と日時を簡潔に記載してください。パスワード、認証コード、カード番号は書かないでください。" /></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmDisclosure} onChange={event => setConfirmDisclosure(event.target.checked)} /><span>通報内容を保存し、returnプロジェクト運営者へ送信することに同意します。</span></label>
        <button className="app-button-primary" disabled={submitReport.isPending || !confirmDisclosure || reportDetails.trim().length < 5}><ShieldAlert className="h-4 w-4" />運営へ通報を送信</button>
      </form>
    </Dialog>
    </>
  );
}
