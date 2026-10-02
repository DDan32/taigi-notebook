# 台語生字簿

學台語用的網站，主要給手機和平板用。純靜態網頁：沒有伺服器、沒有帳號、沒有追蹤，你記的東西只存在自己的裝置上。

- **轉換**：輸入華語句子，逐詞對應成台語的說法；也可以直接輸入台語漢字或台羅（`gua2 beh4 khi3` 這種數字調也行）。
  每個音節標出本調和變調後的聲調，讀本調的字畫底線。每個詞都可以換說法、改發音、改聲調、前後移動。
  台羅、數字調、變調後的實際讀音、漢字各有一個複製鈕。
- **辭典**：用台語漢字、華語，或台羅（調符、數字調、不標調都可以）查教育部辭典。
- **生字簿**：自己記上課遇到的詞；辭典裡有的詞可以直接引用。也放收藏的句子。
- **複習**：今日一詞，加上生字簿的間隔複習。
- **更多**：聲調設定與聲調表、我的更正、備份、iPhone／iPad 小工具。

在 iPhone／iPad 的 Safari 開啟後，用「分享 → 加入主畫面」，就會像 App 一樣全螢幕開啟。

## 資料來源與授權

詞條、釋義、例句出自教育部《臺灣台語常用詞辭典》<https://sutian.moe.edu.tw/>，
依「創用CC 姓名標示-禁止改作 3.0 臺灣」授權使用。`data/dict.json`、`data/examples.json`
只是把官方的 `kautian.ods` 換成網頁好讀的格式，內容沒有改寫；官方的 `kautian.ods` 本身不放在這個倉庫裡，要更新請到
<https://sutian.moe.edu.tw/zh-hant/siongkuantsuguan/> 下載。**這不是教育部的網站。**

以下是這個專案**自己推算**的，不是辭典原有的內容，會有錯：

- `data/huayu.json`：華語→台語的對應。辭典的下載檔沒有「對應華語」這張表，
  所以是從釋義裡的華語解釋、例句的華語翻譯（統計哪個華語詞和哪個台語詞一起出現）、
  詞彙比較表、臺華共同詞整理出來的，再加上 `tools/hand_map.tsv` 裡手排的常用詞。
- 變調：台語哪裡讀本調由句法決定。`js/sandhi.js` 用詞性做近似判斷
  （句尾、輕聲前、名詞結尾、「的」前面讀本調；代名詞、動詞、副詞等變調）。
  臺華共同詞在辭典裡沒有詞性，`tools/pos_overrides.tsv` 是另外補的提示，只用來判斷變調。
- `data/daily.json`：今日一詞的清單（730 個有例句的常用詞）。

程式碼的授權還沒有指定。

## 檔案

```
index.html            網站（由 src/page.html 產生，不要直接改）
src/page.html         頁面原始檔：標題、樣式、畫面骨架（Claude Artifact 格式，同一份也能發布成 Artifact）
js/tailo.js           台羅解析、數字調 ↔ 調符
js/sandhi.js          變調規則
js/dict.js            辭典查詢
js/convert.js         斷詞與逐詞對應
js/store.js           設定、更正、生字簿；所有外來資料都先在這裡過濾
js/srs.js             複習排程、今日一詞
js/ui.js, view-*.js   畫面
js/frameguard.js      被嵌進別人網頁時整頁隱藏
data/                 tools/build_data.py 產生
widget/TaigiDaily.js  tools/build_widget.js 產生（Scriptable 小工具）
_headers              同一份安全政策，寫成 HTTP 標頭（Cloudflare Pages、Netlify 會用；GitHub Pages 不會）
SECURITY.md           防護內容、做不到的事、回報方式
tools/                建置程式與手寫的對照表
tests/                測試
```

## 改了之後

改頁面（`src/page.html`）或 `js/` 之後：

```bash
python3 tools/build_site.py      # 重新產生 index.html，連同內容安全政策
sh tests/run.sh                  # 全部測試
```

`build_site.py` 會算出內嵌樣式的雜湊值寫進政策；頁面如果加了內嵌腳本、`onclick=`、`style=` 屬性、或連到別的網站的資源，
它會直接拒絕建置，因為那些在政策下本來就會被擋掉。

教育部更新辭典之後，下載新的 `kautian.ods`：

```bash
python3 tools/ods_to_raw.py ~/Downloads/kautian.ods raw   # 試算表 → raw/*.json
python3 tools/build_data.py --report                      # raw/ → data/，並印出常用華語詞的對應結果
node tools/build_widget.js                                # data/ → widget/TaigiDaily.js
python3 tools/build_site.py
sh tests/run.sh
```

只需要 Python 3 和 Node，沒有任何套件要安裝。`raw/` 用完可以刪掉。

## 在 GitHub Pages 上

倉庫根目錄就是網站，Pages 設成「Deploy from a branch → main → / (root)」即可，不需要 GitHub Actions。
網址是 `https://<帳號>.github.io/<倉庫名>/`。

注意幾件事：

- 生字簿存在**那台裝置的瀏覽器**（localStorage），不會跨裝置同步。Safari 會清掉久沒開啟的網站的資料，
  加到主畫面的不會。請用「更多 → 複製備份」定期備份。
- 同一個 GitHub 帳號底下的所有 Pages 網站共用同一個網域（`<帳號>.github.io`），也就共用 localStorage。
  之後如果在同一帳號放別的網站，那個網站有任何程式漏洞，都可能讀到這裡的生字簿。
- 字型 Iansui 來自 Google Fonts，所以第一次開啟時 Google 會看到你的 IP。其他一切都在自己的網域。

## iPhone／iPad 小工具

網頁沒辦法變成主畫面小工具。`widget/TaigiDaily.js` 是給免費的 Scriptable App 用的程式，
每天顯示一個詞（和網站的今日一詞同一個）。安裝步驟在網站的「更多」分頁。
這支程式在電腦上用模擬的 Scriptable 環境測過（`tests/widget.test.js`），還沒有在實機上跑過。

## 已知的限制

- 轉換是逐詞對應，不是翻譯：語序、句型、量詞不會自動調整。
- 變調是推算的，句法複雜時會錯；錯的地方點那個詞就能改，收藏句子會連同更正一起留下。
- 辭典沒收的詞（專有名詞、新詞）會逐字拼讀，並標成虛線框提醒確認。
- 沒有發音。每個詞條都有連到教育部辭典的連結，那裡可以聽。
- 一次轉換最多 500 字。
