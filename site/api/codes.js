// GET /api/codes —— 返回码池（GitHub codes.json + 网友提交 + 投票数合并，按发现时间倒序）
const GH_RAW = 'https://raw.githubusercontent.com/KEithwy1030/xiaodou-codes/main/data/codes.json';
const BLOB_BASE = 'https://blob.vercel.sh';

async function listBlobs(prefix, token) {
  const out = [];
  let cursor = '';
  for (let i = 0; i < 5; i++) {
    const url = BLOB_BASE + '/?prefix=' + encodeURIComponent(prefix) + '&limit=1000' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('blob list failed: ' + r.status);
    const d = await r.json();
    (d.blobs || []).forEach(b => out.push(b));
    if (!d.hasMore) break;
    cursor = d.cursor || '';
    if (!cursor) break;
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json');
  const now = Date.now();
  let pool = [];
  let ghError = null;
  try {
    const r = await fetch(GH_RAW, { headers: { 'User-Agent': 'xiaodou-codes-site' } });
    if (!r.ok) throw new Error('github raw status ' + r.status);
    const d = await r.json();
    pool = (d.codes || []).map(c => ({
      code: String(c.code || '').toUpperCase(),
      source: c.source || '公开渠道',
      source_url: c.source_url || null,
      found_at: c.found_at || c.created_at || null,
      expires_at: c.expires_at || null,
      up: 0, down: 0,
    }));
  } catch (e) { ghError = String(e && e.message || e); }

  // Blob: 网友提交 + 投票（token 未配置时跳过，不影响主列表）
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    try {
      const [subs, votes] = await Promise.all([
        listBlobs('submissions/', token),
        listBlobs('votes/', token),
      ]);
      // submissions: each blob url -> fetch json (only need pathname ts; fetch content for code)
      const subCodes = [];
      for (const b of subs) {
        try {
          const r = await fetch(b.url);
          if (!r.ok) continue;
          const j = await r.json();
          if (j && /^[A-Za-z0-9]{6}$/.test(String(j.code || ''))) {
            subCodes.push({ code: String(j.code).toUpperCase(), found_at: j.ts || b.uploadedAt, source: '网友分享', source_url: null });
          }
        } catch (e) {}
      }
      // votes: count from pathname (votes/<CODE>-<ts>-<rand>.json) — avoid fetching bodies
      const voteCount = {};
      for (const b of votes) {
        const m = String(b.pathname || '').match(/^votes\/([A-Z0-9]{6})-(\d+)-[a-z0-9]+\.json$/i);
        if (!m) continue;
        const code = m[1].toUpperCase();
        // vote direction is in the blob body; fetch it (small json)
        try {
          const r = await fetch(b.url);
          if (!r.ok) continue;
          const j = await r.json();
          voteCount[code] = voteCount[code] || { up: 0, down: 0 };
          if (j.vote === 'up') voteCount[code].up++;
          else if (j.vote === 'down') voteCount[code].down++;
        } catch (e) {}
      }
      // merge submissions
      const seen = new Set(pool.map(c => c.code));
      for (const s of subCodes) {
        if (!seen.has(s.code)) { pool.push({ ...s, up: 0, down: 0 }); seen.add(s.code); }
      }
      for (const c of pool) {
        if (voteCount[c.code]) { c.up = voteCount[c.code].up; c.down = voteCount[c.code].down; }
      }
    } catch (e) {
      // blob 读失败不影响主列表
    }
  }

  // dedupe (keep earliest found_at), sort desc, cap 100, mark likely expired (>48h since found)
  const byCode = new Map();
  for (const c of pool) {
    if (!/^[A-Z0-9]{6}$/.test(c.code)) continue;
    const prev = byCode.get(c.code);
    if (!prev || (c.found_at && prev.found_at && c.found_at < prev.found_at)) byCode.set(c.code, c);
    else if (!prev) byCode.set(c.code, c);
  }
  const codes = [...byCode.values()]
    .sort((a, b) => String(b.found_at || '').localeCompare(String(a.found_at || '')))
    .slice(0, 100)
    .map(c => {
      const t = c.found_at ? new Date(c.found_at).getTime() : 0;
      const likely_expired = !!t && (now - t > 48 * 3600 * 1000);
      return { ...c, likely_expired };
    });

  res.status(200).json({ codes, updated_at: new Date().toISOString(), gh_error: ghError, blob_configured: !!token });
};
