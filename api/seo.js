// api/seo.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const SITE_URL = 'https://www.macauagencyreview.com';
const SITE_NAME = '澳門家傭點評網';
const SHARE_IMAGE = `${SITE_URL}/assets/images/share-thumbnailv1.png`;
const LOGO_IMAGE = `${SITE_URL}/assets/images/logo.png`;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripHtml(value = '') {
  return String(value).replace(/<[^>]*>/g, '').trim();
}

function truncate(value = '', maxLength = 180) {
  const text = stripHtml(value).replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function safeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return Math.min(Math.max(rating, 1), 5);
}

function normalizeReviewCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

function average(values = []) {
  const valid = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!valid.length) return null;

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatMetric(value) {
  const metric = normalizeRating(value);
  return metric ? `${metric.toFixed(1)} / 5.0` : '暫無數據';
}

function metricPercent(value) {
  const metric = normalizeRating(value);
  if (!metric) return 0;
  return Math.round(metric * 20);
}

function formatDateZh(value) {
  if (!value) return '未提供';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未提供';

  return date.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function cleanAgencyId(rawIdParam) {
  return decodeURIComponent(String(rawIdParam || ''))
    .replace(/^agency-/i, '')
    .replace(/\.html$/i, '')
    .trim();
}

function parseJsonArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (_) {
      return trimmed
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [trimmed];
  }

  return [];
}

function joinList(value, fallback = '未提供') {
  const list = parseJsonArray(value);
  return list.length > 0 ? list.join('、') : fallback;
}

function hasRealTextReview(review) {
  const content = String(review?.content || '').trim();

  return (
    content &&
    !content.includes('未留下詳細文字說明') &&
    !content.includes('未留下文字說明') &&
    !content.includes('未留下详细文字说明') &&
    !content.includes('未留下文字说明')
  );
}

function buildDescription(agency, rating, reviewCount) {
  const name = agency.name || '澳門家傭中介';
  const desc = agency.desc ? truncate(agency.desc, 110) : '';

  if (rating && reviewCount > 0) {
    return `查看${name}在澳門家傭點評網的僱主評價、評分、牌照資料、地址、電話及服務範圍。目前收錄 ${reviewCount} 個已審核評分，平均評分 ${rating.toFixed(1)} / 5。`;
  }

  if (desc) {
    return `${name}｜${desc} 查看牌照資料、地址、電話、服務範圍及僱主評價更新，適合澳門僱主請工人姐姐前作參考。`;
  }

  return `查看${name}在澳門家傭點評網的中介資料、牌照狀態、地址、電話、服務範圍及僱主評價更新。`;
}

function buildAiSummary(agency, stats) {
  const name = agency.name || '該中介';
  const tags = joinList(agency.tags, '');
  const region = agency.region || '澳門';
  const licenseStatus = agency.license_status || '未提供';
  const licenseExpiry = agency.license_expiry ? formatDateZh(agency.license_expiry) : '未提供';
  const serviceRegion = agency.service_region || '未提供';
  const bizType = agency.biz_type || '未提供';

  const ratingPart =
    stats.rating && stats.reviewCount > 0
      ? `目前平台收錄 ${stats.reviewCount} 個已審核評分，平均評分為 ${stats.rating.toFixed(1)} / 5，其中包含 ${stats.textReviewCount} 條文字評價。`
      : '目前平台暫未收錄足夠已審核評分，僱主可先參考其牌照、服務範圍及聯絡資料。';

  const metricParts = [];
  if (stats.avgTransparency) metricParts.push(`收費透明度 ${stats.avgTransparency.toFixed(1)} / 5`);
  if (stats.avgSpeed) metricParts.push(`辦證速度 ${stats.avgSpeed.toFixed(1)} / 5`);
  if (stats.avgAttitude) metricParts.push(`服務態度 ${stats.avgAttitude.toFixed(1)} / 5`);

  const metricPart = metricParts.length
    ? `細分評價維度包括：${metricParts.join('、')}。`
    : '目前細分評價維度暫無足夠數據。';

  const tagPart = tags ? `服務標籤包括：${tags}。` : '';

  return `${name}是${SITE_NAME}收錄的澳門家傭／職業介紹所資料之一，所在地區為${region}，業務類型為${bizType}，牌照狀態為${licenseStatus}，准照有效期至${licenseExpiry}。${ratingPart}${metricPart}${tagPart}其服務地區或可招募來源包括：${serviceRegion}。`;
}

