const TenorChannelFetcher = require('../fetch_tenor_channel_gifs');

module.exports = async function gifRanksHandler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    gifId,
    tags = '',
    maxPages = '10',
    maxTags = '10',
    type = 'gif'
  } = req.query || {};

  if (!gifId) {
    res.status(400).json({ error: 'gifId is required' });
    return;
  }

  const fetcher = new TenorChannelFetcher();
  const tagList = tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  try {
    const result = await fetcher.findTagRanksForGif({
      gifIdentifier: gifId,
      tags: tagList,
      maxPagesPerTag: Math.max(1, parseInt(maxPages, 10) || 10),
      maxTags: Math.max(1, parseInt(maxTags, 10) || 10),
      mediaType: type === 'sticker' ? 'sticker' : 'gif'
    });

    res.status(200).json({
      gif: result.gif,
      ranks: result.ranks,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Tag rank API error:', error.message);
    res.status(500).json({ error: error.message || 'Unable to fetch tag ranks right now.' });
  }
};

