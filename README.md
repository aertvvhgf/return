# return | 落とし物検索・安全な仲介・トーク

React / Express / tRPC / Drizzle starter, adapted from the Sandbox web-db-user template.

- `pnpm dev`: development server; honors `PORT` (default 3000).
- `pnpm build` / `pnpm start`: build and serve `dist/index.js` and `dist/public/`.
- `pnpm db:migrate`: apply checked-in migrations. `pnpm db:push`: generate and apply new schema changes.
- `pnpm check` / `pnpm test`: types and application tests.

Start with the Webdev skill's default-template guide. Platform login, storage, payments and service contracts live in its shared references; read the relevant capability before extending its helper.

`server/_core/publicConfig.ts` exposes only named public runtime values. Private keys stay server-side. The platform serves managed `/manus-storage/` assets; the application does not register a second proxy.

Platform configuration is readable and editable through `webdev.config`. Default settings are initial values, not enforced constraints. The agent may modify the files, commands and configuration or follow the flexible guide for another stack.

## トーク（1対1・グループ）
- 拾得投稿の詳細から「トークで質問」を押すと投稿者との1対1トークが始まります。仲介案件の詳細からも相手とのトークを開けます。
- 左ナビの「トーク」で一覧・未読バッジ・グループ作成・メンバー追加・通知オフ・退出・通報ができます。
- 個人情報（電話・メール・住所・SNS ID・カード番号・外部リンク）を含むメッセージは送信できません。
- `server/chat.e2e.test.ts` は任意実行の統合テストです（`CHAT_E2E=1 DATABASE_URL=... pnpm vitest run server/chat.e2e.test.ts`）。通常の `pnpm test` では実行されません。
- `scripts/seed-preview.ts` は画面確認用のローカルデータ投入スクリプトです（アプリ実行時には使われません）。

## 全機能説明

詳細な操作方法、対象データ、外部連携の制限、安全設計、PayPay未接続時の挙動は [FEATURES.md](./FEATURES.md) にまとめています。

今回の追加: トーク画像添付、本文検索、リアクション、ピン留め、表示言語切替（日本語・英語・中国語・韓国語）、ブラウザ通知許可、PayPay謝礼の合意・未接続状態管理。
