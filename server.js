const express = require('express');
const axios = require('axios');
const Redis = require('ioredis');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

const redis = new Redis(process.env.REDIS_URL, { tls: {} });

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const CACHE_PREFIX = 'anilist:';
const CACHE_TTL = 300;

function makeCacheKey(query, variables) {
  return CACHE_PREFIX + crypto.createHash('sha256').update(JSON.stringify({ query, variables })).digest('hex');
}

app.post('/proxy', async (req, res) => {
  const { query, variables } = req.body;
  if (!query) return res.status(400).json({ error: 'missing query' });

  const key = makeCacheKey(query, variables);

  try {
    const cached = await redis.get(key);
    if (cached) return res.json({ cached: true, data: JSON.parse(cached) });

    const aniRes = await axios.post(ANILIST_ENDPOINT, { query, variables }, { headers: { 'Content-Type': 'application/json' } });

    await redis.set(key, JSON.stringify(aniRes.data), 'EX', CACHE_TTL);

    res.json({ cached: false, data: aniRes.data });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch from AniList' });
  }
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
