# GA4 監控安裝說明

已為所有 HTML 頁面插入：

```html
<script src="assets/js/ga4-monitor.js" defer></script>
```

## 你只需要做 1 件事

打開 `assets/js/ga4-monitor.js`，把：

```js
const GA4_MEASUREMENT_ID = 'G-K4G2M1F8M7';
```

替換成你的 GA4 Measurement ID，例如：

```js
const GA4_MEASUREMENT_ID = 'G-ABC123DEFG';
```

## 已監控的核心事件

- `view_agency`：中介詳情頁載入完成
- `search`：首頁、中介目錄、指南/FAQ 搜尋
- `filter_agencies`：中介目錄地區/類型/排序篩選
- `select_agency`：點擊中介卡片進入詳情
- `reveal_phone` / `phone_click`：顯示或撥打電話
- `contact_agency`：點擊 email
- `open_map`：打開高德地圖導航
- `share_agency`：分享、保存海報、複製連結
- `start_review`：點擊去寫評價
- `submit_review_attempt`：嘗試提交評價
- `submit_review_success`：評價成功提交
- `submit_review_error`：評價提交或驗證失敗
- `sort_ranking`：排行榜排序
- `faq_open` / `faq_expand_all`：指南 FAQ 互動
- `contact_page_view` / `wechat_qr_view`：客服頁與微信 QR 曝光
- `profile_review_filter`：個人頁評價篩選
- `navigation_click` / `external_link_click`：主要導航與外部連結
- `scroll_depth`：25%、50%、75%、90% 滾動深度
