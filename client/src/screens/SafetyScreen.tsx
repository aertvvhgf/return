import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, LockKeyhole, Shield, ShieldCheck, TrainFront, Building2, Bus, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { AccountSettings } from "@/components/return/AccountSettings";
import { SectionHeading, type RouterOutputs } from "@/components/return/Primitives";

type User = RouterOutputs["auth"]["me"];
const connectors = [
  { label: "警察の遺失物情報", icon: ShieldCheck, purpose: "公式の遺失物照会", note: "公的データベースへの照会・届出送信は未接続です。" },
  { label: "鉄道・駅係員", icon: TrainFront, purpose: "鉄道会社の拾得物情報", note: "鉄道事業者の外部APIとは連携していません。" },
  { label: "バス会社", icon: Bus, purpose: "路線・営業所への照会", note: "バス会社の外部APIとは連携していません。" },
  { label: "商業施設・施設窓口", icon: Building2, purpose: "施設への照会", note: "施設管理システムとは連携していません。" },
  { label: "LINE通知", icon: MessageCircle, purpose: "外部メッセージ配信", note: "LINEアカウントとの接続は未設定です。" },
];
export default function SafetyScreen({ user, signedIn, onLogin }: { user: User; signedIn: boolean; onLogin: () => void }) {
  const [checkedConnector, setCheckedConnector] = useState("");
  return <div>
    <SectionHeading eyebrow="安全と外部サービス" title="安全・連携センター" description="外部の警察・交通事業者・施設への連携状況と、個人情報を守るための運用を確認できます。" />
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><AlertTriangle className="mt-1 h-5 w-5 shrink-0" /><p><b>重要:</b> 現在、警察・交通事業者・施設への照会、届出、送信は未接続です。正式な手続きは各窓口・公式サイトで行ってください。</p></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{connectors.map(item => <article key={item.label} className="app-card p-5"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary"><item.icon className="h-5 w-5" /></div><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">未接続</span></div><h2 className="mt-4 font-bold">{item.label}</h2><p className="mt-1 text-sm text-muted-foreground">{item.purpose}</p><p className="mt-3 text-xs leading-5 text-muted-foreground">{item.note}</p><button className="app-button-secondary mt-4 w-full text-sm" onClick={() => { setCheckedConnector(item.label); toast.message(`${item.label}: 現在は未接続です。外部へ接続・送信していません。`); }}><ExternalLink className="h-4 w-4" />接続状態を確認</button></article>)}</div>
    {checkedConnector && <p role="status" className="mt-3 text-xs text-muted-foreground">確認した連携: {checkedConnector}（未接続・外部通信なし）</p>}
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <section className="app-card p-5"><h2 className="flex items-center gap-2 font-bold"><LockKeyhole className="h-5 w-5 text-primary" />個人情報の扱い</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground"><li>拾得投稿の公開位置は約1km単位に丸めます。</li><li>電話番号・メール・住所を投稿説明や案件内メッセージに書かないでください。氏名検出も限定的で、個人名を避けてください。メッセージは連絡先・URLを含む送信をブロックします。</li><li>所有確認に必要な特徴は仲介参加者だけで共有し、拾得投稿者の非公開メモや連絡先は検索結果に返しません。</li><li>投稿写真は端末内で撮影メタデータを除去し、AI確認と公開への同意後、AI審査通過時だけ保存します。審査は誤る可能性があります。Google Cloud VisionおよびWeb上の一致画像検索は未接続です。</li><li>投稿を削除すると公開一覧からは外れますが、Storageの画像ファイル自体はアプリから物理削除できず、残る場合があります。</li></ul></section>
      <section className="app-card p-5"><h2 className="flex items-center gap-2 font-bold"><Shield className="h-5 w-5 text-primary" />安全な受け渡し</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground"><li>受け渡しは公共施設、警察署・交番、施設受付を選び、双方の同意を得てください。</li><li>自宅・人目のない場所への誘導には応じず、不安があれば案件を中止して相談記録を保存してください。</li><li>相談記録は作成した本人だけが後から閲覧でき、相手・運営・警察へ自動送信されません。危険・緊急時は公的機関へ直接相談してください。</li><li>AI一致度は候補提示の目安であり、持ち主の自動認定や本人確認ではありません。拾得投稿写真のAI確認にはManus AIを使用し、Google Cloud VisionやWeb上の一致画像検索は未接続です。</li></ul></section>
    </div>
    <div className="mt-6"><h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><CheckCircle2 className="h-5 w-5 text-primary" />あなたのプライバシー設定</h2><AccountSettings signedIn={signedIn} user={user} onLogin={onLogin} /></div>
  </div>;
}
