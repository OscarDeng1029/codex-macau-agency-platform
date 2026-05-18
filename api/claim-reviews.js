const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dvhwdirwpraorehlzdar.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function normalizeReviewIds(value) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(value
    .map(id => String(id || '').trim())
    .filter(id => /^[0-9a-fA-F-]{32,40}$/.test(id))))
    .slice(0, 100);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  if (!SERVICE_ROLE_KEY) {
    return send(res, 500, { error: 'missing_service_role_key' });
  }

  const { createClient } = require('@supabase/supabase-js');

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return send(res, 401, { error: 'missing_auth_token' });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (_err) {
      return send(res, 400, { error: 'invalid_json_body' });
    }
  }
  const reviewIds = normalizeReviewIds(body.reviewIds);
  if (reviewIds.length === 0) {
    return send(res, 200, { claimed: [], alreadyOwned: [], blocked: [] });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return send(res, 401, { error: 'invalid_auth_token' });
  }

  const { data: existing, error: selectError } = await admin
    .from('reviews')
    .select('id, user_id')
    .in('id', reviewIds);

  if (selectError) {
    return send(res, 500, { error: 'select_reviews_failed', message: selectError.message });
  }

  const rows = Array.isArray(existing) ? existing : [];
  const foundIds = new Set(rows.map(row => row.id));
  const claimable = rows.filter(row => !row.user_id).map(row => row.id);
  const alreadyOwned = rows.filter(row => row.user_id === user.id).map(row => row.id);
  const blocked = rows.filter(row => row.user_id && row.user_id !== user.id).map(row => row.id);
  const missing = reviewIds.filter(id => !foundIds.has(id));

  let claimed = [];
  if (claimable.length > 0) {
    const { data: updated, error: updateError } = await admin
      .from('reviews')
      .update({ user_id: user.id })
      .in('id', claimable)
      .select('id');

    if (updateError) {
      return send(res, 500, { error: 'claim_reviews_failed', message: updateError.message });
    }

    claimed = (updated || []).map(row => row.id);
  }

  return send(res, 200, { claimed, alreadyOwned, blocked, missing });
};
