export const CATEGORY_KEYS = ["wallet", "device", "keys", "daily", "bag", "clothing", "documents", "other"] as const;
export type ItemCategory = (typeof CATEGORY_KEYS)[number];
export const FACILITY_KEYS = ["rail", "police", "bus", "commercial", "community", "other"] as const;
export type FacilityType = (typeof FACILITY_KEYS)[number];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  wallet: "財布・カード類",
  device: "スマートフォン・電子機器",
  keys: "鍵・キーケース",
  daily: "身の回り品・傘",
  bag: "バッグ・ポーチ",
  clothing: "衣類・帽子",
  documents: "書類・貴重品",
  other: "その他",
};
export const FACILITY_LABELS: Record<FacilityType, string> = {
  rail: "鉄道・駅",
  police: "警察署・交番",
  bus: "バス",
  commercial: "商業施設",
  community: "利用者投稿",
  other: "その他",
};
export const MEDIATION_STATUS: Record<string, string> = {
  application_pending: "申請確認待ち",
  verification_in_progress: "所有確認中",
  handover_discussion: "受け渡し相談中",
  handover_scheduled: "受け渡し予定",
  handover_completed: "受け渡し完了",
  cancelled: "終了",
  operator_consultation: "相談記録あり",
};
export const HANDOVER_METHOD_LABELS: Record<string, string> = {
  public_facility: "公共施設",
  police_station: "警察署・交番",
  facility_reception: "施設受付",
};

export function dateTimeLabel(value: Date | string | null | undefined) {
  if (!value) return "日時未設定";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "日時未設定";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function dateInputValue(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalDate(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function postCategoryIcon(category: string) {
  return CATEGORY_LABELS[category as ItemCategory] ?? "拾得物";
}
