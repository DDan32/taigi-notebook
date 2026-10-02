# 安全

## 這個網站是什麼，所以風險在哪

純靜態網頁：沒有伺服器程式、沒有登入、沒有 cookie、沒有追蹤或統計、不會把你記的東西傳到任何地方。
所以「被入侵、資料被偷」的路徑很短，主要剩下三條：

1. 有人讓網頁執行不屬於它的程式碼（XSS）。能做什麼：讀走你瀏覽器裡的生字簿、改掉畫面。
2. 有人拿一份惡意的備份或損壞的儲存資料餵給它，讓它壞掉或卡死。
3. 倉庫或 GitHub 帳號被拿下，網站內容被換掉。這條最嚴重，防線在帳號設定，見最後一節。

## 已做的防護

**不讓外來文字變成程式碼**

- 畫面全部用 `textContent` 和文字節點組出來，整個程式沒有 `innerHTML`、`eval`、`document.write`、`new Function`、字串版的 `setTimeout`。
  `tests/security.test.js` 掃原始碼，出現就失敗。
- 建立元素的函式 `h()`（`js/ui.js`）拒絕事件屬性（`onclick=` 之類）、`style=`、`srcdoc`，也拒絕 `javascript:`、`data:`、`http:` 網址。
  開新分頁的連結一律帶 `rel="noopener noreferrer"`。
- 內容安全政策（CSP）寫在 `index.html` 最前面：`default-src 'none'`；腳本只准自己網域的檔案，不准內嵌、不准 `eval`；
  只准連回自己（`connect-src 'self'`）；不准 iframe、`<base>`、表單送出；樣式只准自己、兩段以雜湊值核可的內嵌樣式、和 Google Fonts。
  在瀏覽器裡試過：內嵌腳本、`onclick=`、`javascript:` 連結、`eval`、外部腳本、對外連線、對外圖片請求、iframe、行內樣式、`<base>` 全部被擋，
  而網頁自己正常使用時沒有任何一次違規。
- 防點擊劫持：被嵌進別人網頁時整頁隱藏並試著跳出（`js/frameguard.js`）。GitHub Pages 不能設 `X-Frame-Options`，所以用這個方式。

**不信任進來的資料**（`js/store.js`）

進來的資料有三個來源：瀏覽器儲存空間、匯入的備份、雲端資料庫（只在 Claude Artifact 版本）。一律先過濾才會用：

- 每個欄位檢查型別、長度、數值範圍；不合的丟掉或改成預設值；空白的詞條整筆不收。
- `__proto__`、`constructor`、`prototype` 當鍵名一律拒絕；資料都放在沒有原型的物件裡，不可能改動別的物件的行為。
- 時間戳不能超過「現在 + 1 天」。否則一筆偽造的資料可以永遠蓋過之後所有的修改。
- 備份超過 8 MB 不收；詞數、句數有上限；轉換一次最多 500 字、各輸入框有長度上限。
- 瀏覽器不讓網頁存資料時（無痕模式、空間滿）會明確警告，不會默默弄丟。

**開發與小工具**

- 辭典轉檔工具 `tools/ods_to_raw.py` 讀檔前先檢查解壓後大小和壓縮比，擋壓縮炸彈。
- iPhone 小工具從剪貼簿匯入生字簿時只收字串、限長度和數量、超過 200 KB 不收。
- 專案不用任何第三方套件（沒有 npm、沒有 pip 依賴），沒有供應鏈可被下毒。腳本只從自己的網域載入。

## 怎麼自己驗證

```bash
sh tests/run.sh
```

這會跑原始碼掃描、毒資料測試（含「`__proto__`」、巨大字串、錯誤型別、偽造時間戳）、
建置後 `index.html` 的政策檢查（含雜湊值是否過期）、以及 2500 組隨機亂打。

真的瀏覽器裡的攻擊測試是 `tests/browser-xss.js`：用 14 種攻擊字串（`<img onerror>`、`<script>`、`javascript:`、
屬性逃逸、`__proto__`⋯）打進每一個接受文字的地方，每一步之後掃描頁面有沒有被插入元素或事件屬性。
腳本裡有正向對照（字串真的出現在畫面上）和負向對照（偵測器抓得到故意注入的元素），所以「零次執行」才有意義。

## 做不到的事

- GitHub Pages 不能自訂 HTTP 標頭，所以 `frame-ancestors`、`X-Content-Type-Options`、`Permissions-Policy` 這些只能靠標頭的保護在 GitHub Pages 上沒有。
  `_headers` 已經把完整的標頭備好，搬到 Cloudflare Pages 或 Netlify 就會生效。
- 同一個 GitHub 帳號的 Pages 網站共用 `<帳號>.github.io` 這個網域，也共用 localStorage。
- 字型來自 Google Fonts：Google 會看到訪客的 IP。要避免，得把字型存成自己的檔案，會讓倉庫多幾 MB。
- 變調、華語對應是推算的，會錯。那是學習內容的正確性，不是安全問題，但請別當成權威。
- 這個專案沒有找人做過獨立的資安審查，上面的驗證是作者自己做的。

## 回報問題

請用 GitHub 的私人漏洞回報（倉庫的 Security → Report a vulnerability），不要開公開的 issue。

## 給倉庫擁有者：只有你能做的帳號設定

網站本身再嚴，帳號被拿下就全沒有意義。這些我沒有辦法（也不應該）替你設定：

1. 開啟雙重驗證，最好用 passkey 或安全金鑰：<https://github.com/settings/security>
2. 檢查登入中的裝置：<https://github.com/settings/sessions>，不認得的登出。
3. 檢查授權過的 App 和 token：<https://github.com/settings/applications> 與 <https://github.com/settings/tokens>，不再使用的撤銷。
   `gh` 命令列工具的授權目前含 `repo` 和 `workflow`，權限很大；換電腦或不再使用時用 `gh auth logout`。
4. 不要把 token、密碼、金鑰貼進任何檔案或 issue。這個倉庫啟用了 secret scanning 和 push protection，會擋常見格式，但擋不了全部。
5. GitHub 信箱設定裡開「Keep my email addresses private」（提交用 noreply 信箱，你已經是了）。
