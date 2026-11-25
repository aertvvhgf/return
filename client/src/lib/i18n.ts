import { useEffect, useState } from "react";
import { detailedTranslations } from "@/lib/ui-translations";

export type AppLanguage = "ja" | "en" | "zh" | "ko";

type TranslationMap = Record<string, string>;

const common: Record<AppLanguage, TranslationMap> = {
  ja: {},
  en: {
    ...detailedTranslations.en,
    "一括確認": "Search", "AI Search": "AI Search", "拾得マップ": "Found Map", "トーク": "Chats", "遺失届": "Lost Report", "仲介管理": "Mediation", "マイページ": "My Page", "安全・連携": "Safety",
    "実投稿をまとめて検索": "Search real user posts", "紛失物の候補照合": "Match possible lost items", "位置から探す": "Find by location", "拾得者・持ち主とやり取り": "Message finders and owners", "届出用情報を作成": "Create a lost report", "案件の確認と安全な受渡し": "Manage cases and safe handover", "プロフィール・保存データ": "Profile and saved data", "安全設定・外部連携状態": "Safety settings and integrations",
    "見つける": "Find", "公開検索・ゲスト利用": "Public search · Guest access", "アカウントと同期中": "Synced with your account", "検索と手続き": "Search and procedures", "拾得物を投稿": "Post a found item", "安全な仲介のために": "For safe handover", "安全の案内を見る": "View safety guidance", "ログイン": "Log in", "ログアウト": "Log out", "ログインして続ける": "Continue with login", "投稿": "Post", "表示言語": "Language", "メニュー": "Menu", "メニューを閉じる": "Close menu",
    "品名・色・特徴・場所で検索": "Search by item, color, features, or place", "例: 黒い財布、青い傘、○○駅": "e.g. black wallet, blue umbrella, station", "検索": "Search", "よく使う検索:": "Popular searches:", "カテゴリ": "Category", "拾得元": "Found at", "すべて": "All", "路線・施設名": "Line or facility", "並び替え": "Sort", "関連度順": "Relevance", "新しい順": "Newest", "古い順": "Oldest", "地図で見る": "View map", "個人用に保存": "Save privately", "共有ボックスへ保存": "Save to shared box", "現在地": "My location", "0件": "0 results", "地図に投稿がありません": "No posts on the map", "地図情報を読み込めません。通信状態を確認して再読み込みしてください。": "Could not load map data. Check your connection and try again.", "再試行": "Retry", "投稿を読み込み中": "Loading posts…", "投稿を確認中…": "Checking posts…", "まだ拾得投稿がありません": "No found-item posts yet", "該当する投稿はありません": "No matching posts", "ログインして投稿する": "Log in to post", "拾得物を投稿する": "Post a found item",
    "閉じる": "Close", "選択した投稿": "Selected post", "詳細・安全な仲介を確認": "View details and safe handover", "一致度": "Match", "似ている特徴:": "Similar features:", "拾得:": "Found:", "保管期限:": "Storage deadline:", "場所:": "Place:", "届け先:": "Delivered to:", "その他": "Other", "日時未設定": "Date not set", "拾得物": "Found item", "利用者投稿": "User post", "公共施設": "Public facility", "警察署・交番": "Police station", "施設受付": "Facility reception", "鉄道・駅": "Railway / station", "バス": "Bus", "商業施設": "Commercial facility", "安全の案内": "Safety guidance", "財布・カード類": "Wallets and cards", "スマートフォン・電子機器": "Phones and electronics", "鍵・キーケース": "Keys and key cases", "身の回り品・傘": "Personal items and umbrellas", "バッグ・ポーチ": "Bags and pouches", "衣類・帽子": "Clothing and hats", "書類・貴重品": "Documents and valuables", "すべてのカテゴリ": "All categories", "すべての拾得元": "All found-at locations", "0件の公開投稿": "0 public posts", "利用者が実際に投稿した拾得物を、品名・特徴・場所から探せます。警察・交通事業者のデータはこの一覧に混ぜていません。": "Search found items posted by users by name, features, and place. Police and transit-operator data is not included.", "この一覧には実際に利用者が登録した投稿だけを表示します。架空のサンプル投稿はありません。": "This list contains only real user posts. No fictional sample posts are included.", "公開位置はおよそ1km単位にぼかして表示します。正確な受け渡し場所は、仲介中の当事者だけで確認してください。": "Public locations are blurred to about a 1 km area. Confirm the exact handover place only with the parties in mediation.", "地図上の投稿を読み込み中": "Loading map posts", "拾得物の概略位置マップ": "Approximate found-item map", "return · なくし物を探す人と拾得者をつなぐサービス": "return · connecting people who lost and found items", "警察・交通事業者など外部機関の照会・提出は未接続です。手続きは各公式窓口でご確認ください。": "External police and transit inquiries and submissions are not connected. Please use official channels.",
    "一括確認 | return": "Search | return", "拾得マップ | return": "Found Map | return", "AI Search | return": "AI Search | return", "路線・施設名（任意）": "Line or facility (optional)", "紛失した日時（任意）": "Lost date and time (optional)", "参考写真（任意・10MiB以下）": "Reference photo (optional, up to 10 MiB)", "写真で気づいた": "Details noticed in the photo", "ログインしてManus AI照合と追跡保存を利用": "Log in to use Manus AI matching and save tracking", "照合候補": "Match candidates", "画像本体を送信する場合は端末内で縮小・メタデータ除去し、サーバーでもJPEGメタデータを除去します。このアプリのDB/Storageには保存しません。サーバー側でも氏名らしい表現・連絡先・郵便番号・詳細住所・SNS ID・長い番号らしい文字列を可能な範囲で伏せますが、検出は完全ではありません。氏名、電話番号、メール、カード番号、住所、SNS IDは入力しないでください。AIに接続できない時はAIなし類似度計算に切り替えます。スコアは目安で、所有者を証明するものではありません。": "If you send the original image, it is resized and stripped of metadata on your device, and JPEG metadata is also removed on the server. It is not saved to this app's database or storage. The server attempts to mask names, contact details, postal codes, detailed addresses, social IDs, and long numbers, but detection is not perfect. Do not enter names, phone numbers, email addresses, card numbers, addresses, or social IDs. If AI is unavailable, similarity matching without AI is used. Scores are only a guide and do not prove ownership.", "写真は端末内で平均色・明るさを計算します。画像全体を送るのは、ログイン中に上の同意をオンにした場合だけです。原写真のEXIF等を含むメタデータは除去し、このアプリのDB/Storageへは保存しません。個人情報の写り込んだ写真は選ばないでください。": "The photo's average color and brightness are calculated on your device. The full image is sent only when you are signed in and enable the consent above. Metadata such as EXIF is removed, and the original is not saved to this app's database or storage. Do not choose photos containing personal information.", "警察・鉄道・バス会社の外部データ照会はまだ接続していません。安全・連携センターでデモ状態を確認できます。": "External police, railway, and bus-company data is not connected yet. Check the demo status in Safety.", "公開投稿に住所・電話番号を書かず、受け渡しは人目のある場所で。": "Do not post addresses or phone numbers publicly. Meet in a public place.", "ログアウトしますか？": "Log out?", "ログアウトしました。": "You have been logged out.", "ログアウトできませんでした。もう一度お試しください。": "Could not log out. Please try again.",
  },
  zh: {
    ...detailedTranslations.zh,
    "一括確認": "搜索", "AI Search": "AI Search", "拾得マップ": "拾得地图", "トーク": "聊天", "遺失届": "遗失申报", "仲介管理": "协助交接", "マイページ": "我的页面", "安全・連携": "安全与连接", "実投稿をまとめて検索": "搜索真实发布", "紛失物の候補照合": "匹配可能的遗失物", "位置から探す": "按位置查找", "拾得者・持ち主とやり取り": "联系拾得者和失主", "届出用情報を作成": "创建遗失申报", "案件の確認と安全な受渡し": "管理案件并安全交接", "プロフィール・保存データ": "个人资料和保存数据", "安全設定・外部連携状態": "安全设置和外部连接", "見つける": "查找", "ログイン": "登录", "ログアウト": "退出登录", "拾得物を投稿": "发布拾得物", "検索": "搜索", "カテゴリ": "类别", "拾得元": "拾得地点", "すべて": "全部", "現在地": "当前位置", "地図で見る": "查看地图", "閉じる": "关闭", "その他": "其他", "利用者投稿": "用户发布", "鉄道・駅": "铁路/车站", "警察署・交番": "警察局/派出所", "バス": "公交车", "商業施設": "商业设施", "日時未設定": "未设置日期", "地図に投稿がありません": "地图上没有发布", "再試行": "重试", "投稿を読み込み中": "正在加载发布", "まだ拾得投稿がありません": "暂无拾得物发布", "詳細・安全な仲介を確認": "查看详情和安全交接", "公開検索・ゲスト利用": "公开搜索 · 访客使用", "表示言語": "语言",
  },
  ko: {
    ...detailedTranslations.ko,
    "一括確認": "검색", "AI Search": "AI Search", "拾得マップ": "습득물 지도", "トーク": "채팅", "遺失届": "분실 신고", "仲介管理": "중개 관리", "マイページ": "마이페이지", "安全・連携": "안전·연결", "実投稿をまとめて検索": "실제 게시물 검색", "紛失物の候補照合": "분실물 후보 매칭", "位置から探す": "위치로 찾기", "拾得者・持ち主とやり取り": "습득자·주인과 연락", "届出用情報を作成": "분실 신고 작성", "案件の確認と安全な受渡し": "사건 및 안전한 전달 관리", "プロフィール・保存データ": "프로필·저장 데이터", "安全設定・外部連携状態": "안전 설정·외부 연동", "見つける": "찾기", "ログイン": "로그인", "ログアウト": "로그아웃", "拾得物を投稿": "습득물 등록", "検索": "검색", "カテゴリ": "카테고리", "拾得元": "습득 장소", "すべて": "전체", "現在地": "현재 위치", "地図で見る": "지도 보기", "閉じる": "닫기", "その他": "기타", "利用者投稿": "사용자 게시물", "鉄道・駅": "철도·역", "警察署・交番": "경찰서·파출소", "バス": "버스", "商業施設": "상업 시설", "日時未設定": "날짜 미설정", "地図に投稿がありません": "지도에 게시물이 없습니다", "再試行": "다시 시도", "投稿を読み込み中": "게시물 불러오는 중", "まだ拾得投稿がありません": "아직 습득물 게시물이 없습니다", "詳細・安全な仲介を確認": "상세 및 안전한 중개 확인", "公開検索・ゲスト利用": "공개 검색 · 게스트 이용", "表示言語": "언어",
  },
};

