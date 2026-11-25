# return 実装計画

## 目標と実装方針

ユーザー提供の公開アプリ `https://retarn-skwmoqkh.manus.space/` の機能・ブランド表現を参考に、編集権限のない旧サイトとは別の新しい「return」落とし物検索・安全仲介アプリを作る。新サイトのDBには架空の拾得投稿、架空プロフィール、デモ検索レコードを作らず、実投稿がない状態を正直に表示する。警察、鉄道、バス、施設等の照会・届出・送信・LINE外部通知だけはデモ表示にし、それ以外は実際に保存・更新・削除できる機能として作る。旧サイトのデータや投稿はこの新規プロジェクトから変更・削除しない。

既存テンプレートのReact 19 / TypeScript / Tailwind / Express / tRPC / Drizzle ORM / MySQLを使う。ログインはManus OAuthと既存セッションを利用する。ゲストは公開検索・安全案内を見られるが、実投稿作成、紛失追跡、遺失届保存、保存検索、仲介管理、マイページは認証必須とする。所有者・仲介参加者の認可はサーバーで確認し、プロフィール、投稿、追跡、届出、仲介、メッセージ、通知、表示設定はMySQLへ永続保存して同一アカウントの別端末から同期する。セッションCookieはテンプレートの設定を維持し、公開HTTPS Previewを含む埋め込みログインを許可する。

## データ・サーバー

- `drizzle/schema.ts` と追記型SQLマイグレーションは利用者、拾得投稿、紛失追跡、保存検索、遺失届、仲介、案件内メッセージ、相談記録、通知、通知設定の永続スキーマを定義する。拾得投稿の保管期限はnullable。
- `server/routers.ts` は機能APIの入口として、`server/routers/posts.ts`、`personal.ts`、`mediation.ts`、`notifications.ts` を登録する。ログインは既存 `publicProcedure` / `protectedProcedure` を使い、検索結果には非公開所有確認メモ、所有者ID、写真同意時刻を含めない。
- `server/return-utils.ts` はDB接続エラー、公開地図の約1km位置丸め、テキスト類似度、基礎スコア、通知保存をまとめる。新しい実投稿の作成時には紛失追跡を照合し、該当通知をDBへ追加する。
- `server/privacy.ts` は公開投稿、仲介テキスト、Manus AI入力からメール・電話・URL・郵便番号・詳細住所・SNS ID・長い番号らしい文字列・典型的な日本語の氏名表記を検出/伏せ字にする。これは既知パターンの防御であり完全保証ではないので、入力画面でも個人情報を入力しないよう案内する。
- `server/ai-match.ts` はManusのOpenAI互換APIの検証済み `gpt-5-mini` を使い、ログイン利用者の実投稿候補上位30件を日本語で再順位付けする。個人入力をURLへ載せないtRPC POST mutationを使い、個人情報パターンを除去したテキストのみをAIへ送る。未認証ゲストやAI不調/利用上限時はAIなし類似度へフォールバックし、画面でも方式を明示する。所有者の自動認定には使わない。
- 紛失照合の参考写真は `client/src/lib/image.ts` を用いて端末内で平均色/明るさを計算し、元画像を最大768pxのJPEGへ再符号化してEXIF等を除去する。ゲストまたは同意チェックなしでは画像本体を送らない。ログイン利用者が個別に同意した場合だけ、1回のAI照合POSTへ画像データを含めManus AIへ直接渡す。サーバーでもJPEGデータを再検証してメタデータを除去する。画像データはこのアプリのDB/Storageに保存しない。
- 拾得投稿写真は `client/src/lib/image.ts` で端末内最大1600pxのJPEGに再符号化し、EXIF/GPS等を除去する。画面からはStorage保存、Manus AI審査、公開表示の同意を独立して取り、保存ボタンまで写真をサーバーへ送らない。`posts.create/update` が一時画像をPOST本文として受信し、サーバー側でもJPEGメタデータを除去してからManus AIのfail-closed審査へ渡す。承認された写真だけStorageへ保存・DB登録する。所有者とStorageパスの一致、同意日時を検証/記録する。Google Cloud Visionや公開Web上の一致画像検索は未接続と画面に明記する。
- `server/storage.ts` のManus Storageはruntime上でファイル削除できないため、投稿削除は公開対象から除外するsoft-deleteとし、Storage上の画像自体は残る場合があることを写真同意時と安全案内で明示する。AI審査に失敗した画像はStorageへ送らない。
- `server/return-utils.ts` は公開APIから元のStorage pathを除き、投稿IDを使う `/api/public/found-photo/:id` を返す。`server/_core/index.ts` のプロキシは有効投稿状態・画像形式・5MiB上限を確認し、所有者ID付きキー/署名URLを公開レスポンスへ出さない。
- 仲介申請、メッセージ、受け渡し案は参加者権限をAPIで毎回確認し、公開連絡先・正確な住所・非参加者への正確な地図ピン/非公開情報の返却を防ぐ。安全相談記録は作成者本人だけに返し、運営や警察へ自動通知しない。
- `server/_core` の認証、DB、tRPC、OAuth基盤は既存テンプレートを再利用する。マイグレーションは追記型とし、架空レコードのINSERTや既存ユーザーデータのDELETEを行わない。
- 複数アカウント同期は境界を分ける。公開中の実拾得投稿は全アカウントとゲストの共通DB検索・地図へ反映し、同一アカウントの追跡・届出・検索保存・通知はそのアカウントの全端末へ同期する。仲介データは参加者2アカウントだけに返し、異なるアカウントのプロフィール/遺失届/通知を相互共有しない。
- `guest_sync_vaults` はログイン不要の暗号化共有Vaultを保存する。利用者端末が別々の256-bit APIアクセス秘密鍵とAES-256-GCM暗号鍵を生成し、共有コードにまとめる。同じコードを複数のログイン/ゲスト端末へ明示共有でき、保存検索条件と紛失物追跡条件だけを同期する。Vaultは `MyPageScreen` にアカウント個人領域とは別の「共有ボックス」として、ログイン/未ログイン両方に表示する。サーバーにはアクセス鍵のSHA-256ハッシュと暗号文だけを保存し、共有APIはすべてPOST mutationで提供する。プロフィール、届出、投稿、メッセージ、通知、連絡先等をVaultへ入れず、アカウント個人データと自動結合しない。最終アクセスから90日で期限切れにし、利用者がコードを失効・削除できる。共有コードはパスワード同等の秘密として扱い、15秒ごとの再読込とrevision競合検出を行う。

