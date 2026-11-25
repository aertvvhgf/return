import { BellRing, LoaderCircle, Languages } from "lucide-react";
import { toast } from "sonner";
import React from "react";
import { EmptyState } from "@/components/return/Primitives";
import { trpc } from "@/lib/trpc";

export function NotificationSettingsPanel() {
  const utils = trpc.useUtils();
  const preferences = trpc.notifications.preferences.useQuery();
  const update = trpc.notifications.setPreference.useMutation({ onSuccess: async () => { await utils.notifications.preferences.invalidate(); toast.success("通知設定を保存しました。"); }, onError: error => toast.error(error.message) });
  const [language, setLanguage] = React.useState(localStorage.getItem("return-language") || "ja");
  const setLanguageValue = (value: string) => { setLanguage(value); localStorage.setItem("return-language", value); window.dispatchEvent(new CustomEvent("return:language", { detail: value })); toast.success("表示言語を変更しました。次の画面から反映されます。"); };
  const enableBrowser = async () => { if (!("Notification" in window)) return toast.error("この端末はブラウザ通知に対応していません。"); const result = await Notification.requestPermission(); toast[result === "granted" ? "success" : "error"](result === "granted" ? "ブラウザ通知を許可しました。" : "通知は許可されませんでした。"); };
  return <section className="app-card p-5">
    <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary"><BellRing className="h-5 w-5" /></div><div><h2 className="font-bold">通知の受け取り設定</h2><p className="text-xs text-muted-foreground">設定と通知履歴はアカウントに保存されます。</p></div></div>
    {preferences.isLoading && <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />設定を読み込み中</p>}
    {preferences.isError && <EmptyState title="設定を読み込めません" detail="通信状態を確認して再読み込みしてください。" />}
    <div className="space-y-2">{preferences.data?.map(item => <label key={item.kind} className="flex items-center justify-between gap-4 rounded-xl border border-border px-3 py-3"><span><b className="text-sm">{item.label}</b><span className="mt-0.5 block text-xs text-muted-foreground">{item.kind === "match" ? "紛失追跡に近い新しい拾得投稿" : "仲介案件に関するアプリ内通知"}</span></span><input type="checkbox" checked={item.enabled} disabled={update.isPending} onChange={event => update.mutate({ kind: item.kind, enabled: event.target.checked })} aria-label={`${item.label}の通知`} /></label>)}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-3"><div className="flex items-center gap-2 text-sm font-bold"><Languages className="h-4 w-4" />表示言語</div><select className="mt-2 w-full rounded-lg border border-border bg-white px-2 py-2 text-sm" value={language} onChange={event => setLanguageValue(event.target.value)}><option value="ja">日本語</option><option value="en">English</option><option value="zh">简体中文</option><option value="ko">한국어</option></select></div><div className="rounded-xl border border-border p-3"><b className="text-sm">ブラウザ通知</b><p className="mt-1 text-xs text-muted-foreground">新着メッセージを端末通知で受け取ります。</p><button className="app-button-secondary mt-2 px-3 py-2 text-xs" onClick={() => void enableBrowser()}>通知を許可</button></div></div><p className="mt-4 text-xs leading-5 text-muted-foreground">アプリ内通知はいつでも確認できます。ブラウザ通知は許可した端末で利用できます。</p>
  </section>;
}