export function getLanguage(): AppLanguage { if (typeof window === "undefined") return "ja"; const value = localStorage.getItem("return-language"); return value === "en" || value === "zh" || value === "ko" ? value : "ja"; }
function languageMap(language: AppLanguage) { return language === "ja" ? common.ja : { ...common.en, ...common[language] }; }
export function tLabel(label: string, language = getLanguage()) { return languageMap(language)[label] ?? label; }
export const translate = tLabel;

function translateDom(language: AppLanguage) {
  if (typeof document === "undefined") return;
  if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLSelectElement) return;
  const map = languageMap(language);
  const replacementKeys = Object.keys(map).filter(key => /[一-龯ぁ-んァ-ヶ]/.test(key) && key.length >= 3).sort((a, b) => b.length - a.length);
  const localize = (value: string) => {
    if (map[value]) return map[value];
    const count = value.match(/^(\d+)件の公開投稿$/);
    if (count && language === "en") return `${count[1]} public posts`;
    if (count && language === "zh") return `${count[1]}条公开发布`;
    if (count && language === "ko") return `공개 게시물 ${count[1]}건`;
    return replacementKeys.reduce((text, key) => text.includes(key) ? text.replaceAll(key, map[key]) : text, value);
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const value = node.nodeValue?.trim();
    if (!value || node.parentElement?.closest("script,style,textarea")) continue;
    const translated = localize(value);
    if (translated === value) continue;
    node.nodeValue = node.nodeValue!.replace(value, translated);
  }
  document.querySelectorAll<HTMLElement>("input, textarea, button, select, [aria-label], [title]").forEach(element => {
    for (const attr of ["placeholder", "aria-label", "title"]) {
      const value = element.getAttribute(attr);
      if (value) {
        const translated = localize(value);
        if (translated !== value) element.setAttribute(attr, translated);
      }
    }
  });
}

export function useAppLanguage() {
  const [language, setLanguage] = useState<AppLanguage>(() => getLanguage());
  useEffect(() => {
    const onLanguage = (event: Event) => setLanguage((event as CustomEvent<AppLanguage>).detail);
    window.addEventListener("return:language", onLanguage);
    let translating = false;
    let timer: number | undefined;
    const apply = () => {
      if (translating) return;
      translating = true;
      try { translateDom(getLanguage()); } finally { translating = false; }
    };
    const observer = new MutationObserver(records => {
      if (translating || timer !== undefined || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLSelectElement) return;
      if (document.querySelector("[role=dialog]")) return;
      // React updates form nodes on every keystroke. Never schedule a full-body
      // translation walk for mutations originating inside a form or dialog.
      if (records.some(record => record.target instanceof Element && record.target.closest("form, [role=dialog]"))) return;
      timer = window.setTimeout(() => { timer = undefined; apply(); }, 180);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    apply();
    return () => { window.removeEventListener("return:language", onLanguage); observer.disconnect(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [language]);
  useEffect(() => { translateDom(language); }, [language]);
  return language;
}
