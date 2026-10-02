# スプレッドシート構成

GASの`setup()`が以下のタブと見出しを自動作成します。紐づけ型GASでは対象スプレッドシートのIDをScript Propertiesの`SPREADSHEET_ID`に保存します。単独型GASでは、先に同じプロパティへIDを登録してから`setup()`を実行します。既存タブの見出しが異なる場合は上書きせず停止します。

## Settings

| 列A: key | 列B: value |
|---|---|
| win_probability | 0.30 |
| weekly_winner_limit | 100 |
| timezone | Asia/Tokyo |
| test_mode | OFF |
| test_result | 空欄 / 100 / 0 |
| test_campaign_code | 空欄またはテスト専用コード |
| allowed_origin | https://YOURNAME.github.io |

既存設定は維持され、不足キーだけを追記します。GASは確率を0〜1、上限を1〜100、日本時間に限定して検証します。

## CampaignCodes

| 列A: week_id | 列B: campaign_code |
|---|---|
| 2026-10-07 | YK100A |

水曜日の日付を1週につき1行で登録します。1つのweek_idに複数コード、または同じコードを複数週で使っている場合は、その週の抽選を安全側に停止します。

## Results / TestResults

両タブの列は同じです。

| timestamp | week_id | device_id | result | campaign_code |
|---|---|---|---:|---|

本番結果は`Results`、テスト結果は`TestResults`へ分けて追記します。100pt未当選の行にはキャンペーンコードを保存しません。

## Status

次回水曜日の日付、該当コードの登録状況、他週とのコード重複、テストモードを確認する数式付き管理タブです。「未登録」「コード未入力」「重複・要確認」が出た場合は本番抽選できません。