function buildFaqs(agency, stats) {
  const name = agency.name || '這間中介';
  const licenseNo = agency.license_no || '未提供';
  const licenseStatus = agency.license_status || '未提供';

  return [
    {
      question: `${name}的牌照資料是什麼？`,
      answer: `${name}在${SITE_NAME}收錄的牌照編號為 ${licenseNo}，牌照狀態為${licenseStatus}。僱主聯絡前仍應自行核實准照狀態、有效期及服務範圍。`
    },
    {
      question: `${name}目前有多少評價？`,
      answer:
        stats.rating && stats.reviewCount > 0
          ? `${name}目前在${SITE_NAME}收錄 ${stats.reviewCount} 個已審核評分，平均評分為 ${stats.rating.toFixed(1)} / 5，其中包含 ${stats.textReviewCount} 條文字評價。評價只反映部分僱主經驗，不代表官方推薦。`
          : `${name}目前在${SITE_NAME}暫未有足夠已審核評分。僱主可先參考牌照、地址、服務範圍及聯絡資料，並在聯絡前自行核實。`
    },
    {
      question: `${name}的細分服務指標如何計算？`,
      answer:
        '細分服務指標根據已審核評價中的收費透明度、辦證速度及服務態度打分計算平均值。每項滿分為 5 分；若某項暫無足夠已審核數據，頁面會顯示暫無數據。'
    },
    {
      question: `聯絡${name}前要注意什麼？`,
      answer:
        '建議先核實中介是否持有有效職業介紹所牌照、服務收費是否清楚列明、是否包含申請或續期流程、是否有更換家傭或退款安排，以及所有承諾是否能以書面形式確認。'
    },
    {
      question: `${SITE_NAME}是否推薦這間中介？`,
      answer:
        `${SITE_NAME}提供中介資料整理、僱主評價與比較資訊，不構成官方推薦、法律意見或專業建議。僱主應根據自身需要、實際溝通結果及最新官方資料作出判斷。`
    }
  ];
}

async function findAgencyById(id) {
  const { data, error } = await supabase
    .from('agencies')
    .select(
      [
        'license_no',
        'name',
        'license_status',
        'address',
        'region',
        'rating',
        'review_count',
        'tags',
        'desc',
        'metric_transparency',
        'metric_speed',
        'metric_attitude',
        'name_pt',
        'license_expiry',
        'biz_type',
        'phones',
        'email',
        'service_region',
        'uuid'
      ].join(',')
    )
    .eq('uuid', id)
    .maybeSingle();

  if (error) {
    console.error('Agency query by uuid error:', {
      id,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
  }

  return data || null;
}

async function fetchApprovedReviewStats(agencyUuid) {
  if (!agencyUuid) {
    return {
      reviews: [],
      textReviewCount: 0,
      computedAverageRating: null,
      computedRatingCount: 0,
      avgTransparency: null,
      transparencyCount: 0,
      avgSpeed: null,
      speedCount: 0,
      avgAttitude: null,
      attitudeCount: 0
    };
  }

  const { data, error } = await supabase
    .from('reviews')
    .select('content, rating, created_at, status, tags, transparency, speed, attitude')
    .eq('agency_id', agencyUuid)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Review query error:', {
      agencyUuid,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });

    return {
      reviews: [],
      textReviewCount: 0,
      computedAverageRating: null,
      computedRatingCount: 0,
      avgTransparency: null,
      transparencyCount: 0,
      avgSpeed: null,
      speedCount: 0,
      avgAttitude: null,
      attitudeCount: 0
    };
  }

  const allReviews = data || [];

  const validRatings = allReviews
    .map((review) => Number(review.rating))
    .filter((value) => Number.isFinite(value) && value > 0);

  const transparencyValues = allReviews
    .map((review) => Number(review.transparency))
    .filter((value) => Number.isFinite(value) && value > 0);

  const speedValues = allReviews
    .map((review) => Number(review.speed))
    .filter((value) => Number.isFinite(value) && value > 0);

  const attitudeValues = allReviews
    .map((review) => Number(review.attitude))
    .filter((value) => Number.isFinite(value) && value > 0);

  const textReviews = allReviews.filter(hasRealTextReview);

  return {
    reviews: textReviews.slice(0, 3),
    textReviewCount: textReviews.length,
    computedAverageRating: average(validRatings),
    computedRatingCount: validRatings.length,
    avgTransparency: average(transparencyValues),
    transparencyCount: transparencyValues.length,
    avgSpeed: average(speedValues),
    speedCount: speedValues.length,
    avgAttitude: average(attitudeValues),
    attitudeCount: attitudeValues.length
  };
}

