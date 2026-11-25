import { useEffect } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { CATEGORY_LABELS, FACILITY_LABELS, dateTimeLabel } from "@/lib/return";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type PublicPost = RouterOutputs["posts"]["search"][number];
export type MapPost = RouterOutputs["posts"]["map"][number];
export type MatchPost = RouterOutputs["posts"]["match"]["candidates"][number];
export type TrackedMatchPost = RouterOutputs["personal"]["lost"]["matches"][number];
export type OwnedPost = RouterOutputs["posts"]["mine"][number];

export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-slate-950/50 p-0 sm:items-center sm:p-5" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="return-dialog-title" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} className={`isolate max-h-[92dvh] min-w-0 w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-2xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:p-7 ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="return-dialog-title" className="text-xl font-bold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white/70 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary"><ArrowUpRight className="h-5 w-5" /></div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{detail}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PostCard({ post, onOpen, score, matchedFeatures }: { post: PublicPost | MapPost | MatchPost | TrackedMatchPost | OwnedPost; onOpen: () => void; score?: number; matchedFeatures?: string[] }) {
  const category = CATEGORY_LABELS[post.category] ?? "その他";
  const facility = FACILITY_LABELS[post.facilityType] ?? "利用者投稿";
  return (
    <article className="app-card overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      {post.imageUrl && <img src={post.imageUrl} alt={`${post.title}の拾得物写真`} loading="lazy" className="h-44 w-full bg-muted object-cover" />}
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="app-badge">{category}</span>
          <span className="text-xs text-muted-foreground">{facility}</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold">{post.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{post.color}・{post.shape}</p>
          </div>
          {score !== undefined && <span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-sm font-bold text-teal-800">一致度 {score}%</span>}
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{post.description}</p>
        {matchedFeatures?.length ? <p className="mt-2 text-xs font-semibold text-teal-800">似ている特徴: {matchedFeatures.join("・")}</p> : null}
        <div className="mt-4 grid gap-1 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-2">
          <span>拾得: {dateTimeLabel(post.foundAt)}</span>
          {post.storageUntil && <span>保管期限: {dateTimeLabel(post.storageUntil)}</span>}
          <span>場所: {post.placeLabel}</span>
          <span className="sm:col-span-2">届け先: {post.deliveredTo}</span>
        </div>
        <button type="button" onClick={onOpen} className="mt-4 w-full rounded-lg border border-border px-3 py-2.5 text-sm font-bold text-foreground transition hover:bg-accent">詳細・安全な仲介を確認</button>
      </div>
    </article>
  );
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[.12em] text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
