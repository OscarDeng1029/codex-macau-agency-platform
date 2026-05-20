const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dvhwdirwpraorehlzdar.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;
const CRON_SECRET = process.env.CRON_SECRET;
const SITE_URL = (process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://codex-macau-agency-platform.vercel.app').replace(/\/$/, '');

const EMAIL_TYPES = ['review_approved', 'review_rejected', 'followed_agency_review'];

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isAuthorized(req) {
  if (!CRON_SECRET) return process.env.NODE_ENV !== 'production';
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
  return auth === CRON_SECRET || headerSecret === CRON_SECRET;
}

function escapeHTML(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shouldSendEmail(notification, prefs = {}) {
  if (notification.type === 'followed_agency_review') {
    return prefs.email_followed_agency_updates !== false;
  }
  return prefs.email_review_updates !== false;
}

function buildTargetUrl(notification) {
  const review = notification.review || {};
  if (notification.type === 'followed_agency_review' && review.agency_id) {
    return `${SITE_URL}/agency.html?id=${encodeURIComponent(review.agency_id)}`;
  }
  if (notification.review_id) {
    return `${SITE_URL}/profile.html#review-card-${encodeURIComponent(notification.review_id)}`;
  }
  return `${SITE_URL}/profile.html#notifications`;
}

function buildEmail(notification, user) {
  const url = buildTargetUrl(notification);
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || '你好';
  const title = notification.title || '你有一則新通知';
  const body = notification.body || '你在澳門家傭點評網有一則新動態。';

  const subjectPrefix = notification.type === 'followed_agency_review'
    ? '你關注的中介有新評論'
    : title;

  const html = `
    <div style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:0 auto;padding:32px 18px;">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;padding:28px;box-shadow:0 18px 50px rgba(15,23,42,.08);">
          <div style="font-size:13px;font-weight:800;color:#003399;margin-bottom:18px;">澳門家傭點評網</div>
          <h1 style="font-size:22px;line-height:1.35;margin:0 0 12px;font-weight:900;color:#0f172a;">${escapeHTML(title)}</h1>
          <p style="font-size:15px;line-height:1.8;margin:0 0 22px;color:#475569;">${escapeHTML(name)}，${escapeHTML(body)}</p>
          <a href="${escapeHTML(url)}" style="display:inline-block;background:#003399;color:#ffffff;text-decoration:none;border-radius:16px;padding:13px 18px;font-size:14px;font-weight:900;">查看詳情</a>
          <p style="font-size:12px;line-height:1.7;margin:24px 0 0;color:#94a3b8;">你收到這封郵件，是因為你在澳門家傭點評網提交過評論或關注了中介。可到個人頁調整郵件通知偏好。</p>
        </div>
      </div>
    </div>
  `;

  const text = [
    title,
    '',
    `${name}，${body}`,
    '',
    `查看詳情：${url}`,
    '',
    '你可到澳門家傭點評網個人頁調整郵件通知偏好。'
  ].join('\n');

  return { subject: subjectPrefix, html, text };
}

async function sendResendEmail({ to, subject, html, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject,
      html,
      text
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || result.error || `Resend request failed with ${response.status}`);
  }
  return result;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  if (!isAuthorized(req)) {
    return send(res, 401, { error: 'unauthorized' });
  }

  if (!SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM) {
    return send(res, 500, {
      error: 'missing_environment_variables',
      required: ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'RESEND_FROM']
    });
  }

  const { createClient } = require('@supabase/supabase-js');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: notifications, error: notificationError } = await admin
    .from('notifications')
    .select('id, user_id, review_id, type, title, body, email_attempts')
    .in('type', EMAIL_TYPES)
    .is('email_sent_at', null)
    .lt('email_attempts', 3)
    .order('created_at', { ascending: true })
    .limit(25);

  if (notificationError) {
    return send(res, 500, { error: 'load_notifications_failed', message: notificationError.message });
  }

  const rows = Array.isArray(notifications) ? notifications : [];
  if (rows.length === 0) {
    return send(res, 200, { sent: 0, skipped: 0, failed: 0 });
  }

  const reviewIds = Array.from(new Set(rows.map(item => item.review_id).filter(Boolean)));
  let reviewsById = new Map();
  if (reviewIds.length > 0) {
    const { data: reviews, error: reviewError } = await admin
      .from('reviews')
      .select('id, agency_id, agency_name')
      .in('id', reviewIds);

    if (reviewError) {
      return send(res, 500, { error: 'load_reviews_failed', message: reviewError.message });
    }

    reviewsById = new Map((reviews || []).map(item => [item.id, item]));
  }

  const userIds = Array.from(new Set(rows.map(item => item.user_id).filter(Boolean)));
  const { data: preferences, error: preferenceError } = await admin
    .from('user_notification_preferences')
    .select('user_id, email_review_updates, email_followed_agency_updates, email_marketing')
    .in('user_id', userIds);

  if (preferenceError) {
    return send(res, 500, { error: 'load_preferences_failed', message: preferenceError.message });
  }

  const prefsByUser = new Map((preferences || []).map(item => [item.user_id, item]));
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const notification of rows) {
    notification.review = reviewsById.get(notification.review_id) || null;
    const attempts = Number(notification.email_attempts || 0);
    const prefs = prefsByUser.get(notification.user_id) || {};

    try {
      if (!shouldSendEmail(notification, prefs)) {
        skipped += 1;
        await admin
          .from('notifications')
          .update({ email_sent_at: new Date().toISOString(), email_last_error: 'skipped_by_user_preference' })
          .eq('id', notification.id);
        continue;
      }

      const { data: userData, error: userError } = await admin.auth.admin.getUserById(notification.user_id);
      const user = userData?.user;
      if (userError || !user?.email) {
        skipped += 1;
        await admin
          .from('notifications')
          .update({ email_sent_at: new Date().toISOString(), email_last_error: 'missing_user_email' })
          .eq('id', notification.id);
        continue;
      }

      const email = buildEmail(notification, user);
      await sendResendEmail({ to: user.email, ...email });

      sent += 1;
      await admin
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString(), email_last_error: null })
        .eq('id', notification.id);
    } catch (err) {
      failed += 1;
      await admin
        .from('notifications')
        .update({ email_attempts: attempts + 1, email_last_error: String(err.message || err).slice(0, 500) })
        .eq('id', notification.id);
    }
  }

  return send(res, 200, { sent, skipped, failed });
};
