const TenorChannelFetcher = require('../fetch_tenor_channel_gifs');

module.exports = async function channelHandler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { value, limit } = req.query || {};

  if (!value) {
    res.status(400).json({ error: 'Tenor channel URL or username is required.' });
    return;
  }

  const fetcher = new TenorChannelFetcher();

  try {
    await fetcher.fetchChannelByUsername(value, limit ? Number(limit) : undefined);

    res.status(200).json({
      totalGifs: fetcher.allGifs.length,
      totalStickers: fetcher.allStickers.length,
      totalGifShares: fetcher.totalShares,
      totalStickerShares: fetcher.totalStickerShares,
      totalShares: fetcher.totalShares + fetcher.totalStickerShares,
      fetchedAt: new Date().toISOString(),
      gifs: fetcher.allGifs,
      stickers: fetcher.allStickers
    });
  } catch (error) {
    console.error('API Error:', error.message);
    res
      .status(500)
      .json({ error: 'Failed to fetch Tenor channel data. Please try again later.' });
  }
};

