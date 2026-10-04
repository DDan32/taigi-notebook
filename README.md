# 台語生字簿

學台語用的網站，主要給手機和平板用。純靜態網頁：沒有伺服器、沒有帳號、沒有追蹤，你記的東西只存在自己的裝置上。

- **轉換**：輸入華語句子，逐詞對應成台語的說法；也可以直接輸入台語漢字或台羅（`gua2 beh4 khi3` 這種數字調也行）。
  每個音節標出本調和變調後的聲調，讀本調的字畫底線。每個詞都可以換說法、改發音、改聲調、前後移動。
  台羅、數字調、變調後的實際讀音、漢字各有一個複製鈕。
- **逐詞聽**：轉換結果可以依序播放每個詞的錄音（切掉頭尾靜音、接得緊一點）。教育部的錄音是各詞單獨唸的本調，
  沒有變調後的版本，所以播放時畫面會同步標出每個詞「實際要唸成」的變調後讀音，請看著它唸；沒有錄音的詞會跳過並列出。
- **辭典**：用台語漢字、華語，或台羅（調符、數字調、不標調都可以）查教育部辭典。詞條和例句都有錄音，點一下就在網站裡播放。
- **諺語**：用意思（或相近的意思）找辭典附錄的 468 句諺語，例如「夫妻吵架」「做事半途而廢」；也可以打諺語裡的字或台羅。
  在「轉換」頁輸入的句子如果意思接近某句諺語，也會列出來。
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
- `data/synonyms.json`、`data/proverb_kw.json`：諺語「意思」搜尋用的同義詞和關鍵詞。同義詞一部分從辭典釋義裡並列的詞整理，一部分是
  `tools/synonyms_hand.tsv` 手排的；關鍵詞是 `tools/proverb_keywords.tsv`，由 Claude 逐句讀過釋義後，用日常白話寫的（468 句各 6–12 個）。
  它們只影響搜尋，不會當成辭典的釋義顯示。
  這個搜尋找的是關鍵字加相近說法，不是真的理解語意。品質用 `node tests/proverb.eval.js` 量：自己寫的兩組測試題前 5 名都找得到，
  但那些題目和關鍵詞出自同一人之手，所以這個數字偏樂觀；較客觀的是用辭典自己標的近義諺語來量（116 句裡 70 句的前 5 名找得到）。

## 錄音

詞條（22,298 個）和例句（17,907 句）的錄音是教育部的（同一個授權），原檔共 870 MB，太大，所以：

- 用 `tools/build_audio.py` 轉成單聲道 32 kbps、22.05 kHz 的 MP3（414 MB；音高保留，聲調靠它），並逐一驗證能解碼、長度對得上。
- 放在**另一個倉庫** `taigi-audio`（同一帳號的 GitHub Pages），不放進這個倉庫，這個倉庫才不會又大又慢。
  網站在 `https://<帳號>.github.io/` 上時，自動從 `https://<帳號>.github.io/taigi-audio/` 取音檔；
  在別的地方（例如 Claude 的 Artifact）沒有音檔，播放鈕就不會出現。
- `tools/check_audio.py` 檢查錄音有沒有對到正確的詞：例句錄音的長度和音節數相關係數 0.98。
- 本機測試：把轉好的資料夾連到 `audio`（`ln -s <資料夾> audio`，已在 .gitignore），網站在 localhost 時會從那裡讀。

程式碼的授權還沒有指定。

## 檔案

```
index.html            網站（由 src/page.html 產生，不要直接改）
src/page.html         頁面原始檔：標題、樣式、畫面骨架（Claude Artifact 格式，同一份也能發布成 Artifact）
js/tailo.js           台羅解析、數字調 ↔ 調符
js/sandhi.js          變調規則
js/dict.js            辭典查詢
js/proverb.js         諺語搜尋（意思、相近說法、台語漢字、台羅）
js/audio.js           錄音的網址（只用驗證過的數字拼）與播放
js/view-proverb.js    「諺語」分頁
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

教育部更新辭典之後，下載新的 `kautian.ods`（錄音另有 `sutiau-mp3.zip`、`leku-mp3.zip`）：

```bash
python3 tools/ods_to_raw.py ~/Downloads/kautian.ods raw   # 試算表 → raw/*.json
python3 tools/build_data.py --report                      # raw/ → data/，並印出常用華語詞的對應結果
node tools/build_widget.js                                # data/ → widget/TaigiDaily.js
python3 tools/build_audio.py <sutiau-mp3 資料夾> <leku-mp3 資料夾> <輸出資料夾> --verify    # 錄音（要有 ffmpeg）
python3 tools/build_site.py
sh tests/run.sh
```

辭典新增諺語時，`build_data.py` 會列出還沒有關鍵詞的句子，補進 `tools/proverb_keywords.tsv` 即可。
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
- 錄音只有辭典的詞條和例句：轉換結果的「逐詞聽」是詞的拼接，聲調是本調，不是自然的整句；變調要看畫面上的標示。
- 一次轉換最多 500 字。
