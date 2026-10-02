# 夜活ガチャ（GitHub Pages + Google Apps Script）

この一式はWordPressを使いません。GitHub Pagesは画面表示を担当し、曜日判定・抽選・参加履歴・当選コードはGoogle Apps Script（GAS）とGoogleスプレッドシートで管理します。

## ファイル構成

- `index.html`、`styles.css`、`app.js`：GitHub Pagesへ置くフロント
- `assets/images/`：背景・ロゴ・ガチャ本体と、当選・非当選用リアちゃん素材（元画像をそのまま同梱）
- `gas/Code.gs`：抽選・状態確認・`setup()`によるシート初期設定
- `gas/Bridge.html`：GASとGitHub Pagesをつなぐ、送信元チェック付きiframe
- `gas/appsscript.json`：GASのタイムゾーンとWebアプリ設定
- `SHEETS.md`：各シートの列と設定
- `QA-NOTES.md`：確認済み項目と実環境での確認項目

画面には「水曜日限定！今夜の運試し！」を表示します。ガチャ本体は通常時にゆっくり浮遊し、抽選ボタンを押すと短く揺れます。当選時のみCSSの紙吹雪を表示し、動きを減らす端末設定ではアニメーションを停止します。

## 1. GitHub Pagesを準備する

1. GitHubで新しいリポジトリを作ります（公開リポジトリがGitHub Pagesの一般的な設定です）。
2. このフォルダー内の`index.html`、`styles.css`、`app.js`、`assets/`をリポジトリの公開元フォルダーへコピーします。`gas/`、README、QA記録も一緒に保存して構いませんが、ページ表示に必要なのは最初の4項目です。
3. GitHubリポジトリの **Settings → Pages** で公開元ブランチとフォルダー（通常は`main` / `/ (root)`）を設定します。
4. GitHub Pagesが示すURLを確認します。例：`https://ユーザー名.github.io/リポジトリ名/`。
5. GASで使う許可オリジンはURLの`https://ユーザー名.github.io`部分です。リポジトリ名以降のパスは含めません。

この成果物の作成者はGitHubへのpushや公開設定を行っていません。

## 2. Googleスプレッドシートを準備する

1. 新しいGoogleスプレッドシートを作成し、ファイルのタイムゾーンを **(GMT+09:00) Tokyo** にします。
2. **拡張機能 → Apps Script** を開きます。スプレッドシートに紐づくGASプロジェクトが作られます。
3. GASエディターの`Code.gs`を、このフォルダーの`gas/Code.gs`の内容で置き換えます。
4. **＋ → HTML** で`Bridge`という名前のHTMLファイルを追加し、`gas/Bridge.html`の内容を貼り付けます（拡張子`.html`はエディターが付けます）。
5. プロジェクト設定の「appsscript.json マニフェスト ファイルをエディタで表示する」を有効にし、`gas/appsscript.json`の内容をマニフェストへ反映します。既存のOAuthスコープがある場合は消さず、マージしてください。
6. 関数一覧から`setup`を選び、**実行**します。初回はGoogleの権限確認に同意してください。
7. スプレッドシートへ戻り、`Settings`、`CampaignCodes`、`Results`、`TestResults`、`Status`の5シートと各ヘッダーができたことを確認します。
8. GASの **プロジェクトの設定 → スクリプト プロパティ** に`SPREADSHEET_ID`が保存されたことを確認します。紐づけ型GASでは`setup()`が開いているスプレッドシートのIDを自動取得するため、IDをコードに記入する必要はありません。

単独型GASプロジェクトを使う場合は、`setup()`の実行前に **プロジェクトの設定 → スクリプト プロパティ → スクリプト プロパティを追加** で、プロパティ名を`SPREADSHEET_ID`、値を対象スプレッドシートのIDにして保存します。IDはスプレッドシートURLの`/spreadsheets/d/`と`/edit`の間の文字列です。その後`setup()`を実行してください。IDを`Code.gs`へ直書きしません。

`setup()`は不足シート・ヘッダー・設定だけを追加し、既存の設定値と履歴を保持します。既存の見出しが想定と違う場合や、紐づけ型GASと保存済みIDが違う場合は、書き換えずにエラーで停止します。再実行しても既存データを初期化しません。以前の`setupSheets()`も`setup()`を呼び出します。

## 3. シートを設定する

`Settings`シートの初期値は以下です。設定値はGASがシートから読み込み、GitHub側には配置しません。

| key | 初期値 | 用途 |
|---|---:|---|
| `win_probability` | `0.30` | 当選確率（0〜1） |
| `weekly_winner_limit` | `100` | 週ごとの100pt上限（1〜100） |
| `timezone` | `Asia/Tokyo` | 判定タイムゾーン |
| `test_mode` | `OFF` | テストモード。通常は必ずOFF |
| `test_result` | 空欄 | テスト時の固定結果。`100`、`0`、空欄 |
| `test_campaign_code` | 空欄 | テスト当選用の無効なテストコード |
| `allowed_origin` | `https://YOURNAME.github.io` | GitHub Pagesのオリジン |

