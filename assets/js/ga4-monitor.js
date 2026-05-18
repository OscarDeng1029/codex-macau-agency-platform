/*
 * 澳門家傭點評網 GA4 監控核心
 * 安裝：把本檔放到 assets/js/ga4-monitor.js，並在所有 HTML 的 </head> 前引入：
 * <script src="assets/js/ga4-monitor.js" defer></script>
 *
 * 只需修改下面這個 Measurement ID。
 */
(function () {
  'use strict';

  const GA4_MEASUREMENT_ID = 'G-K4G2M1F8M7'; // TODO: 換成你的 GA4 Measurement ID，例如 G-ABC123DEFG
  const ENABLE_DEBUG_LOG = false;
  const SEND_CUSTOM_SCROLL_MILESTONES = true;

  const PAGE_TYPE_MAP = {
    '': 'home',
    'index.html': 'home',
    'agencies.html': 'agency_directory',
    'agency.html': 'agency_detail',
    'ranking.html': 'ranking',
    'review.html': 'review_submission',
    'legal.html': 'guide',
    'profile.html': 'profile',
    'contact.html': 'contact',
    'about.html': 'about',
    'terms.html': 'terms',
    'disclaimer.html': 'disclaimer'
  };

  const trackedSearchValues = new Map();
  const trackedOnce = new Set();
  const firedScrollMilestones = new Set();

  function fileName() {
    const name = window.location.pathname.split('/').pop() || 'index.html';
    return name;
  }

  function pageType() {
    return PAGE_TYPE_MAP[fileName()] || 'other';
  }

  function urlParam(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  }

  function cleanText(value, maxLength = 80) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .slice(0, maxLength);
  }

  function safeSearchTerm(value) {
    const term = cleanText(value, 80);
    if (!term) return '';

    // 避免把電話、email、長串 ID 直接送入 GA4。
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const phonePattern = /(?:\+?853)?\s?[2368]\d{3}\s?\d{4}|\d{7,}/;
    const longIdPattern = /[a-f0-9]{16,}|[A-Z0-9_-]{20,}/i;

    if (emailPattern.test(term)) return '[redacted_email]';
    if (phonePattern.test(term)) return '[redacted_phone]';
    if (longIdPattern.test(term)) return '[redacted_id]';
    return term;
  }

  function numericText(value) {
    const num = Number(String(value || '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(num) ? num : undefined;
  }

  function getResultCount() {
    const resultCount = document.getElementById('resultCount');
    if (!resultCount) return undefined;
    return numericText(resultCount.innerText);
  }

  function getAgencyIdFromUrlOrHref(href) {
    try {
      const url = href ? new URL(href, window.location.href) : window.location;
      return url.searchParams.get('id') || url.searchParams.get('agency_id') || '';
    } catch (e) {
      return '';
    }
  }

  function getCurrentAgencyId() {
    return urlParam('id') || getAgencyIdFromUrlOrHref(window.location.href);
  }

  function getCurrentAgencyName() {
    return cleanText(
      document.getElementById('detail-name')?.innerText ||
      document.getElementById('targetAgencyName')?.innerText ||
      document.querySelector('[data-agency-name]')?.getAttribute('data-agency-name') ||
      '',
      100
    );
  }

  function getClosestText(el, maxLength = 120) {
    if (!el) return '';
    return cleanText(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '', maxLength);
  }

  function getLinkContext(anchor) {
    const href = anchor?.getAttribute('href') || '';
    const text = getClosestText(anchor, 100);
    const url = (() => {
      try { return new URL(href, window.location.href); } catch (e) { return null; }
    })();

    return {
      link_text: text,
      link_url_path: url ? `${url.pathname}${url.hash || ''}` : href.slice(0, 100),
      link_domain: url ? url.hostname : '',
      destination_page: url ? ((url.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'home') : '',
      is_external: url ? url.hostname !== window.location.hostname : false
    };
  }

  function baseParams(extra) {
    return Object.assign({
      page_type: pageType(),
      page_path: window.location.pathname,
      page_title: document.title,
      device_viewport: window.innerWidth < 768 ? 'mobile' : 'desktop'
    }, extra || {});
  }

  function debugLog(eventName, params) {
    if (!ENABLE_DEBUG_LOG) return;
    // eslint-disable-next-line no-console
    console.log('[GA4]', eventName, params || {});
  }

  function loadGA4() {
    if (!GA4_MEASUREMENT_ID || GA4_MEASUREMENT_ID === 'G-XXXXXXXXXX') {
      // 沒有填 ID 時仍然保留 dataLayer，方便本地測試與 GTM 接管。
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      debugLog('ga4_not_loaded_missing_measurement_id', {});
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

    if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`;
      document.head.appendChild(script);
    }

    window.gtag('js', new Date());
    window.gtag('config', GA4_MEASUREMENT_ID, {
      send_page_view: true,
      page_title: document.title,
      page_path: `${window.location.pathname}${window.location.search}`,
      transport_type: 'beacon'
    });
  }

  function track(eventName, params) {
    if (!eventName) return;
    const payload = baseParams(params);
    debugLog(eventName, payload);

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, payload));

    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, Object.assign({ transport_type: 'beacon' }, payload));
    }
  }

  function trackOnce(key, eventName, params) {
    if (trackedOnce.has(key)) return;
    trackedOnce.add(key);
    track(eventName, params);
  }

  window.MAPGA4 = {
    track,
    trackOnce,
    pageType,
    getCurrentAgencyId,
    getCurrentAgencyName,
    safeSearchTerm
  };

  function bindSearchInput(input, source, options) {
    if (!input) return;
    const minLength = options?.minLength ?? 1;
    const debounceMs = options?.debounceMs ?? 700;
    const fireOnInput = options?.fireOnInput ?? false;
    let timer = null;

    function emit(trigger) {
      const term = safeSearchTerm(input.value);
      if (!term || term.length < minLength) return;
      const key = `${source}:${term}:${trigger}`;
      if (trackedSearchValues.get(source) === key) return;
      trackedSearchValues.set(source, key);
      track('search', {
        search_term: term,
        search_source: source,
        search_trigger: trigger,
        result_count: getResultCount()
      });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') emit('enter');
    });

    if (fireOnInput) {
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => emit('input_debounce'), debounceMs);
      });
    }

    return emit;
  }

  function bindHomeSearch() {
    const desktopInput = document.getElementById('desktopSearchInput');
    const mobileInput = document.getElementById('mobileSearchInput');
    const desktopEmit = bindSearchInput(desktopInput, 'home_desktop', { minLength: 1 });
    const mobileEmit = bindSearchInput(mobileInput, 'home_mobile', { minLength: 1 });

    document.getElementById('desktopSearchBtn')?.addEventListener('click', () => desktopEmit && desktopEmit('button'));
    document.getElementById('mobileSearchBtn')?.addEventListener('click', () => mobileEmit && mobileEmit('button'));

    document.querySelectorAll('.quick-search-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const term = safeSearchTerm(getClosestText(btn, 50));
        if (!term) return;
        track('search', {
          search_term: term,
          search_source: 'home_quick_chip',
          search_trigger: 'quick_chip'
        });
      });
    });
  }

  function bindDirectoryTracking() {
    const input = document.getElementById('directorySearch');
    bindSearchInput(input, 'agency_directory', { minLength: 2, debounceMs: 850, fireOnInput: true });

    document.querySelectorAll('.dropdown-option').forEach((option) => {
      option.addEventListener('click', () => {
        const wrap = option.closest('[id^="wrap-"]');
        const filterName = wrap ? wrap.id.replace('wrap-', '') : 'unknown';
        setTimeout(() => {
          track('filter_agencies', {
            filter_name: filterName,
            filter_value: option.dataset.value || getClosestText(option, 50),
            filter_label: getClosestText(option, 50),
            result_count: getResultCount()
          });
        }, 0);
      });
    });

    document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
      track('load_more_agencies', { result_count: getResultCount() });
    });
  }

  function bindRankingTracking() {
    document.querySelectorAll('.sort-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTimeout(() => {
          track('sort_ranking', {
            sort_type: btn.dataset.sort || getClosestText(btn, 50)
          });
        }, 0);
      });
    });
  }

  function bindGuideTracking() {
    bindSearchInput(document.getElementById('faqSearch'), 'guide_faq', { minLength: 2, debounceMs: 850, fireOnInput: true });
    bindSearchInput(document.getElementById('global-mobile-search'), 'guide_mobile_global', { minLength: 2, debounceMs: 850, fireOnInput: true });
    bindSearchInput(document.getElementById('desktop-global-search'), 'guide_desktop_global', { minLength: 2, debounceMs: 850, fireOnInput: true });

    document.getElementById('showMoreFaq')?.addEventListener('click', () => {
      track('faq_expand_all', { section: 'faq' });
    });

    // FAQ 是動態生成的，用事件代理處理。
    document.addEventListener('click', (e) => {
      const faqItem = e.target.closest?.('.faq-item');
      if (!faqItem) return;
      const title = cleanText(faqItem.querySelector('h3, h4, .font-bold')?.innerText || faqItem.innerText, 120);
      track('faq_open', {
        faq_title: title,
        section: 'faq'
      });
    });
  }

  function bindReviewTracking() {
    const agencyId = getCurrentAgencyId();
    trackOnce(`review_page:${agencyId || 'unknown'}`, 'start_review_page_view', {
      agency_id: agencyId,
      agency_name: getCurrentAgencyName()
    });

    document.addEventListener('click', (e) => {
      const starBtn = e.target.closest?.('.star-btn');
      if (starBtn) {
        const group = starBtn.closest('[id$="StarGroup"]');
        const groupId = group?.id || '';
        const metricMap = {
          mainStarGroup: 'overall',
          tStarGroup: 'transparency',
          sStarGroup: 'speed',
          aStarGroup: 'attitude'
        };
        track('review_rating_select', {
          agency_id: agencyId,
          rating_metric: metricMap[groupId] || groupId || 'unknown',
          rating_value: Number(starBtn.dataset.value || 0)
        });
        return;
      }

      const tagBtn = e.target.closest?.('.tag-btn');
      if (tagBtn) {
        setTimeout(() => {
          track('review_tag_toggle', {
            agency_id: agencyId,
            tag_label: cleanText(tagBtn.innerText, 50),
            selected: tagBtn.classList.contains('selected')
          });
        }, 0);
      }
    });

    document.getElementById('privacyConsent')?.addEventListener('change', (e) => {
      track('review_privacy_consent', {
        agency_id: agencyId,
        consent_checked: Boolean(e.target.checked)
      });
    });

    document.getElementById('submitBtn')?.addEventListener('click', () => {
      const text = document.getElementById('reviewText')?.value || '';
      track('submit_review_attempt', {
        agency_id: agencyId,
        rating: Number(document.getElementById('ratingValue')?.value || 0),
        transparency: Number(document.getElementById('metric-transparency')?.value || 0),
        speed: Number(document.getElementById('metric-speed')?.value || 0),
        attitude: Number(document.getElementById('metric-attitude')?.value || 0),
        has_text: text.trim().length > 0,
        text_length_bucket: getTextLengthBucket(text),
        tag_count: document.querySelectorAll('.tag-btn.selected').length,
        consent_checked: Boolean(document.getElementById('privacyConsent')?.checked)
      });
    });
  }

  function getTextLengthBucket(text) {
    const len = String(text || '').trim().length;
    if (len === 0) return '0';
    if (len < 50) return '1_49';
    if (len < 200) return '50_199';
    return '200_plus';
  }

  function bindProfileTracking() {
    document.addEventListener('click', (e) => {
      const chip = e.target.closest?.('.filter-chip');
      if (!chip) return;
      setTimeout(() => {
        track('profile_review_filter', {
          filter_label: getClosestText(chip, 50)
        });
      }, 0);
    });
  }

  function bindContactTracking() {
    trackOnce('contact_page_view', 'contact_page_view', {
      contact_type: urlParam('type') || 'general',
      source_agency_id: urlParam('id') || ''
    });

    const qr = document.querySelector('img[alt*="微信"], .qr-box img');
    if (!qr) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          trackOnce('wechat_qr_view', 'wechat_qr_view', {
            contact_type: urlParam('type') || 'general'
          });
          observer.disconnect();
        }
      });
    }, { threshold: 0.5 });
    observer.observe(qr);
  }

  function readAgencyDetailSnapshot() {
    const agencyId = getCurrentAgencyId();
    const agencyName = getCurrentAgencyName();
    const rating = numericText(document.getElementById('detail-rating')?.innerText);
    const countText = document.getElementById('detail-count')?.innerText || document.getElementById('detail-count-mobile')?.innerText || '';
    const reviewCount = numericText(countText);
    const license = cleanText(document.getElementById('detail-license')?.innerText || '', 80).replace(/^牌照編號：?/, '');
    const address = cleanText(document.getElementById('detail-address-sidebar')?.innerText || document.getElementById('detail-address-mobile')?.innerText || '', 100);

    return {
      agency_id: agencyId,
      agency_name: agencyName,
      agency_license: license,
      avg_rating: rating,
      review_count: reviewCount,
      has_address: Boolean(address)
    };
  }

  function watchAgencyDetailLoaded() {
    if (pageType() !== 'agency_detail') return;

    const tryTrack = () => {
      const realContent = document.getElementById('real-content');
      const name = getCurrentAgencyName();
      const countText = document.getElementById('detail-count')?.innerText || '';
      const statsReady = /已審核|文字/.test(countText);
      if (!realContent || realContent.classList.contains('hidden') || !name || !statsReady) return false;
      const snapshot = readAgencyDetailSnapshot();
      trackOnce(`view_agency:${snapshot.agency_id || name}`, 'view_agency', snapshot);
      return true;
    };

    if (tryTrack()) return;

    const observer = new MutationObserver(() => {
      if (tryTrack()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    setTimeout(() => {
      tryTrack();
      observer.disconnect();
    }, 10000);
  }

  function wrapFunction(name, eventName, getParams) {
    const original = window[name];
    if (typeof original !== 'function' || original.__ga4Wrapped) return;

    const wrapped = function () {
      try {
        track(eventName, typeof getParams === 'function' ? getParams.apply(this, arguments) : {});
      } catch (e) {}
      return original.apply(this, arguments);
    };
    wrapped.__ga4Wrapped = true;
    window[name] = wrapped;
  }

  function bindAgencyFunctionHooks() {
    if (pageType() !== 'agency_detail') return;

    const agencyParams = () => readAgencyDetailSnapshot();

    wrapFunction('openAmap', 'open_map', () => Object.assign(agencyParams(), { map_provider: 'amap' }));
    wrapFunction('revealPhones', 'reveal_phone', () => Object.assign(agencyParams(), { reveal_surface: 'desktop_sidebar' }));
    wrapFunction('openPhoneModal', 'reveal_phone', () => Object.assign(agencyParams(), { reveal_surface: 'mobile_modal' }));
    wrapFunction('shareAgency', 'share_agency', () => Object.assign(agencyParams(), { share_method: 'open_modal' }));
    wrapFunction('downloadSharePoster', 'share_agency', () => Object.assign(agencyParams(), { share_method: 'poster_save_or_native_share' }));
    wrapFunction('copyAgencyLink', 'share_agency', () => Object.assign(agencyParams(), { share_method: 'copy_link' }));
  }

  function classifyAnchorClick(anchor) {
    const href = anchor.getAttribute('href') || '';
    const context = getLinkContext(anchor);
    const lowerText = (context.link_text || '').toLowerCase();

    if (href.startsWith('tel:')) {
      track('phone_click', {
        contact_method: 'phone',
        agency_id: getCurrentAgencyId(),
        agency_name: getCurrentAgencyName(),
        link_surface: pageType()
      });
      return;
    }

    if (href.startsWith('mailto:')) {
      track('contact_agency', {
        contact_method: 'email',
        agency_id: getCurrentAgencyId(),
        agency_name: getCurrentAgencyName(),
        link_surface: pageType()
      });
      return;
    }

    if (/review\.html/.test(href) || anchor.id === 'reviewBtn' || anchor.id === 'mobileReviewBtn' || lowerText.includes('點評') || lowerText.includes('寫評價')) {
      track('start_review', {
        agency_id: getAgencyIdFromUrlOrHref(href) || getCurrentAgencyId(),
        agency_name: getCurrentAgencyName(),
        source_page: pageType()
      });
      return;
    }

    if (/contact\.html\?type=agency-(claim|appeal)/.test(href)) {
      track('agency_claim_click', {
        agency_id: getAgencyIdFromUrlOrHref(href) || getCurrentAgencyId(),
        claim_type: href.includes('agency-appeal') ? 'appeal' : 'claim',
        source_page: pageType()
      });
      return;
    }

    if (/agency\.html/.test(href)) {
      const card = anchor.closest('.ranking-card, [class*="agency"], .group, .block');
      const sourcePage = pageType();
      const listEl = anchor.closest('#redList, #blackList, #fullAgencyList, #mobileFeaturedContainer, #desktopLatestReviews');
      const siblings = listEl ? Array.from(listEl.querySelectorAll('a[href*="agency.html"]')) : [];
      const position = siblings.length ? siblings.indexOf(anchor) + 1 : undefined;
      track('select_agency', {
        agency_id: getAgencyIdFromUrlOrHref(href),
        agency_name: cleanText(card?.querySelector('h3,h4,.font-bold')?.innerText || context.link_text, 100),
        source_page: sourcePage,
        list_name: listEl?.id || '',
        position
      });
      return;
    }

    if (context.is_external) {
      track('external_link_click', context);
      return;
    }

    // 只記錄站內主導航/CTA，避免所有普通文字連結過量。
    const isNavOrCta = anchor.closest('header, nav, footer') || /找中介|看榜單|查流程|聯繫|關於|指南|首頁|排行榜|中介|用戶中心|查看全部|全部中介|了解平台/.test(context.link_text || '');
    if (isNavOrCta) {
      track('navigation_click', context);
    }
  }

  function bindClickDelegation() {
    document.addEventListener('click', (e) => {
      const anchor = e.target.closest?.('a[href]');
      if (anchor) classifyAnchorClick(anchor);

      const button = e.target.closest?.('button');
      if (!button) return;
      const text = getClosestText(button, 80);
      const onclick = button.getAttribute('onclick') || '';

      if (/隱私|同意|privacy/i.test(text)) {
        track('privacy_modal_action', { action_label: text, source_page: pageType() });
      }
    }, { capture: true });
  }

  function bindScrollTracking() {
    if (!SEND_CUSTOM_SCROLL_MILESTONES) return;
    const milestones = [25, 50, 75, 90];

    function onScroll() {
      const doc = document.documentElement;
      const total = Math.max(1, doc.scrollHeight - window.innerHeight);
      const percent = Math.round((window.scrollY / total) * 100);
      milestones.forEach((m) => {
        if (percent >= m && !firedScrollMilestones.has(m)) {
          firedScrollMilestones.add(m);
          track('scroll_depth', { percent_scrolled: m });
        }
      });
    }

    window.addEventListener('scroll', throttle(onScroll, 500), { passive: true });
  }

  function throttle(fn, wait) {
    let last = 0;
    let timer = null;
    return function throttled() {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer);
        timer = null;
        last = now;
        fn.apply(this, arguments);
      } else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(this, arguments);
        }, remaining);
      }
    };
  }

  function initPageSpecificTracking() {
    const type = pageType();
    if (type === 'home') bindHomeSearch();
    if (type === 'agency_directory') bindDirectoryTracking();
    if (type === 'ranking') bindRankingTracking();
    if (type === 'guide') bindGuideTracking();
    if (type === 'review_submission') bindReviewTracking();
    if (type === 'profile') bindProfileTracking();
    if (type === 'contact') bindContactTracking();
    if (type === 'agency_detail') {
      watchAgencyDetailLoaded();
      bindAgencyFunctionHooks();
    }
  }

  loadGA4();
  bindClickDelegation();
  bindScrollTracking();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageSpecificTracking);
  } else {
    initPageSpecificTracking();
  }
})();