## 画面とクライアント

- `client/src/pages/Home.tsx` はOAuth状態、7画面のナビゲーション、ログイン導線、通知ベル、投稿ダイアログを統合する。機能画面と投稿フォームは遅延読み込みする。
- `client/src/screens/SearchScreen.tsx` は実投稿検索、カテゴリ・拾得元・路線・並べ替え、人気語、期限アラート、保存条件、公開安全情報と詳細を表示する。
- `client/src/screens/AiMatchScreen.tsx` は紛失物入力、写真の端末内色/明るさ解析、明示同意後だけの縮小画像AI照合、AIなしフォールバック、最大3候補比較、追跡登録導線を提供する。画像を送る範囲、処理、アプリDB/Storageに残さないこと、個人情報フィルターの限界を説明する。
- `client/src/screens/MapScreen.tsx` と `client/src/components/Map.tsx` はManus Maps proxyを使い、実投稿の丸めた公開位置だけを表示する。`client/src/components/return/LocationAndPhoto.tsx` は拾得位置選択と、同意後に送信する写真の端末内プレビュー/再符号化を担う。
- `client/src/screens/ReportScreen.tsx` は遺失届の入力、最終確認、アカウント保存、編集、削除、印刷/PDF/テキスト出力を提供する。外部提出は行わない。
- `client/src/screens/MyPageScreen.tsx` はプロフィール、追跡、保存検索、自分の投稿、仲介、遺失届、通知、表示設定の管理画面を構成する。ログアウト状態では架空プロフィールを表示せず、ログイン要求だけを表示する。
- `client/src/components/return/GuestSyncPanel.tsx` はアカウント個人データと分離した共有ボックスをログイン/ゲスト両方に表示し、コードの生成・コピー・他アカウント/端末からの復元・再読込・失効を提供する。`client/src/lib/guest-vault.ts` が暗号化/復号を端末内で行い、一括確認の現在条件と追跡条件を共有Vaultへ追加して参加者の各端末で再利用できる。ゲスト用追跡条件も公開実投稿に手動照合できる。
- `client/src/screens/MediationScreen.tsx` と `client/src/components/return/PostDetailDialog.tsx` は実投稿の申請、投稿者だけの所有確認メモ、参加者限定会話、安全相談、受け渡し案・双方同意・完了確認をつなぐ。
- `client/src/components/return/NotificationBell.tsx` と `NotificationSettingsPanel.tsx` はDB通知・既読/削除・種別設定・ブラウザ許可を扱う。ブラウザPush未対応でもアプリ内通知を利用できる。
- `client/src/screens/SafetyScreen.tsx` と `AccountSettings.tsx` は外部未接続のデモ、安全/プライバシー案内、個人情報マスキング、高コントラスト、文字サイズ、モーション、優先言語設定を表示する。
- `client/src/lib/return.ts` はカテゴリ、拾得元、日付、状態表示の共通定義。`client/src/index.css` は青緑基調のアクセシブルなデザイントークンと印刷/表示設定を持つ。`client/public/manus-routes.json` はSPAの実ルートを宣言する。

