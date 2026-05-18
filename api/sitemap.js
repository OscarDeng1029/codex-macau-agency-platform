// api/sitemap.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const BASE_URL = 'https://www.macauagencyreview.com';

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase env vars:', {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseKey: Boolean(supabaseKey)
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(500).send('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: agencies, error } = await supabase
      .from('agencies')
      .select('uuid');

    if (error) {
      console.error('Supabase sitemap query error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(500).send(`Supabase query error: ${error.message}`);
    }

    const today = todayIsoDate();

    const staticPages = [
      { path: '/', priority: '1.0', freq: 'daily' },
      { path: '/agencies.html', priority: '0.9', freq: 'daily' },
      { path: '/ranking.html', priority: '0.8', freq: 'daily' },
      { path: '/legal.html', priority: '0.8', freq: 'weekly' },
      { path: '/about.html', priority: '0.5', freq: 'monthly' },
      { path: '/contact.html', priority: '0.5', freq: 'monthly' }
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    for (const page of staticPages) {
      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${BASE_URL}${page.path}`)}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${escapeXml(page.freq)}</changefreq>\n`;
      xml += `    <priority>${escapeXml(page.priority)}</priority>\n`;
      xml += `  </url>\n`;
    }

    for (const agency of agencies || []) {
      if (!agency.uuid) continue;

      const loc = `${BASE_URL}/seo/agency-${encodeURIComponent(agency.uuid)}.html`;

      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(loc)}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.9</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');
    res.status(200).send(xml);
  } catch (err) {
    console.error('Unhandled sitemap error:', err);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(500).send(`Error generating sitemap: ${err.message || 'Unknown error'}`);
  }
};