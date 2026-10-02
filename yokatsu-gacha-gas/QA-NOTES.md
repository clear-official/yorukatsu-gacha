# QA記録

## 確認済み

- 提供された4つの画像素材をコピーし、元画像と同一ハッシュであることを確認
- HTML、CSS、JavaScript、GAS、Bridge、マニフェスト、手順書を作成
- クライアント側に当選確率・キャンペーンコード・管理用データがないことを静的に確認
- GAS側で水曜判定、week_id生成、deviceId検証、参加済み検索、確率抽選、当選上限、コード未登録停止を実装
- `LockService.getScriptLock()`内で参加確認・当選者数確認・抽選・追記を行う構造を静的確認
- コードは当選時のレスポンスだけに含め、0ptレスポンスに含めない実装を静的確認
- テスト用履歴を`TestResults`へ分離する実装を静的確認
- `node --check app.js`に相当するJavaScript構文確認
- GAS関数をGoogle Sheets/LockServiceのモック上で実行し、水曜status、当選とコード再表示、0ptでのコード非返却、同一deviceIdの二重登録防止、コード未登録時の停止、不正deviceId拒否、木曜のstatus/draw拒否、テスト履歴分離、当選上限を確認
- ローカルのモックブリッジ経由で画面を開き、CTAから当選カードへ遷移すること、長いコードの表示を確認
- ローカル表示で375pxを目視し、375/390/414pxで横はみ出しがないことを確認。長いコードでもカード内に折り返すことを確認

## 静的確認のみ

- HTML要素と画面状態の対応、コード文字列の折り返し設定、375/390/414px用CSSブレークポイント
- GASソースの公開関数・非公開ヘルパーの分離、一般化したエラー応答、送信元オリジン照合
- Sheetsの設定キー、コード列、結果列の対応
- ブラウザーコンソールにMutationObserverの対象Nodeエラーが1件記録されました。納品コードにMutationObserverは含まれていないため、ブラウザー自動化側を含む発生元をこの環境では特定できていません。実環境でもコンソールを再確認してください。

## 実環境で要確認

- Apps Scriptエディターでの保存・実行・Google権限承認、`setupSheets()`の実行
- Webアプリ公開権限とiframeからの`google.script.run`通信
- `allowed_origin`、GAS URLを設定したGitHub Pagesからのstatus/draw往復
- 水曜日の初回抽選、0/100pt結果、再アクセス、翌週の参加、木〜火の拒否、API直アクセス相当の拒否
- deviceId不正値、空欄、長すぎる値、通信タイムアウト後のstatus復元
- 連打・複数タブ・100人上限到達直前の同時実行
- CampaignCodes未登録/重複時の停止とStatusシート表示
- 375px、390px、414px、アプリ内WebView、PCでの視覚確認とコンソール/GAS実行ログ
- テストモードON/OFFの切り替え、100pt固定コード、TestResultsとResultsの分離

この作業環境にはGoogle Apps Script、Googleアカウント、GitHub Pages公開環境がないため、実通信・スプレッドシート処理・実機表示は未確認です。上記を「確認済み」とは扱っていません。
