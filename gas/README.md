# GASコード一式

このフォルダー内の5つの `.gs` ファイル、`Bridge.html`、`appsscript.json` を、同じApps Scriptプロジェクトへ反映します。手順は [SETUP.md](SETUP.md)、シートの列構成は [../SHEETS.md](../SHEETS.md) を参照してください。

`setup()` は見出しを作成しますが、当選確率・開催時刻・上限・正式コードは設定しません。値が未確定のまま抽選を公開しないでください。

`tests/night-gacha.test.mjs` はNode.jsで模擬シートを使うローカル確認です。実Google Sheetsの通信確認にはなりません。
