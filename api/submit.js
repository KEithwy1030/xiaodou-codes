// POST /api/submit {code} —— 访客分享多余邀请码进池（写入 Vercel Blob，每条一个文件）
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
  if (!token) { res.status(503).json({ ok: false, error: '提交服务未配置' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const code = String(body.code || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { res.status(400).json({ ok: false, error: '格式不对：邀请码是 6 位字母或数字' }); return; }
  const pathname = 'submissions/' + code + '-' + Date.now() + '-' + rand(6) + '.json';
  try {
    const r = await fetch(BLOB_BASE + '/' + pathname, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, ts: new Date().toISOString(), source: '网友分享' }),
    });
    if (!r.ok) throw new Error('blob put status ' + r.status);
    res.status(200).json({ ok: true, code });
  } catch (e) {
    res.status(500).json({ ok: false, error: '提交失败，稍后再试' });
  }
};
