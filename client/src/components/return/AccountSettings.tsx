import { useEffect, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, type RouterOutputs } from "@/components/return/Primitives";
import { trpc } from "@/lib/trpc";

type User = Exclude<RouterOutputs["auth"]["me"], null>;
type ThemeColor = "teal" | "blue" | "purple" | "rose" | "amber" | "slate";
export type UserSettings = { maskPersonalInfo: boolean; highContrast: boolean; fontScale: "normal" | "large" | "extra-large"; reduceMotion: boolean; language: "ja" | "en" | "zh" | "ko"; themeColor: ThemeColor };
export const DEFAULT_SETTINGS: UserSettings = { maskPersonalInfo: true, highContrast: false, fontScale: "normal", reduceMotion: false, language: "ja", themeColor: "teal" };
const THEMES: { key: ThemeColor; label: string; color: string; foreground: string }[] = [
  { key: "teal", label: "緑", color: "#0f766e", foreground: "#f0fdfa" },
  { key: "blue", label: "青", color: "#2563eb", foreground: "#eff6ff" },
  { key: "purple", label: "紫", color: "#7c3aed", foreground: "#faf5ff" },
  { key: "rose", label: "ローズ", color: "#e11d48", foreground: "#fff1f2" },
  { key: "amber", label: "オレンジ", color: "#d97706", foreground: "#fffbeb" },
  { key: "slate", label: "スレート", color: "#475569", foreground: "#f8fafc" },
];