function buildFinalStats(agency, reviewData) {
  const agencyRating = normalizeRating(agency.rating);
  const agencyReviewCount = normalizeReviewCount(agency.review_count);

  const computedRating = normalizeRating(reviewData.computedAverageRating);
  const computedRatingCount = normalizeReviewCount(reviewData.computedRatingCount);

  const agencyTransparency = normalizeRating(agency.metric_transparency);
  const agencySpeed = normalizeRating(agency.metric_speed);
  const agencyAttitude = normalizeRating(agency.metric_attitude);

  const computedTransparency = normalizeRating(reviewData.avgTransparency);
  const computedSpeed = normalizeRating(reviewData.avgSpeed);
  const computedAttitude = normalizeRating(reviewData.avgAttitude);

  return {
    rating: agencyRating || computedRating,
    reviewCount: agencyReviewCount || computedRatingCount,
    textReviewCount: reviewData.textReviewCount || 0,

    avgTransparency: computedTransparency || agencyTransparency,
    transparencyCount: reviewData.transparencyCount || 0,

    avgSpeed: computedSpeed || agencySpeed,
    speedCount: reviewData.speedCount || 0,

    avgAttitude: computedAttitude || agencyAttitude,
    attitudeCount: reviewData.attitudeCount || 0
  };
}

