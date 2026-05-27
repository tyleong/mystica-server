const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FREE_TABS = ['zodiac', 'chinese', 'daily', 'blood'];
const PRO_TABS  = ['mbti', 'couple', 'palm', 'face'];

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Mystica server running' });
});

// Main reading endpoint
app.post('/reading', async (req, res) => {
  try {
    const { system, user, tabs, max_tokens } = req.body;

    if (!system || !user) {
      return res.status(400).json({ error: 'Missing system or user prompt' });
    }

    // Check if any pro tab is requested without pro access
    // For now: all tabs allowed (pro toggle is client-side)
    // When you add real billing, check a user token here

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
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    res.json({ text: data.content?.[0]?.text || '' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mystica server listening on port ${PORT}`));
