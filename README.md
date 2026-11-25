# GitDesk

簡易 GitHub 管理兼推送工具（Python + pywebview）。

## 執行
1. 安裝 Python 3 與 Git
2. `pip install -r requirements.txt`
3. 雙擊 `GitDesk.pyw`（或 `pythonw GitDesk.pyw`）

## 結構
- `GitDesk.pyw`　入口
- `modules/`　config（設定）、git_ops（Git 指令）、github（GitHub API）、fs（資料夾操作）、terminal（終端機）、api（給前端呼叫）
- `web/`　index.html、css/style.css、js/app.js、js/mock.js（用瀏覽器直接開 index.html 時的預覽資料）

## 修改 commit 訊息
按推送按鈕右邊的 ▾ →「修改 commit 訊息」。只能改**已提交但尚未推送**的提交（已推送的不能改，選項會變灰）。可選任一筆未推送提交；較舊的那筆被改後，它之後的未推送提交會一併重新產生（內容不變、hash 改變）。過程不會動到工作目錄與暫存區，也不會自動推送。

## 終端機（xterm.js）
終端機分頁用 xterm.js 顯示，後端用 pywinpty。程式會先讀 `web/vendor/` 的本機檔案，找不到才從 CDN（jsdelivr）載入，所以第一次使用需要連網。
想離線使用：把下列三個檔案放進 `web/vendor/`
- `xterm.js`、`xterm.css`：npm 套件 `@xterm/xterm@5.5.0` 的 `lib/xterm.js`、`css/xterm.css`
- `addon-fit.js`：npm 套件 `@xterm/addon-fit@0.10.0` 的 `lib/addon-fit.js`

設定檔：`%APPDATA%\GitDesk\settings.json`（含 Token，請勿上傳）。
