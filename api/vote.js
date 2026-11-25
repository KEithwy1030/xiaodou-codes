// POST /api/vote {code, vote: 'up'|'down'} —— 投票写入 Vercel Blob（每票一个文件，避免读写冲突）
const BLOB_BASE = 'https://blob.vercel.sh';

function rand(n) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: '只接受 POST' }); return; }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) { res.status(503).json({ ok: false, error: '投票服务未配置' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const code = String(body.code || '').toUpperCase();
  const vote = body.vote;
  if (!/^[A-Z0-9]{6}$/.test(code)) { res.status(400).json({ ok: false, error: '邀请码格式不对' }); return; }
  if (vote !== 'up' && vote !== 'down') { res.status(400).json({ ok: false, error: '投票值不对' }); return; }
  const pathname = 'votes/' + code + '-' + Date.now() + '-' + rand(6) + '.json';
  try {
    const r = await fetch(BLOB_BASE + '/' + pathname, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, vote, ts: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error('blob put status ' + r.status);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: '投票没记上，稍后再试' });
  }
};