export function applySettings(settings: UserSettings) {
  const root = document.documentElement;
  root.classList.toggle("high-contrast", settings.highContrast);
  root.classList.toggle("font-large", settings.fontScale === "large");
  root.classList.toggle("font-extra-large", settings.fontScale === "extra-large");
  root.classList.toggle("reduce-motion", settings.reduceMotion);
  root.lang = settings.language;
  const theme = THEMES.find(item => item.key === settings.themeColor) ?? THEMES[0];
  root.style.setProperty("--primary", theme.color);
  root.style.setProperty("--primary-foreground", theme.foreground);
  root.style.setProperty("--ring", theme.color);
  root.style.setProperty("--sidebar-primary", theme.color);
  root.style.setProperty("--sidebar-primary-foreground", theme.foreground);
  root.dataset.fontScale = settings.fontScale;
  root.dataset.contrast = settings.highContrast ? "high" : "normal";
  root.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
}
function masked(value: string | null, mask: boolean) {
  if (!value) return "未登録";
  if (!mask) return value;
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 1)}***@${domain}`;
  }
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

export function AccountSettings({ signedIn, user, onLogin }: { signedIn: boolean; user: User | null; onLogin: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kana, setKana] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const utils = trpc.useUtils();
  const settingsQuery = trpc.personal.profile.settings.useQuery(undefined, { enabled: signedIn, refetchOnMount: "always", refetchOnWindowFocus: true });
  useEffect(() => { if (user) { setName(user.name ?? ""); setPhone(user.phone ?? ""); setKana(user.kana ?? ""); } }, [user?.id, user?.name, user?.phone, user?.kana]);
  useEffect(() => { if (!signedIn) { setSettings(DEFAULT_SETTINGS); applySettings(DEFAULT_SETTINGS); return; } if (settingsQuery.data) { const next = { ...DEFAULT_SETTINGS, ...settingsQuery.data }; setSettings(next); applySettings(next); } }, [settingsQuery.data, signedIn, user?.id]);
  const update = trpc.personal.profile.update.useMutation({
    onSuccess: async () => { applySettings(settings); await utils.auth.me.invalidate(); await utils.personal.profile.settings.invalidate(); toast.success("プロフィールと表示設定を保存しました。"); },
    onError: error => toast.error(error.message),
  });
  if (!signedIn || !user) return <div className="app-card p-6"><EmptyState title="ログインが必要です" detail="プロフィールと表示設定はアカウントに保存します。ログイン後、別デバイスでも同じ情報を利用できます。" action={<button className="app-button-primary" onClick={onLogin}>ログイン</button>} /></div>;
  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    update.mutate({ name: name.trim() || null, phone: phone.trim() || null, kana: kana.trim() || null });
  };
  const saveSettings = () => update.mutate({ settings });
  const toggle = (key: "maskPersonalInfo" | "highContrast" | "reduceMotion", value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    applySettings(next);
  };
  const setFont = (fontScale: UserSettings["fontScale"]) => {
    const next = { ...settings, fontScale };
    setSettings(next);
    applySettings(next);
  };
  const setTheme = (themeColor: ThemeColor) => {
    const next = { ...settings, themeColor };
    setSettings(next);
    applySettings(next);
  };

  return (
    <div className="space-y-5">
      <section className="app-card p-5">
        <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-bold">アカウント情報</h2><p className="text-xs text-muted-foreground">プロフィールはあなたのログインアカウントに紐づきます。</p></div></div>
        <div className="mb-4 grid gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-3"><p className="text-sm"><span className="text-xs text-muted-foreground">ログイン方法</span><br /><b>{user.loginMethod || "Manusアカウント"}</b></p><p className="text-sm"><span className="text-xs text-muted-foreground">登録メール（認証情報）</span><br /><b>{masked(user.email, settings.maskPersonalInfo)}</b></p><p className="text-sm"><span className="text-xs text-muted-foreground">プロフィールID</span><br /><b className="font-mono">{user.profileCode || "準備中"}</b></p></div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
          <label><span className="app-label">表示名（任意）</span><input className="app-input" value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="名前を表示したくない場合は空欄にできます" /></label>
          <label><span className="app-label">ふりがな（任意）</span><input className="app-input" value={kana} onChange={event => setKana(event.target.value)} maxLength={120} placeholder="ふりがな" /></label>
          <label className="sm:col-span-2"><span className="app-label">連絡先電話番号（任意・非公開）</span><input className="app-input" type="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={40} autoComplete="tel" placeholder="投稿に公開されることはありません" /></label>
          <div className="sm:col-span-2"><button className="app-button-primary" disabled={update.isPending}><Save className="h-4 w-4" />プロフィールを保存</button></div>
        </form>
      </section>
      <section className="app-card p-5">
        <div className="mb-4"><h2 className="font-bold">表示・アクセシビリティ</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">この設定はアカウントに保存され、同じアカウントの端末間で同期します。</p></div>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"><span><b className="block text-sm">個人情報をマスキング</b><span className="text-xs text-muted-foreground">画面上のメールアドレス・電話番号を一部隠します。</span></span><input type="checkbox" checked={settings.maskPersonalInfo} onChange={event => toggle("maskPersonalInfo", event.target.checked)} aria-label="個人情報をマスキング" /></label>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"><span><b className="block text-sm">高コントラスト</b><span className="text-xs text-muted-foreground">文字と境界のコントラストを高めます。</span></span><input type="checkbox" checked={settings.highContrast} onChange={event => toggle("highContrast", event.target.checked)} aria-label="高コントラスト" /></label>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3"><span><b className="block text-sm">アニメーションを減らす</b><span className="text-xs text-muted-foreground">画面の動きを抑えます。</span></span><input type="checkbox" checked={settings.reduceMotion} onChange={event => toggle("reduceMotion", event.target.checked)} aria-label="アニメーションを減らす" /></label>
          <label><span className="app-label">文字サイズ</span><select className="app-input" value={settings.fontScale} onChange={event => setFont(event.target.value as UserSettings["fontScale"])}><option value="normal">標準</option><option value="large">大きめ</option><option value="extra-large">特大</option></select></label>
          <label><span className="app-label">優先言語（設定記録）</span><select className="app-input" value={settings.language} onChange={event => { const next = { ...settings, language: event.target.value as UserSettings["language"] }; setSettings(next); applySettings(next); localStorage.setItem("return-language", next.language); window.dispatchEvent(new CustomEvent("return:language", { detail: next.language })); }}><option value="ja">日本語</option><option value="en">English</option><option value="zh">中文</option><option value="ko">한국어</option></select></label>
          <div><span className="app-label">テーマカラー</span><p className="mb-2 text-xs text-muted-foreground">緑以外の色も選べます。保存すると別の端末にも反映されます。</p><div className="flex flex-wrap gap-2">{THEMES.map(theme => <button key={theme.key} type="button" aria-label={`${theme.label}テーマ`} aria-pressed={settings.themeColor === theme.key} onClick={() => setTheme(theme.key)} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${settings.themeColor === theme.key ? "border-foreground ring-2 ring-primary/30" : "border-border"}`}><span className="h-5 w-5 rounded-full border border-white shadow-sm" style={{ backgroundColor: theme.color }} />{theme.label}</button>)}</div></div>
        </div>
        <button className="app-button-primary mt-4" onClick={saveSettings} disabled={update.isPending}><Save className="h-4 w-4" />表示設定を保存</button>
      </section>
    </div>
  );
}
