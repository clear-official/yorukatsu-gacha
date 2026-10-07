# 夜活ガチャ

GitHub Pagesの画面とGoogle Apps Script（GAS）・Googleスプレッドシートを組み合わせた、水曜日のガチャサイトです。WordPressは使用しません。

## 2026-10-05時点の状態

- GitHub Pagesのフロントは `index.html`、`styles.css`、`app.js`、`assets/images/` です。
- フロントの表示と結果形式は、現時点では**水曜日・100pt当選／0pt非当選**に対応します。
- `gas/` は、空の「夜活｜ガチャ抽選用シート」に合わせて作り直した**ローカルの未デプロイ版**です。`抽選設定`、`コード管理`、`ガチャ履歴` を使います。
- GASへの認証済み接続、実シートへの作成、Apps Scriptへの貼付・デプロイ、実通信テストはまだ行っていません。
- 公開中の `app.js` の `GAS_WEB_APP_URL` はプレースホルダーです。Webアプリの `/exec` URLを設定して公開するまで抽選は動きません。

## ファイル

| 場所 | 役割 |
|---|---|
| `index.html` / `styles.css` / `app.js` | GitHub Pagesの画面・通信 |
| `assets/images/` | ロゴ、背景、ガチャ本体、結果画像 |
| `gas/Code.gs` | GAS公開入口とロック |
| `gas/Config.gs` | シート名・列名・内部ID |
| `gas/SheetService.gs` | シート作成・読込・履歴保存 |
| `gas/ValidationService.gs` | ID・日時・設定の検証 |
| `gas/LotteryService.gs` | 開催判定・抽選・重複防止 |
| `gas/Bridge.html` | GitHub PagesとGASのiframe通信 |
| `gas/appsscript.json` | GASタイムゾーン・Webアプリ設定 |
| `gas/tests/night-gacha.test.mjs` | シートを変更しないローカル模擬テスト |
| `gas/SETUP.md` | 初回設定、デプロイ、テスト手順 |
| `SHEETS.md` | 3シートの列構成 |

## 最初に行うこと

1. [gas/SETUP.md](gas/SETUP.md) に従って、対象シートのApps ScriptへGASファイルを貼り付け、`setup()` を実行します。
2. [SHEETS.md](SHEETS.md) の抽選設定と開催日ごとのコードを入力します。当選確率、開催時刻、当選上限、正式コードは運営側の決定が必要です。
3. テスト用のシートコピーで検証し、本番のWebアプリをデプロイします。
4. Webアプリの `/exec` URLを `app.js` の `GAS_WEB_APP_URL` に設定し、GitHub Pagesへ公開します。

GASを実シートへ反映し、設定値とテスト結果を確認してから公開してください。

## 重要な制約

GASは開催条件・確率・当選上限・履歴を管理し、`LockService` で同時抽選を直列化します。ただし現在の「ユーザーID」はブラウザーの `localStorage` にある端末IDです。別端末やストレージ削除後の再参加を完全には防げません。iframeの送信元チェックも利用者の本人確認ではありません。正式なポイント付与前に運営側でこの制約を確認してください。

新しいポイント額や別曜日のイベントに広げる場合は、GASの設定に加えてフロントの文言・結果判定も変更します。現行フロントは100pt以外の当選表示に対応していません。

従来の `HANDOFF.md` と `QA-NOTES.md` は旧シート構成を含む履歴資料です。新しいGASの設定は `gas/SETUP.md` と `SHEETS.md` を参照してください。