## デザイン

ユーザー提供の既存returnサイトをスタイル参照として使う。白と淡いスレートの情報面に深い青緑のアクセントを使う、日本語の実用的で落ち着いたサービスUIとする。角丸の白い情報カード、進捗バッジ、地図ピンを一貫したシグネチャにし、デスクトップでは左ナビゲーション、モバイルではコンパクトな上部ヘッダーと折り畳みメニューへ切り替える。削除・仲介・受け渡しなど重要操作は確認と状態を明示し、検索の空状態はサンプルで埋めない。動きは短く限定し、OS/利用者のモーション低減設定を尊重する。書体は日本語システムゴシック。ブランドアイコンは返却矢印をもつ深緑の簡潔なSVGとする。

## 運用境界

公的な遺失物データベースへの照会、各機関への届出提出、交通事業者・施設API、LINE通知の外部接続は実装しない。画面のデモ操作も実通信を行わないと明示する。従来の「相談メモ」は作成者本人のアカウント内だけに保存する。別の「運営通報」は利用者の明示操作・送信同意後にプロジェクト運営者へ通知し、警察等の公的機関への通報ではなく、確認・返信も保証しない。スタッフ用管理画面は提供しない。紛失届・受取希望は実提出・予約ではないと明示する。公開投稿は実データだけとし、開発時も架空レコードで共有DBを汚さない。


## Guest Vault容量契約

共有条件は各40件、最大フィールド長を維持する。クライアントとサーバーは共通定数の暗号文上限1,000,000文字を使い、超過時は利用者へ条件削除を案内する。MySQLの保存列はMEDIUMTEXTとし、上限までの暗号文を保存できるようにする。


## 2026-11-02 追加要件: 仲介チャット・ブロック・通報・送金

- 既存の`mediations`/`mediation_messages`を使う参加者限定の案件チャットを維持し、拾得投稿から仲介申請した申請者と投稿者（拾得者）が案件内で話せる導線として扱う。新しい無制限DMは設けない。本文のPII拒否、相手通知、15秒ごとの更新、案件参加者チェックを維持する。
- ブロックは案件参加者が相手を設定・解除できる永続DB記録とする。どちらかが相手をブロックしている間、新規仲介の開始、送信、承認・受け渡し等の状態遷移を拒否する。過去のメッセージと案件は確認できる。通報と案件終了はブロック中でも許可する。ブロック設定の存在をAPIで推測しやすく漏らさない。
- 「相談メモ」は従来どおり本人だけが見られる記録として残す。別の「通報」は、送信前にプロジェクト運営者へ内容が送られること、警察や公的機関への通報ではないこと、確認・返信が保証されないことを明示し、利用者の明示操作でDB保存後にプロジェクト所有者向け通知を送る。通知失敗時も報告データをDBに残し、送信失敗を利用者へ知らせる。通報にはカテゴリ、任意の案件文脈、説明文を含め、本人連絡先等は不要とする。
- PayPay公式資料と承認済み要件: `POST /v1/qr/sessions`で受取人が`merchant_topup`利用をPayPay上で明示認可し、`userAuthorizationId`はサーバーでのみ暗号化保存する。持ち主（仲介申請者）が、双方の受け渡し完了後に合意した謝礼をPayPay OPA Web Cashierで加盟店へ払い、PayPay状態照会で完了を確定した後だけ、同額JPYを加盟店ウォレットから拾得者（投稿者）のPayPay残高へ自動Top Upする。支払・Top Up・返金は個別の冪等IDと状態照会で管理し、不明結果では再実行しない。PayPay資金はアプリ運営者の個人PayPayへ自動送金されない。ユーザーは当該加盟店契約・用途・資金フローの承認済みと確認した。

