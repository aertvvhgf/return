const streetAddressSuffix = String.raw`[0-9０-９]{1,4}(?:丁目[0-9０-９]{1,4}(?:番(?:地|[0-9０-９]{1,4}号?)?|(?:[-－−ー][0-9０-９]{1,4}){1,2})|番(?:地|[0-9０-９]{1,4}号?)|号室|(?:[-－−ー][0-9０-９]{1,4}){2})`;
const municipalityAddressPattern = new RegExp(String.raw`(?:北海道|東京都|京都府|大阪府|[一-龯々]{2,3}県|[一-龯々ぁ-んァ-ヶー]+(?:市|区|町|村))[^、。\n]{0,24}${streetAddressSuffix}`, "u");
const detailedAddressPattern = new RegExp(streetAddressSuffix, "i");
const personNamePattern = /[一-龯々]{2,6}(?:さん|様|氏)/u;
const isoDatePattern = /\b(?:19|20)[0-9]{2}[-－−ー][0-9]{1,2}[-－−ー][0-9]{1,2}\b/g;

const sensitivePatterns = [
  { label: "メールアドレス", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { label: "外部URL", pattern: /(?:https?:\/\/|www\.)\S+/i },
  { label: "電話番号", pattern: /(?:\+?81[-ー－ ]?)?0[0-9０-９]{1,4}[-ー－ ()]?\s*[0-9０-９]{1,4}[-ー－ ]?\s*[0-9０-９]{3,4}/i },
  { label: "郵便番号", pattern: /(?:〒\s*)?[0-9０-９]{3}[-ー－−][0-9０-９]{4}/i },
  { label: "長い番号/カード番号", pattern: /(?:^|[^0-9０-９])(?:[0-9０-９][ -]?){12,19}(?:$|[^0-9０-９])/ },
  { label: "SNSアカウントID", pattern: /@[A-Z0-9_.-]{3,32}\b/i },
  { label: "SNSアカウントID", pattern: /(?:LINE|Instagram|Twitter|Facebook|WhatsApp|WeChat|SNS)\s*(?:ID|アカウント|ユーザー名)\s*[:：=]\s*[A-Z0-9_.-]{3,32}/i },
  { label: "住所・居住情報", pattern: /(?:自宅|個人宅|住所\s*(?:[:：]|は|が)|部屋番号|号室)/i },
  { label: "詳細住所", pattern: municipalityAddressPattern },
  { label: "詳細住所", pattern: detailedAddressPattern },
  { label: "氏名らしき表記", pattern: personNamePattern },
] as const;

function global(pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

export function findSensitiveInformation(value: string): string[] {
  const withoutDates = value.replace(isoDatePattern, "日付");
  return [...new Set(sensitivePatterns.filter(({ label, pattern }) =>
    pattern.test(label === "詳細住所" && pattern === detailedAddressPattern ? withoutDates : value)
  ).map(({ label }) => label))];
}

export function redactSensitiveInformation(value: string): string {
  let safe = value;
  // Remove a labelled address together with the value following it, not just the word "住所".
  safe = safe.replace(/(?:自宅(?:住所)?|個人宅|住所\s*(?:[:：]|は|が)\s*)[^、。\n]{0,60}/giu, "[住所省略]");
  // Remove a known locality plus street number before the general numeric-address rule runs.
  safe = safe.replace(global(municipalityAddressPattern), "[住所省略]");
  const dates: string[] = [];
  safe = safe.replace(isoDatePattern, date => {
    const token = `SAFE_ISO_DATE_${dates.length}_TOKEN`;
    dates.push(date);
    return token;
  });
  const replacements = sensitivePatterns.map(({ label, pattern }) => ({
    pattern,
    replacement: label === "詳細住所" || label === "住所・居住情報" ? "[住所省略]" : label === "氏名らしき表記" ? "[氏名省略]" : `[${label}省略]`,
  }));
  for (const { pattern, replacement } of replacements) {
    if (pattern === municipalityAddressPattern) continue;
    safe = safe.replace(global(pattern), replacement);
  }
  dates.forEach((date, index) => { safe = safe.replace(`SAFE_ISO_DATE_${index}_TOKEN`, date); });
  return safe;
}