`allowed_origin`を、公開予定URLのオリジンへ変更してください。例：`https://acme.github.io`。末尾スラッシュやリポジトリ名は付けません。GASブリッジはこのオリジンからのメッセージだけを受け付けます。

`CampaignCodes`へ1週につき1行で登録します。

| week_id | campaign_code |
|---|---|
| `2026-10-07` | `YK100A` |
| `2026-10-14` | `YK100B` |

- `week_id`は開催週の水曜日の日付です。日付は`YYYY-MM-DD`で入力し、水曜日である必要があります。
- コード列は「書式 → 数字 → 書式なしテキスト」にしてから入力してください。先頭ゼロを保てます。
- 同じ週の重複行や、他週と同じコードがある場合はGASが抽選を停止します。
- `Status`シートは次回水曜日のweek_id、コード登録状態、テストモードを表示します。「未登録」や「重複・要確認」のまま本番運用しないでください。

`Results`は本番履歴、`TestResults`はテスト履歴です。どちらも列は`timestamp`、`week_id`、`device_id`、`result`、`campaign_code`です。氏名・メール・電話・IPアドレスは収集しません。

## 4. GASをWebアプリとしてデプロイする

1. GASエディター右上の **デプロイ → 新しいデプロイ** を選びます。
2. 種類で **ウェブアプリ** を選択します。
3. 実行ユーザーは **自分**、アクセスできるユーザーは **全員** にします。匿名アクセスを許可できないWorkspaceでは、この構成のままでは利用できません。
4. デプロイを実行し、権限を確認します。
5. 発行された`https://script.google.com/macros/s/.../exec` URLをコピーします。

この仕組みはGASのiframe内で`google.script.run`を呼び出すため、GitHub PagesからGASへ直接`fetch`する際に起きるCORS制約を避けます。ブリッジは`allowed_origin`と親ウィンドウの送信元を照合します。

## 5. GAS URLをフロントへ設定する

`app.js`冒頭の`GAS_WEB_APP_URL`を、デプロイした`/exec` URLに置き換えます。

```js
var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/デプロイID/exec';
```

当選確率・当選上限・キャンペーンコードはここへ書かないでください。GitHub PagesのJavaScriptは公開情報として誰でも閲覧できます。

## 6. GitHub Pagesを公開する

1. `index.html`、`styles.css`、`app.js`、`assets/`をGitHubリポジトリへ配置します。
2. リポジトリの **Settings → Pages** で公開します。
3. 公開URLを開き、イベントページが表示されることを確認します。
4. GASの`Settings.allowed_origin`がページURLのオリジンと一致していることを確認します。

この成果物はローカル作業物です。GitHubへのpush、GASの本番デプロイ、スプレッドシートの作成は利用者側で行います。

## 7. テストモード

本番の`Settings.test_mode`初期値は`OFF`です。テストするときだけ`ON`にし、必要に応じて`test_result`へ`100`または`0`を設定します。`100`を固定する場合は`test_campaign_code`に`TEST-DO-NOT-REDEEM`等の無効コードを設定してください。空欄ならGASの確率設定でテスト抽選します（コードが登録された週が必要です）。

テスト結果は`TestResults`へ保存され、本番の上限・履歴には加算されません。テスト完了後は`test_mode`を`OFF`に戻し、`test_result`と`test_campaign_code`も空にしてください。URLパラメーターで本番の曜日制限を解除する機能はありません。

## 8. GASを更新したとき

1. Apps Scriptエディターの`Code.gs`または`Bridge.html`を更新します。
2. **デプロイ → デプロイを管理** を開きます。
3. 鉛筆アイコンから新しいバージョンを選び、デプロイします。
4. 同じWebアプリURLを維持できているか確認します。URLが変わった場合は`app.js`も更新します。

## 9. 本番公開前チェック

- `test_mode`が`OFF`である。
- `allowed_origin`とGitHub Pagesのオリジンが完全一致している。
- `timezone`とスプレッドシートのタイムゾーンが日本時間になっている。
- 今週以降の`CampaignCodes`が正しい水曜日の日付で登録され、コードが週ごとに異なる。
- GAS Webアプリが「自分として実行」「全員アクセス」でデプロイされている。
- 水曜日・木曜日、初回・再アクセス、コード未登録、連打/複数タブ、当選上限をステージングで確認する。
- 375px、390px、414pxとアプリ内WebViewで横スクロール・文字切れ・コード表示崩れがない。

## 制約

deviceIdはブラウザーの`localStorage`に保存されます。ストレージ削除、シークレットモード、別ブラウザーや端末では別ユーザーとして扱われる可能性があります。ログインや個人情報を使った本人確認は行いません。