- ブロック対象の拾得投稿はブロックした本人の検索、地図、AI照合、紛失追跡候補、新着照合通知から除外する。マイページには自分がブロックした相手の一覧と解除操作を置く。匿名プロフィールや相手へのブロック通知は追加しない。


## 追加機能の競合・公開範囲

ブロック作成と仲介操作の競合を防ぐため、案件行または対象投稿行をFOR UPDATEでロックし、次に関係する2ユーザー行をID昇順で個別ロックしてから、ブロック判定と状態更新を同一transaction内で行う。通報とキャンセルはブロック後も可能。案件詳細は方向別の`blockedByMe`などを返さず、連絡停止中かどうかだけを返す。解除一覧は本人のマイページにだけ返し、ブロック相手から解除できない。検索除外はブロックした本人だけに適用する。


## PayPay実装構成と環境安全境界

- `server/paypay/opaClient.ts` はmodeごとにallowlistしたPayPay API base URL、HMAC署名、timeout、レスポンス検証、個人/認可IDのログ除外を担う。任意URLを受け付けない。`NODE_ENV !== production`かつ`PAYPAY_OPA_ENV === production`では全ての外部PayPay呼出しをfail-closedで拒否する。Productionでは`NODE_ENV === production`かつmodeが`production`の場合だけ本番hostを使う。
- `server/paypay/accountLink.ts` とExpress callback routeはnonce/TTL、同一origin HTTPS callback、PayPay response token署名検証、merchant key確認、利用者ID照合を行う。受取人認可は`merchant_topup` scopeだけ。`userAuthorizationId`をAES-256-GCMで暗号化し、DBとログに平文を残さない。環境をAEAD追加データとして分離する。
- `server/paypay/rewardService.ts` と`server/routers/paypay.ts` は仲介参加者・返還完了・当事者の金額同意を検証し、重複rewardをDB transaction/row lockで防ぐ。Payment codeの作成は持ち主の明示操作後、支払状態はPayPay照会で確定し、成功確認後のみ拾得者へのMerchant Top Upを行う。状態不明は同一merchant IDを照会し、別IDで再実行しない。Top Upが確定的に失敗したときだけ返金を開始し、返金自体も照会で確定。タイムアウト/不明状態では未完了/要確認として扱う。
- `drizzle/schema.ts` と追記型migrationはPayPayアカウント連携session、暗号化済み受取認可、謝礼transaction/audit状態を保存し、利用者・仲介案件・環境別にアクセスを隔離する。秘密鍵やPayPay認可IDは読み取りレスポンスから返さない。
- `MyPageScreen` の受取人PayPay連携パネルと`MediationScreen`の謝礼合意/支払パネルは、口座明示認可、支払者・受取人、JPY額、加盟店経由の二段階資金移動、返金/未完了状態を見せる。PayPay上の最終支払確認は利用者自身が行う。
- `PAYPAY_OPA_ENV`は環境ごとに厳密に`production`/`sandbox`/`staging`のどれかを要求し、`PAYPAY_USER_AUTH_ENCRYPTION_KEY`はbase64urlでdecode後ちょうど32 bytesの場合だけ起動する。現在の開発環境は有効なPayPay mode/暗号鍵形式が確認されていないため、テスト中はPayPay APIを呼ばない。Production mode/keyは本番実行時にのみ使用し、Sandbox/テストはmock transportかSandbox credentialsで行う。
- 公式資料: [API authorization](https://www.paypay.ne.jp/opa/doc/v1.0/api_authorization.html)、[Account Link QR](https://www.paypay.ne.jp/opa/doc/v1.0/account_link.html)、[Merchant Top Up](https://www.paypay.ne.jp/opa/doc/v1.0/merchant_topup)、[Web Cashier](https://www.paypay.ne.jp/opa/doc/v1.0/webcashier)。


## PayPay OPA公式仕様の実装メモ

PayPay公式HMAC仕様では、本文付き要求の`hash`はUTF-8の`contentType`に本文を続けてMD5し、Base64化する。HMAC-SHA256の署名対象は`URI\nMETHOD\nnonce\nepochSeconds\ncontentType\nhash`。GET等の本文なし要求は`contentType`とhashを`empty`として署名headerへ設定する。Authorization headerの形は`hmac OPA-Auth:<apiKey>:<mac>:<nonce>:<epoch>:<hash>`。API要求のsecretはUTF-8文字列をHMAC鍵として使う一方、Account Linkのcallback `responseToken`はAPI secretのBase64 decode値で署名されたHS256 JWTなので、2つを混同しない。[PayPay API Authorization](https://www.paypay.ne.jp/opa/doc/v1.0/api_authorization.html)

Account Link QRは`POST /v1/qr/sessions`で必要scope・nonce・許可されたHTTPS `redirectUrl`を渡し、応答の`linkQRCodeURL`を表示する。状態取得は`GET /v1/qr/sessions/status?linkQRCodeURL=<URL-encoded>`で、`userAuthorizationId`はバックエンドにだけ保存する。PayPay利用者は後から認可を取り消せるため、Top Up前に認可状態を確認する。Merchant Top Upは`POST /v2/wallet/topups`へ`merchantTopUpId`、`userAuthorizationId`、JPY額、`requestedAt`を送り、`GET /v2/wallet/topups/{merchantTopUpId}`で照会する。Merchant Top Upは加盟店ウォレット残高を利用者のPayPay残高へ入金する。Merchant Top Upのタイムアウトは不明扱いとし、状態照会後にのみ再処理判断する。[Account Link QR](https://www.paypay.ne.jp/opa/doc/v1.0/account_link.html) [Merchant Top Up](https://www.paypay.ne.jp/opa/doc/v1.0/merchant_topup)

Web Cashierの決済コードは`POST /v2/codes`で作成し、PayPayが返す支払URLを支払者へ表示する。実際の成功判定はクライアント戻り値ではなくPayPayの状態照会で行う。返金はWeb CashierのRefund APIで独立IDを用い、作成結果と照会結果で状態を確定してから利用者へ表示する。[PayPay Web Cashier](https://www.paypay.ne.jp/opa/doc/v1.0/webcashier)


PayPay公式仕様の追加確認: 利用者認可状態は`GET /v2/user/authorizations?userAuthorizationId=...`で照会し、`status=ACTIVE`・`scopes`に`merchant_topup`があり、`expireAt`が過去でないことをTop Up前に検証する。Web Cashierの支払状態は`GET /v2/codes/payments/{merchantPaymentId}`で、`COMPLETED`以外を成功扱いしない。Refundは非同期なので、PayPay応答と`GET refund details`を照会して結果を確定する。Merchant Top Upの決済記録は後日リコンシリエーションファイルで逆仕訳`TOPUP_REVERSE`が通知される可能性がある。画面の完了表示は「PayPay照会時点の完了」と明示し、後日取消/逆仕訳を確認したら運営者復旧対象として扱う。出典: [User Authorization Status](https://www.paypay.ne.jp/opa/doc/v1.0/merchant_topup) [Payment Details and Refund](https://www.paypay.ne.jp/opa/doc/v1.0/webcashier)


## PayPay OPA公式契約の実装メモ

- OPAの各リクエストは、URI・HTTP method・nonce・epoch seconds・content-type・body hashを改行で結んだ文字列へHMAC-SHA256を適用し、`Authorization: hmac OPA-Auth:...`として送る。body hashはMD5(content-type bytes + body bytes)のBase64で、GETは`empty`を使う。API request secretはUTF-8 bytesで署名し、Account Link responseTokenのHS256検証にはBase64 decodeしたapiKeySecretを使う。([API Authentication](https://www.paypay.ne.jp/opa/doc/v1.0/api_authorization.html))
- Account Linkは`POST /v1/qr/sessions`で`merchant_topup` scope、ランダムnonce、HTTPSの許可済みcallback URLを指定する。WEB_LINK callbackは`apiKey`と`responseToken`をqueryで返すため、callback endpointはqueryをログへ出さず、`iss=paypay.ne.jp`、`aud`、`exp`、nonce、referenceId、apiKey一致を検証してからサーバー上でuserAuthorizationIdを保存する。利用者はPayPayアプリから後日認可を取り消せるので、Top Up前に`GET /v2/user/authorizations?userAuthorizationId=...`でACTIVEかつmerchant_topup scopeを照会する。([Account Link](https://www.paypay.ne.jp/opa/doc/v1.0/account_link.html), [Merchant Top Up](https://www.paypay.ne.jp/opa/doc/v1.0/merchant_topup))
- Web Cashierの`POST /v2/codes`では一意な`merchantPaymentId`を用いてORDER_QRの支払いコードを作る。同じIDは前回結果を返す。作成timeoutは未知の支払状態として扱い、支払照会を行う。Merchant Top Upは`POST /v2/wallet/topups`と`merchantTopUpId`で加盟店ウォレットからPayPay残高へ入金し、`GET /v2/wallet/topups/{merchantTopUpId}`で照会する。日次topup reconciliationにはTOPUP_REVERSEも含まれ得るため、画面の「完了」はAPI照会時点の状態として記録する。([Web Cashier](https://www.paypay.ne.jp/opa/doc/v1.0/webcashier), [Merchant Top Up](https://www.paypay.ne.jp/opa/doc/v1.0/merchant_topup))
- 返金APIの作成・照会endpoint、支払詳細endpoint、Account Link QR status endpointは実装時に同じ公式仕様で再確認する。状態不明時には別IDで再試行せず、元IDで照会し、PayPayが確定状態を返した後だけ次の処理へ進む。


## 2026-11-06 追加要件: LINE/Instagram DM風トーク
- `chat_threads` は `kind`（dm/group）、`dmKey`（1対1の一意キー）、`title`、`topic`、`postId`、`mediationId`、`lastMessageAt`、`lastMessagePreview` を持つ。1対1は同一ユーザーペアで1スレッドだけになる。
- `chat_members` はスレッド参加者、`role`（owner/member）、`lastReadMessageId`、`muted`、`leftAt`（退出・再参加）を持つ。`chat_messages` は `kind`（text/system）と本文を保持し、`(threadId, id)` でページングする。
- サーバー`server/routers/chat.ts`は、一覧・未読数・連絡先・メッセージ取得（afterId差分取得）・送信・既読・1対1開始（投稿経由/連絡先経由）・グループ作成/招待/改名/退出/ミュート・ブロック・通報を提供する。すべての手続きで参加者をサーバー側で検証する。
- 連絡先は「仲介案件でつながった相手」と「同じトークに参加した相手」に限定し、見知らぬ相手への一斉DMを防ぐ。1対1はブロック中に送信不可、グループはブロックした相手の発言を自分の画面から除外する。
- 通知は`notifications.kind`へ`chat`と`threadId`を追加し、同一スレッドの未読通知は10分に1件へ抑制する。
- クライアント`ChatScreen`は一覧＋スレッドの2ペイン（モバイルは1ペイン切替）、日付区切り、送信者ごとのグルーピング、未読バッジ、検索・個人/グループ絞り込み、新規トーク（個人/グループ）、メンバー追加・改名・通知オフ・退出・通報のメニューを持つ。投稿詳細と仲介案件から`openChatThread`で該当スレッドへ遷移する。
- `0007_chat_threads`は追加テーブルと通知列の追記のみで、既存データを変更しない。

## 2026-11-06 追加候補の実装状況
- [x] トーク画像添付（1MB以下、画像プレビュー、メッセージ種別保存）
- [x] トーク本文検索APIと画面内検索
- [x] 👍リアクションとメッセージのピン留めAPI・操作UI
- [x] ブラウザ通知許可導線とアプリ内通知継続
- [x] メインナビゲーションの日本語・英語・中国語・韓国語切替
- [x] PayPay謝礼案、当事者同意、支払開始導線、未接続時のfail-closed表示。PayPay本番送金は加盟店契約・認証情報設定後に別途有効化する。
- [x] FEATURES.mdに全機能と外部接続境界を記載