function renderMetricBlock(label, value, count) {
  const percent = metricPercent(value);
  const valueText = formatMetric(value);
  const countText = count > 0 ? `基於 ${count} 個已審核評分` : '暫無足夠評分';

  return `
    <div class="metric-item">
      <div class="metric-head">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(valueText)}</span>
      </div>
      <div class="metric-bar" aria-hidden="true">
        <div class="metric-fill" style="width: ${percent}%"></div>
      </div>
      <small>${escapeHtml(countText)}</small>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  const rawIdParam = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = cleanAgencyId(rawIdParam);

  console.log('SEO raw id:', rawIdParam);
  console.log('SEO cleaned id:', id);

  if (!id) {
    return res.status(400).send('缺少中介 ID');
  }

  try {
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase env vars:', {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseKey: Boolean(supabaseKey)
      });

      return res.status(500).send('缺少 Supabase 環境變量');
    }

    const agency = await findAgencyById(id);

    if (!agency) {
      console.error('Agency not found for SEO page:', {
        rawIdParam,
        cleanedId: id
      });

      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.status(404).send('找不到該中介資料');
    }

    const reviewData = await fetchApprovedReviewStats(agency.uuid);
    const stats = buildFinalStats(agency, reviewData);
    const reviews = reviewData.reviews;

    const agencyName = agency.name || '澳門家傭中介';
    const safeAgencyName = escapeHtml(agencyName);

    const canonicalUrl = `${SITE_URL}/seo/agency-${encodeURIComponent(agency.uuid)}.html`;
    const interactiveUrl = `${SITE_URL}/agency.html?id=${encodeURIComponent(agency.uuid)}`;

    const description = buildDescription(agency, stats.rating, stats.reviewCount);
    const aiSummary = buildAiSummary(agency, stats);
    const faqs = buildFaqs(agency, stats);

    const safeDescription = escapeHtml(description);
    const safeAiSummary = escapeHtml(aiSummary);

    const tagsText = joinList(agency.tags, '暫無標籤');
    const phonesText = joinList(agency.phones, '未提供');
    const ratingText = stats.rating ? `${stats.rating.toFixed(1)} / 5.0` : '暫無評分';
    const licenseExpiryText = agency.license_expiry ? formatDateZh(agency.license_expiry) : '未提供';

    const updatedAt = agency.license_expiry || new Date().toISOString();

    const reviewsHtml = reviews
      .filter((review) => review && review.content)
      .map((review) => {
        const reviewRating = normalizeRating(review.rating);
        const safeReviewText = escapeHtml(truncate(review.content, 500));
        const safeDate = escapeHtml(formatDateZh(review.created_at));

        return `
          <article class="review">
            <div class="stars">★ ${reviewRating ? reviewRating.toFixed(1) : '未評分'} / 5</div>
            <p>${safeReviewText}</p>
            <small>發佈於 ${safeDate}</small>
          </article>
        `;
      })
      .join('');

    const metricHtml = `
      ${renderMetricBlock('收費透明度', stats.avgTransparency, stats.transparencyCount)}
      ${renderMetricBlock('辦證速度', stats.avgSpeed, stats.speedCount)}
      ${renderMetricBlock('服務態度', stats.avgAttitude, stats.attitudeCount)}
    `;

    const businessSchema = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: agencyName,
      alternateName: agency.name_pt || undefined,
      url: canonicalUrl,
      image: SHARE_IMAGE,
      logo: LOGO_IMAGE,
      description,
      priceRange: agency.biz_type || '$$',
      areaServed: {
        '@type': 'Place',
        name: agency.service_region || 'Macau'
      },
      address: {
        '@type': 'PostalAddress',
        streetAddress: agency.address || '',
        addressLocality: agency.region || 'Macau',
        addressCountry: 'MO'
      },
      identifier: agency.license_no
        ? {
            '@type': 'PropertyValue',
            name: '職業介紹所准照編號',
            value: agency.license_no
          }
        : undefined,
      additionalProperty: [
        stats.avgTransparency
          ? {
              '@type': 'PropertyValue',
              name: '收費透明度',
              value: stats.avgTransparency.toFixed(1),
              unitText: '5分制'
            }
          : null,
        stats.avgSpeed
          ? {
              '@type': 'PropertyValue',
              name: '辦證速度',
              value: stats.avgSpeed.toFixed(1),
              unitText: '5分制'
            }
          : null,
        stats.avgAttitude
          ? {
              '@type': 'PropertyValue',
              name: '服務態度',
              value: stats.avgAttitude.toFixed(1),
              unitText: '5分制'
            }
          : null
      ].filter(Boolean)
    };

    const phones = parseJsonArray(agency.phones);
    if (phones.length > 0) {
      businessSchema.telephone = phones[0];
    }

    if (agency.email) {
      businessSchema.email = agency.email;
    }

    if (stats.rating && stats.reviewCount > 0) {
      businessSchema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: stats.rating.toFixed(1),
        reviewCount: stats.reviewCount,
        bestRating: '5',
        worstRating: '1'
      };
    }

    const reviewSchemas = reviews
      .filter((review) => review && review.content && normalizeRating(review.rating))
      .map((review) => ({
        '@type': 'Review',
        reviewBody: truncate(review.content, 500),
        datePublished: toIsoDate(review.created_at),
        author: {
          '@type': 'Person',
          name: '匿名僱主'
        },
        reviewRating: {
          '@type': 'Rating',
          ratingValue: normalizeRating(review.rating).toFixed(1),
          bestRating: '5',
          worstRating: '1'
        }
      }));

    if (reviewSchemas.length > 0) {
      businessSchema.review = reviewSchemas;
    }

    Object.keys(businessSchema).forEach((key) => {
      if (
        businessSchema[key] === undefined ||
        businessSchema[key] === '' ||
        (Array.isArray(businessSchema[key]) && businessSchema[key].length === 0)
      ) {
        delete businessSchema[key];
      }
    });

    const organizationSchema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: LOGO_IMAGE
    };

    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: '首頁',
          item: SITE_URL
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: '澳門家傭中介大全',
          item: `${SITE_URL}/agencies.html`
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: agencyName,
          item: canonicalUrl
        }
      ]
    };

    const faqSchema = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    };

    const faqHtml = faqs
      .map(
        (faq) => `
          <div class="faq-item">
            <h3>${escapeHtml(faq.question)}</h3>
            <p>${escapeHtml(faq.answer)}</p>
          </div>
        `
      )
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-Hant-MO">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${safeAgencyName} 真實評價與資料 - ${SITE_NAME}</title>
  <meta name="description" content="${safeDescription}" />
  <link rel="canonical" href="${canonicalUrl}" />

  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:title" content="${safeAgencyName} 真實評價與資料 - ${SITE_NAME}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${SHARE_IMAGE}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeAgencyName} 真實評價與資料 - ${SITE_NAME}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${SHARE_IMAGE}" />

  <script type="application/ld+json">${safeJsonLd(organizationSchema)}</script>
  <script type="application/ld+json">${safeJsonLd(businessSchema)}</script>
  <script type="application/ld+json">${safeJsonLd(breadcrumbSchema)}</script>
  <script type="application/ld+json">${safeJsonLd(faqSchema)}</script>

  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans TC", "Noto Sans HK", sans-serif;
      line-height: 1.7;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #faf8ff;
      color: #0f172a;
    }

    .header {
      text-align: center;
      margin-bottom: 36px;
      padding-top: 20px;
    }

    .logo {
      color: #003399;
      font-weight: 900;
      font-size: 20px;
      text-decoration: none;
    }

    .card {
      background: #ffffff;
      padding: 28px;
      border-radius: 20px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
      margin-bottom: 24px;
      border: 1px solid #e2e8f0;
    }

    h1 {
      color: #002068;
      font-size: 30px;
      line-height: 1.25;
      margin: 0 0 16px;
    }

    h2 {
      color: #002068;
      font-size: 22px;
      margin-top: 0;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 10px;
    }

    h3 {
      color: #0f172a;
      font-size: 17px;
      margin: 0 0 6px;
    }

    .badge {
      display: inline-block;
      background: #e0e7ff;
      color: #3730a3;
      padding: 5px 14px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .meta-list,
    .check-list,
    .audience-list {
      display: grid;
      gap: 10px;
      margin: 0;
      padding-left: 20px;
      color: #475569;
    }

    .meta-list {
      padding-left: 0;
      list-style: none;
    }

    .meta-list strong {
      color: #0f172a;
    }

    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 18px;
      color: #334155;
    }

    .metric-grid {
      display: grid;
      gap: 18px;
    }

    .metric-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 16px;
    }

    .metric-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      margin-bottom: 10px;
    }

    .metric-head strong {
      color: #0f172a;
    }

    .metric-head span {
      color: #003399;
      font-weight: 800;
      white-space: nowrap;
    }

    .metric-bar {
      height: 8px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .metric-fill {
      height: 100%;
      background: #003399;
      border-radius: 999px;
    }

    .metric-item small {
      color: #64748b;
    }

    .review {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e2e8f0;
    }

    .review:last-child {
      border-bottom: 0;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .stars {
      color: #b45309;
      font-weight: 800;
      margin-bottom: 6px;
    }

    .review p {
      color: #334155;
      margin: 0 0 8px;
      white-space: pre-wrap;
    }

    .review small,
    .muted {
      color: #64748b;
    }

    .faq-item {
      padding: 16px 0;
      border-bottom: 1px solid #e2e8f0;
    }

    .faq-item:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .faq-item p {
      margin: 0;
      color: #475569;
    }

    .cta-btn {
      display: block;
      width: 100%;
      text-align: center;
      background: #003399;
      color: white;
      padding: 18px;
      text-decoration: none;
      border-radius: 16px;
      font-weight: 800;
      font-size: 18px;
      margin-top: 28px;
      box-sizing: border-box;
    }

    .cta-btn:hover {
      background: #002068;
    }

    .disclaimer {
      font-size: 14px;
      color: #64748b;
    }

    @media (max-width: 640px) {
      body {
        padding: 14px;
      }

      .card {
        padding: 22px;
        border-radius: 18px;
      }

      h1 {
        font-size: 26px;
      }

      .metric-head {
        display: block;
      }

      .metric-head span {
        display: block;
        margin-top: 4px;
      }
    }
  </style>
</head>

<body>
  <header class="header">
    <a href="/" class="logo">${SITE_NAME}</a>
  </header>

  <main>
    <section class="card">
      <h1>${safeAgencyName} 真實評價與資料</h1>
      <div class="badge">總評分：${escapeHtml(ratingText)}</div>

      <ul class="meta-list">
        <li><strong>牌照編號：</strong>${escapeHtml(agency.license_no || '未提供')}</li>
        <li><strong>牌照狀態：</strong>${escapeHtml(agency.license_status || '未提供')}</li>
        <li><strong>准照有效期：</strong>${escapeHtml(licenseExpiryText)}</li>
        <li><strong>業務類型：</strong>${escapeHtml(agency.biz_type || '未提供')}</li>
        <li><strong>中文名稱：</strong>${safeAgencyName}</li>
        <li><strong>葡文／英文名稱：</strong>${escapeHtml(agency.name_pt || '未提供')}</li>
        <li><strong>地址：</strong>${escapeHtml(agency.address || '未提供')}</li>
        <li><strong>所在地區：</strong>${escapeHtml(agency.region || '未提供')}</li>
        <li><strong>聯絡電話：</strong>${escapeHtml(phonesText)}</li>
        <li><strong>電郵：</strong>${escapeHtml(agency.email || '未提供')}</li>
        <li><strong>服務／招募地區：</strong>${escapeHtml(agency.service_region || '未提供')}</li>
        <li><strong>服務標籤：</strong>${escapeHtml(tagsText)}</li>
        <li><strong>已審核評分：</strong>${stats.reviewCount} 個</li>
        <li><strong>文字評價：</strong>${stats.textReviewCount} 條</li>
        <li><strong>資料最後更新：</strong>${escapeHtml(formatDateZh(updatedAt))}</li>
      </ul>
    </section>

    <section class="card">
      <h2>中介簡介</h2>
      <div class="summary-box">
        <p>${escapeHtml(agency.desc || '暫無中介簡介。')}</p>
      </div>
    </section>

    <section class="card">
      <h2>中介評價摘要</h2>
      <div class="summary-box">
        <p>${safeAiSummary}</p>
      </div>
    </section>

    <section class="card">
      <h2>評價維度</h2>
      <div class="metric-grid">
        ${metricHtml}
      </div>
    </section>

    <section class="card">
      <h2>適合哪些僱主參考？</h2>
      <ul class="audience-list">
        <li>正在澳門首次聘請家傭或工人姐姐的僱主。</li>
        <li>希望比較不同澳門家傭中介評價、服務標籤與口碑的家庭。</li>
        <li>想在聯絡中介前，先了解牌照、地址、服務範圍及過往僱主回饋的人士。</li>
        <li>需要查詢中介服務態度、文件跟進、溝通效率及收費透明度的人士。</li>
      </ul>
    </section>

    <section class="card">
      <h2>聯絡中介前建議核實</h2>
      <ul class="check-list">
        <li>確認中介是否持有有效職業介紹所牌照。</li>
        <li>確認服務收費是否清楚列明，是否包含申請、續期、保險或其他行政費用。</li>
        <li>查詢如家傭不適合，是否有更換、退款或後續跟進安排。</li>
        <li>要求重要承諾以合約、收據、訊息或書面紀錄確認。</li>
        <li>核實家傭來源地、申請時間、合約期限、保險及出糧安排。</li>
      </ul>
    </section>

    <section class="card">
      <h2>精選僱主點評</h2>
      ${
        reviewsHtml ||
        '<p class="muted">目前暫無已審核文字點評。</p>'
      }

      <a href="${interactiveUrl}" class="cta-btn">
        前往查看完整 ${stats.reviewCount} 個評分及 ${stats.textReviewCount} 條文字評價 →
      </a>
    </section>

    <section class="card">
      <h2>常見問題</h2>
      ${faqHtml}
    </section>

    <section class="card disclaimer">
      <h2>資料來源與免責聲明</h2>
      <p>
        本頁資料來自${SITE_NAME}已收錄的公開中介資料及已審核僱主評價，僅供僱主在澳門搵工人、請工人姐姐前作參考。
        評分、評價數、聯絡方式及服務資料可能隨時間變動，請以中介機構及澳門相關主管部門最新公布為準。
        本網站內容不構成法律意見、勞工建議、官方推薦或專業顧問意見。
      </p>
    </section>
  </main>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');
    res.setHeader('X-Robots-Tag', 'index, follow');
    res.status(200).send(htmlContent);
  } catch (err) {
    console.error('SEO page generation failed:', err);

    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(500).send(`伺服器發生錯誤，無法載入資料：${err.message || 'Unknown error'}`);
  }
};