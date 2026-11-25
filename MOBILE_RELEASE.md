# return モバイルアプリ公開準備

このプロジェクトには、CapacitorによるiOS・Android用ネイティブプロジェクトを追加済みです。アプリは公開中の `https://return-web-production.up.railway.app` を表示し、ログイン、AI Search、OSM地図、チャット、投稿、テーマ設定など既存のWeb機能を同じアカウントで利用します。

## Android

```bash
pnpm mobile:android
```

Android Studioで `android/` を開き、Google Play用の署名鍵を設定して、AAB（Android App Bundle）を作成します。Google Play Consoleでアプリ名、説明、スクリーンショット、プライバシーポリシー、コンテンツレーティングを登録して審査申請します。

## iPhone

```bash
pnpm mobile:ios
```

macOSのXcodeで `ios/App/` を開き、Apple DeveloperのTeam、Bundle Identifier `jp.return.app`、Signing、Privacy Manifestを設定します。その後ArchiveしてApp Store Connectへアップロードし、スクリーンショット、年齢レーティング、プライバシー情報を登録して審査申請します。

## 注意

- このLinux環境にはXcodeとAndroid Studioがないため、署名済みのIPA/APK/AABはまだ作成していません。
- App Store公開にはApple Developer Program、Google Play公開にはGoogle Play Consoleの登録が必要です。
- ストア提出前に、Apple/Googleの審査用アカウント、プライバシーポリシーURL、サポートURLを用意してください。
- ネイティブプロジェクトでは公開中のWebサイトを利用するため、Railwayサイトを停止するとアプリも利用できなくなります。
