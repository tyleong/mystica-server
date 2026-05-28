const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Pro bypass token ──────────────────────────────────────────────────
// Set PRO_SECRET in Render environment variables.
// Frontend sends it as header 'x-mystica-pro' for Pro users.
// When RevenueCat is wired up, replace this with entitlement verification.
const PRO_SECRET = process.env.PRO_SECRET || null;

// ── Rate limit config ─────────────────────────────────────────────────
const FREE_DAILY_LIMIT = 2;       // max readings per day for free users
const ABUSE_RPM_LIMIT  = 10;      // max requests per minute per IP (all users)

// ── In-memory stores ──────────────────────────────────────────────────
// Structure: { 'YYYY-MM-DD:ip': count }
const dailyUsage = {};

// Structure: { ip: { count, windowStart } }
const minuteUsage = {};

// Purge old daily entries once an hour to prevent memory bloat
setInterval(() => {
  const today = getSGTDateStr();
  for (const key of Object.keys(dailyUsage)) {
    if (!key.startsWith(today)) delete dailyUsage[key];
  }
}, 60 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────
function getSGTDateStr() {
  // Returns YYYY-MM-DD in Singapore Time (UTC+8)
  const now = new Date();
  const sgt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return sgt.toISOString().slice(0, 10);
}

function getClientIP(req) {
  // Render passes real IP via x-forwarded-for
  const forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress || 'unknown').trim();
}

function getDailyKey(ip) {
  return `${getSGTDateStr()}:${ip}`;
}

function checkDailyLimit(ip) {
  const key = getDailyKey(ip);
  const count = dailyUsage[key] || 0;
  return { count, exceeded: count >= FREE_DAILY_LIMIT };
}

function incrementDaily(ip) {
  const key = getDailyKey(ip);
  dailyUsage[key] = (dailyUsage[key] || 0) + 1;
}

function checkAbuseLimit(ip) {
  const now = Date.now();
  const entry = minuteUsage[ip];
  if (!entry || now - entry.windowStart > 60 * 1000) {
    // New window
    minuteUsage[ip] = { count: 1, windowStart: now };
    return false; // not abusive
  }
  entry.count++;
  return entry.count > ABUSE_RPM_LIMIT;
}

function isProRequest(req) {
  if (!PRO_SECRET) return false;
  return req.headers['x-mystica-pro'] === PRO_SECRET;
}

// ── Health check ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'Mystica server running' });
});

// ── Main reading endpoint ─────────────────────────────────────────────
app.post('/reading', async (req, res) => {
  try {
    const { system, user, max_tokens } = req.body;

    if (!system || !user) {
      return res.status(400).json({ error: 'Missing system or user prompt' });
    }

    const ip = getClientIP(req);
    const isPro = isProRequest(req);

    // 1. Abuse guard — applies to everyone (Pro and free)
    if (checkAbuseLimit(ip)) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        code: 'RATE_ABUSE'
      });
    }

    // 2. Daily limit — free users only
    if (!isPro) {
      const { count, exceeded } = checkDailyLimit(ip);
      if (exceeded) {
        return res.status(429).json({
          error: 'Daily free limit reached. Upgrade to Pro for unlimited readings.',
          code: 'DAILY_LIMIT',
          used: count,
          limit: FREE_DAILY_LIMIT
        });
      }
    }

    // 3. Forward to Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: max_tokens || 1000,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'API error'
      });
    }

    // 4. Increment daily counter only on success (free users)
    if (!isPro) incrementDaily(ip);

    res.json({ text: data.content?.[0]?.text || '' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mystica server listening on port ${PORT}`));
