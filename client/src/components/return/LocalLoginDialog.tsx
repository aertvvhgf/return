import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function LocalLoginDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); toast.success("ログインしました。"); onClose(); onSuccess(); }, onError: error => toast.error(error.message) });
  const register = trpc.auth.register.useMutation({ onSuccess: async () => { await utils.auth.me.invalidate(); toast.success("アカウントを作成しました。"); onClose(); onSuccess(); }, onError: error => toast.error(error.message) });
  if (!open) return null;
  const pending = login.isPending || register.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "login") login.mutate({ email, password });
    else register.mutate({ name, email, password });
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="ログイン">
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-teal-700">return account</p><h2 className="mt-2 text-2xl font-extrabold text-slate-900">{mode === "login" ? "ログイン" : "アカウントを作成"}</h2><p className="mt-1 text-sm text-slate-500">投稿・トーク・仲介を安全に保存します。</p></div><button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="閉じる"><X className="h-5 w-5" /></button></div>
      <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-bold"><button className={`rounded-lg py-2 ${mode === "login" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("login")}>ログイン</button><button className={`rounded-lg py-2 ${mode === "register" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("register")}>新規登録</button></div>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        {mode === "register" && <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">表示名</span><span className="relative block"><UserRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="app-input w-full pl-10" value={name} onChange={e => setName(e.target.value)} placeholder="例: 山田 花子" maxLength={80} required /></span></label>}
        <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">メールアドレスまたは紹介用アカウント名</span><span className="relative block"><Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="app-input w-full pl-10" type={mode === "login" ? "text" : "email"} value={email} onChange={e => setEmail(e.target.value)} placeholder={mode === "login" ? "you@example.com / テストアカウント" : "you@example.com"} autoComplete="email" required /></span></label>
        <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">パスワード</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="app-input w-full pl-10 pr-10" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "login" ? "8文字以上 / 紹介用は1111" : "8文字以上"} minLength={mode === "login" ? 4 : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /><button type="button" className="absolute right-2 top-2 rounded-lg p-1 text-slate-400" onClick={() => setShowPassword(value => !value)} aria-label="パスワードを表示"><span className="sr-only">パスワード表示切替</span>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
        {mode === "register" && <p className="text-xs leading-5 text-slate-500">パスワードは暗号学的ハッシュで保存し、画面には保存しません。</p>}
        {mode === "login" && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">紹介用アカウントは誰でも利用できます。ここで作成・変更した投稿や設定は、同じ紹介用アカウントを使う人にも表示されます。</p>}
        <button className="app-button-primary w-full justify-center py-3" disabled={pending}>{pending ? "処理中…" : mode === "login" ? "ログインする" : "登録してログイン"}</button>
      </form>
    </div>
  </div>;
}
