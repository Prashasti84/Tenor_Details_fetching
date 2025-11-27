/**
 * Tenor Channel GIF Fetcher
 * Fetches all GIFs from a Tenor channel including share data
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Configuration
const CONFIG = {
  TENOR_API_KEY: process.env.TENOR_API_KEY || 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ', // Default Tenor API key
  CHANNEL_ID: process.env.TENOR_CHANNEL_ID || '', // Channel/User ID to fetch from
  CHANNEL_USERNAME: process.env.TENOR_CHANNEL_USERNAME || '', // Or use username
  LIMIT_PER_REQUEST: 50, // Max 50 per request
  OUTPUT_FILE: 'tenor_channel_gifs.json',
  OUTPUT_CSV: 'tenor_channel_gifs.csv',
  OUTPUT_STICKER_CSV: 'tenor_channel_stickers.csv'
};

class TenorChannelFetcher {
  constructor() {
    this.apiKey = CONFIG.TENOR_API_KEY;
    this.baseUrl = 'https://tenor.googleapis.com/v2';
    this.baseUrlV1 = 'https://g.tenor.com/v1'; // Fallback for some endpoints
    this.resetState();
  }

  /**
   * Reset accumulators so each fetch starts clean
   */
  resetState() {
    this.allGifs = [];
    this.allStickers = [];
    this.totalShares = 0; // GIF-only for backward compatibility
    this.totalStickerShares = 0;
  }

  /**
   * Extract username from Tenor channel URL
   */
  extractUsernameFromUrl(url) {
    // Handle various Tenor URL formats:
    // https://tenor.com/@username
    // https://tenor.com/users/username
    // tenor.com/@username
    // @username
    
    let username = url.trim();
    
    // If it's already just @username or username, clean it up
    if (username.startsWith('@')) {
      return username.substring(1);
    }
    
    // Extract from URL
    const patterns = [
      /tenor\.com\/@([^\/\?#]+)/i,           // https://tenor.com/@username
      /tenor\.com\/users\/([^\/\?#]+)/i,     // https://tenor.com/users/username
      /tenor\.com\/profile\/([^\/\?#]+)/i,   // https://tenor.com/profile/username
    ];
    
    for (const pattern of patterns) {
      const match = username.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // If no pattern matched, assume it's just the username
    return username;
  }

  /**
   * Fetch GIFs from a Tenor channel by username or URL
   */
  async fetchChannelByUsername(usernameOrUrl, limit = CONFIG.LIMIT_PER_REQUEST) {
    try {
      this.resetState();
      const username = this.extractUsernameFromUrl(usernameOrUrl);

      console.log(`\n🔍 Fetching Tenor channel: @${username}`);
      console.log('='.repeat(60));

      await this.fetchMediaCollection({ username, limit, mediaType: 'gif' });
      await this.fetchMediaCollection({ username, limit, mediaType: 'sticker' });

      return {
        gifs: this.allGifs,
        stickers: this.allStickers
      };
    } catch (error) {
      console.error('❌ Error fetching channel assets:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Fetch GIFs or stickers for a channel
   */
  async fetchMediaCollection({ username, limit, mediaType }) {
    const isSticker = mediaType === 'sticker';
    const label = isSticker ? 'stickers' : 'GIFs';

    console.log(`\n🎨 Collecting ${label}...`);

    let pos = '';
    let totalFetched = 0;
    let pageCount = 0;

    do {
      pageCount++;
      console.log(`\n📥 Fetching ${label} page ${pageCount}...`);

      const params = {
        key: this.apiKey,
        q: `@${username}`,
        limit: limit,
        pos: pos || undefined,
        contentfilter: 'off',
        media_filter: 'gif',
        ...(isSticker ? { searchfilter: 'sticker', type: 'sticker' } : {})
      };

      const response = await axios.get(`${this.baseUrl}/search`, { params });
      const data = response.data;

      if (!data.results || data.results.length === 0) {
        console.log(`✅ No more ${label} found`);
        break;
      }

      for (const gif of data.results) {
        const asset = this.extractGifData(gif);
        asset.assetType = mediaType;

        const shouldScrapeShares = asset.url && totalFetched <= 50;
        if (shouldScrapeShares) {
          const scrapedShares = await this.scrapeShareCount(asset.url);
          if (scrapedShares > 0) {
            asset.shares = scrapedShares;
            console.log(`   📊 Found ${scrapedShares} shares for ${asset.id}`);
          }
          await this.delay(200);
        }

        if (isSticker) {
          this.allStickers.push(asset);
          this.totalStickerShares += asset.shares || 0;
        } else {
          this.allGifs.push(asset);
          this.totalShares += asset.shares || 0;
        }
      }

      totalFetched += data.results.length;
      console.log(`   ✅ Fetched ${data.results.length} ${label} (Total: ${totalFetched})`);

      pos = data.next || '';
      await this.delay(500);

    } while (pos);
  }

  /**
   * Fetch trending GIFs (alternative method)
   */
  async fetchTrending(limit = CONFIG.LIMIT_PER_REQUEST) {
    try {
      this.resetState();
      console.log('\n🔥 Fetching trending GIFs from Tenor');
      console.log('='.repeat(60));

      let pos = '';
      let totalFetched = 0;
      let pageCount = 0;

      do {
        pageCount++;
        console.log(`\n📥 Fetching page ${pageCount}...`);

        const params = {
          key: this.apiKey,
          limit: limit,
          pos: pos || undefined,
          contentfilter: 'off',
          media_filter: 'minimal'
        };

        // Try v2 endpoint first, fallback to v1
        let response;
        try {
          response = await axios.get(`${this.baseUrl}/featured`, { params });
        } catch (v2Error) {
          console.log('   ℹ️  Trying v1 endpoint...');
          response = await axios.get(`${this.baseUrlV1}/trending`, { params });
        }
        
        const data = response.data;

        if (!data.results || data.results.length === 0) {
          break;
        }

        for (const gif of data.results) {
          const gifData = this.extractGifData(gif);
          this.allGifs.push(gifData);
          this.totalShares += gifData.shares || 0;
        }

        totalFetched += data.results.length;
        console.log(`   ✅ Fetched ${data.results.length} GIFs (Total: ${totalFetched})`);

        pos = data.next || '';
        await this.delay(500);

      } while (pos && totalFetched < 200); // Limit to 200 for trending

      return this.allGifs;
    } catch (error) {
      console.error('❌ Error fetching trending GIFs:', error.message);
      if (error.response) {
        console.error('   API Response:', error.response.status, error.response.statusText);
      }
      throw error;
    }
  }

  /**
   * Fetch GIFs by search term (for specific channel content)
   */
  async fetchBySearchTerm(searchTerm, maxGifs = 200) {
    try {
      this.resetState();
      console.log(`\n🔍 Searching Tenor for: "${searchTerm}"`);
      console.log('='.repeat(60));

      let pos = '';
      let totalFetched = 0;
      let pageCount = 0;

      do {
        pageCount++;
        console.log(`\n📥 Fetching page ${pageCount}...`);

        const params = {
          key: this.apiKey,
          q: searchTerm,
          limit: CONFIG.LIMIT_PER_REQUEST,
          pos: pos || undefined,
          contentfilter: 'off',
          media_filter: 'gif'
        };

        const response = await axios.get(`${this.baseUrl}/search`, { params });
        const data = response.data;

        if (!data.results || data.results.length === 0) {
          console.log('✅ No more GIFs found');
          break;
        }

        for (const gif of data.results) {
          const gifData = this.extractGifData(gif);
          this.allGifs.push(gifData);
          this.totalShares += gifData.shares || 0;
        }

        totalFetched += data.results.length;
        console.log(`   ✅ Fetched ${data.results.length} GIFs (Total: ${totalFetched})`);

        pos = data.next || '';
        await this.delay(500);

      } while (pos && totalFetched < maxGifs);

      return this.allGifs;
    } catch (error) {
      console.error('❌ Error searching GIFs:', error.message);
      throw error;
    }
  }

  /**
   * Normalize various GIF identifiers (ID, URL, share link) to a Tenor ID
   */
  extractGifIdFromInput(identifier) {
    if (!identifier) {
      return '';
    }

    const trimmed = identifier.trim();

    // Plain numeric ID
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    // Try to pull the numeric ID out of common Tenor URL patterns
    const urlMatch = trimmed.match(/(\d+)(?!.*\d)/);
    if (urlMatch) {
      return urlMatch[1];
    }

    return trimmed;
  }

  /**
   * Find the rank/position of a GIF within Tenor search results for a keyword
   */
  async findGifRankByKeyword(searchTerm, gifIdentifier, maxPages = 20, mediaType = 'gif') {
    if (!searchTerm) {
      throw new Error('Search term is required to determine GIF rank.');
    }

    const targetId = this.extractGifIdFromInput(gifIdentifier);
    if (!targetId) {
      throw new Error('Unable to determine GIF ID from the provided identifier.');
    }

    console.log(`\n🎯 Locating ${mediaType.toUpperCase()} ${targetId} for search term "${searchTerm}"`);
    console.log('='.repeat(60));

    let pos = '';
    let pageCount = 0;
    let rank = 0;

    do {
      pageCount++;
      console.log(`\n📥 Searching page ${pageCount}...`);

      const isSticker = mediaType === 'sticker';
      const params = {
        key: this.apiKey,
        q: searchTerm,
        limit: CONFIG.LIMIT_PER_REQUEST,
        pos: pos || undefined,
        contentfilter: 'off',
        media_filter: 'gif',
        ...(isSticker ? { searchfilter: 'sticker', type: 'sticker' } : {})
      };

      const response = await axios.get(`${this.baseUrl}/search`, { params });
      const results = response.data.results || [];

      if (results.length === 0) {
        break;
      }

      for (const gif of results) {
        rank++;
        const gifData = this.extractGifData(gif);

        if ((gifData.id || '').toString() === targetId) {
          console.log(`\n✅ Found ${mediaType.toUpperCase()} ${gifData.id} at rank position ${rank}`);
          return { rank, gif: gifData, searchTerm };
        }
      }

      pos = response.data.next || '';
      await this.delay(400);
    } while (pos && pageCount < maxPages);

    console.log('\n⚠️  GIF not found within the inspected result set.');
    return null;
  }

  /**
   * Find rank positions for every supplied tag (or GIF tags) for a GIF
   */
  async findTagRanksForGif({
    gifIdentifier,
    tags = [],
    maxPagesPerTag = 10,
    maxTags = 10,
    mediaType = 'gif'
  }) {
    const targetId = this.extractGifIdFromInput(gifIdentifier);
    if (!targetId) {
      throw new Error('GIF identifier is required to retrieve tag ranks.');
    }

    const gifMeta = await this.getGifDetails(targetId, mediaType);
    if (!gifMeta) {
      throw new Error(`Unable to fetch GIF details for ${targetId}`);
    }

    if (!tags.length) {
      tags = gifMeta.tags || [];
    }

    const uniqueTags = [...new Set(tags.filter(Boolean))].slice(0, maxTags);
    if (uniqueTags.length === 0) {
      console.log('⚠️  GIF does not contain any tags to inspect.');
      return { gif: gifMeta, ranks: [] };
    }

    const ranks = [];
    for (const tag of uniqueTags) {
      console.log(`\n🔎 Checking rank for tag "${tag}"`);
      const result = await this.findGifRankByKeyword(tag, targetId, maxPagesPerTag, mediaType);
      ranks.push({
        tag,
        rank: result?.rank ?? null,
        found: Boolean(result)
      });
      await this.delay(300);
    }

    return {
      gif: gifMeta,
      ranks
    };
  }

  /**
   * Extract relevant data from Tenor GIF object
   */
  extractGifData(gif) {
    // Handle both v1 and v2 API response formats
    const media = gif.media_formats || gif.media || {};
    
    return {
      id: gif.id,
      title: gif.title || gif.content_description || gif.h1_title || 'No title',
      url: gif.itemurl || gif.url || `https://tenor.com/view/${gif.id}`,
      created: gif.created || new Date().toISOString(),
      tags: gif.tags || gif.searchterm || [],
      shares: gif.shares || 0,
      hasaudio: gif.hasaudio || false,
      media: {
        gif: media.gif?.url || media.mediumgif?.url || '',
        tinygif: media.tinygif?.url || media.nanogif?.url || '',
        mp4: media.mp4?.url || media.tinymp4?.url || '',
        preview: media.gifpreview?.url || media.tinygif?.url || ''
      }
    };
  }

  /**
   * Scrape share count from Tenor webpage
   */
  async scrapeShareCount(gifUrl) {
    try {
      const response = await axios.get(gifUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 5000
      });
      
      const html = response.data;
      
      // Try to find share count in HTML
      // Common patterns: "shares": 123, data-shares="123", etc.
      const sharePatterns = [
        /"shares[""']:\s*(\d+)/i,
        /data-shares=["'](\d+)["']/i,
        /"shareCount[""']:\s*(\d+)/i,
        /shares:\s*(\d+)/i,
        /"share_count[""']:\s*(\d+)/i
      ];
      
      for (const pattern of sharePatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return parseInt(match[1], 10);
        }
      }
      
      return 0;
    } catch (error) {
      // Silently fail for scraping errors
      return 0;
    }
  }

  /**
   * Get detailed stats for a specific GIF
   */
  async getGifDetails(gifId, mediaType = 'gif') {
    try {
      const params = {
        key: this.apiKey,
        ids: gifId,
        media_filter: mediaType === 'sticker' ? 'minimal' : 'gif'
      };

      const response = await axios.get(`${this.baseUrl}/posts`, { params });
      if (response.data.results && response.data.results.length > 0) {
        return this.extractGifData(response.data.results[0]);
      }
      return null;
    } catch (error) {
      console.error(`❌ Error fetching GIF ${gifId}:`, error.message);
      return null;
    }
  }

  /**
   * Save results to JSON file
   */
  saveToJSON(filename = CONFIG.OUTPUT_FILE) {
    const output = {
      total_gifs: this.allGifs.length,
      total_stickers: this.allStickers.length,
      total_gif_shares: this.totalShares,
      total_sticker_shares: this.totalStickerShares,
      total_shares: this.totalShares + this.totalStickerShares,
      fetched_at: new Date().toISOString(),
      gifs: this.allGifs,
      stickers: this.allStickers
    };

    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    console.log(`\n💾 Saved to ${filename}`);
    return filename;
  }

  /**
   * Save results to CSV file
   */
  saveToCSV(filename = CONFIG.OUTPUT_CSV) {
    const headers = 'ID,Title,URL,Shares,Created,Tags,GIF_URL\n';
    const rows = this.allGifs.map(gif => {
      const title = (gif.title || '').replace(/"/g, '""');
      const tags = (gif.tags || []).join(';');
      return `"${gif.id}","${title}","${gif.url}",${gif.shares},"${gif.created}","${tags}","${gif.media.gif}"`;
    }).join('\n');

    fs.writeFileSync(filename, headers + rows);
    console.log(`💾 Saved to ${filename}`);
    return filename;
  }

  saveStickersToCSV(filename = CONFIG.OUTPUT_STICKER_CSV) {
    if (this.allStickers.length === 0) {
      console.log('ℹ️  No stickers to export');
      return null;
    }

    const headers = 'ID,Title,URL,Shares,Created,Tags,Asset_URL\n';
    const rows = this.allStickers.map(sticker => {
      const title = (sticker.title || '').replace(/"/g, '""');
      const tags = (sticker.tags || []).join(';');
      const assetUrl = sticker.media.gif || sticker.media.tinygif || sticker.media.webp || '';
      return `"${sticker.id}","${title}","${sticker.url}",${sticker.shares},"${sticker.created}","${tags}","${assetUrl}"`;
    }).join('\n');

    fs.writeFileSync(filename, headers + rows);
    console.log(`💾 Saved to ${filename}`);
    return filename;
  }

  /**
   * Display summary statistics
   */
  displayStats() {
    console.log('\n📊 CHANNEL STATISTICS');
    console.log('='.repeat(60));
    console.log(`\n🎬 Total GIFs in Channel: ${this.allGifs.length}`);
    console.log(`📈 GIF Shares: ${this.totalShares.toLocaleString()}`);
    console.log(`\n🎨 Total Stickers in Channel: ${this.allStickers.length}`);
    console.log(`📈 Sticker Shares: ${this.totalStickerShares.toLocaleString()}`);
    console.log(`\n💯 Combined Shares: ${(this.totalShares + this.totalStickerShares).toLocaleString()}`);
    console.log('='.repeat(60));
    
    if (this.allGifs.length > 0) {
      const avgShares = (this.totalShares / this.allGifs.length).toFixed(2);
      const maxShares = Math.max(...this.allGifs.map(g => g.shares || 0));
      const minShares = Math.min(...this.allGifs.map(g => g.shares || 0));
      
      console.log(`\nAverage GIF Shares: ${avgShares}`);
      console.log(`Max Shares (Single GIF): ${maxShares.toLocaleString()}`);
      console.log(`Min Shares (Single GIF): ${minShares.toLocaleString()}`);

      // Top 10 most shared GIFs
      const topGifs = [...this.allGifs]
        .sort((a, b) => (b.shares || 0) - (a.shares || 0))
        .slice(0, 10);

      console.log('\n🏆 Top 10 Most Shared GIFs:');
      console.log('-'.repeat(60));
      topGifs.forEach((gif, index) => {
        const title = gif.title.substring(0, 40);
        console.log(`${index + 1}. ${title.padEnd(42)} | ${(gif.shares || 0).toLocaleString()} shares`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n🎯 FINAL RESULT: ${(this.totalShares + this.totalStickerShares).toLocaleString()} TOTAL SHARES`);
    console.log('='.repeat(60));
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🎬 TENOR CHANNEL GIF FETCHER');
  console.log('='.repeat(60));

  const fetcher = new TenorChannelFetcher();

  // Get command line arguments
  const args = process.argv.slice(2);
  
  // Auto-detect if first argument is a URL or special keyword
  let mode = args[0] || process.env.FETCH_MODE || '';
  let value = args[1] || process.env.FETCH_VALUE || '';
  
  // Auto-detect mode from first argument
  if (args[0]) {
    const firstArg = args[0].toLowerCase();
    
    // If first arg contains tenor.com, @, or /users/, it's a channel URL
    if (args[0].includes('tenor.com') || args[0].startsWith('@') || args[0].includes('/users/') || args[0].includes('/profile/')) {
      mode = 'channel';
      value = args[0];
    }
    // If it's a known mode keyword, use it
    else if (['trending', 'search', 'username', 'channel', 'url', 'gifid', 'rank', 'tagrank'].includes(firstArg)) {
      mode = firstArg;
      value = args[1] || '';
    }
    // Otherwise assume it's a username for channel mode
    else {
      mode = 'channel';
      value = args[0];
    }
  }

  let shouldPersistResults = true;

  try {
    // Different fetching modes
    switch (mode.toLowerCase()) {
      case 'username':
      case 'channel':
      case 'url':
      case '':
        if (!value) {
          console.log('❌ Please provide a channel URL or username');
          console.log('\nUsage:');
          console.log('  node fetch_tenor_channel_gifs.js <channel_url>');
          console.log('  node fetch_tenor_channel_gifs.js https://tenor.com/@username');
          console.log('  node fetch_tenor_channel_gifs.js https://tenor.com/users/username');
          console.log('  node fetch_tenor_channel_gifs.js @username');
          console.log('  node fetch_tenor_channel_gifs.js username');
          console.log('\nOther modes:');
          console.log('  node fetch_tenor_channel_gifs.js search <search_term>');
          console.log('  node fetch_tenor_channel_gifs.js trending');
          console.log('  node fetch_tenor_channel_gifs.js rank "<search_term>" <gif_id_or_url>');
          console.log('  node fetch_tenor_channel_gifs.js tagrank <gif_id_or_url> [tag1 tag2 ...]');
          console.log('\nExamples:');
          console.log('  node fetch_tenor_channel_gifs.js https://tenor.com/users/duckracegp');
          console.log('  node fetch_tenor_channel_gifs.js duckracegp');
          console.log('  node fetch_tenor_channel_gifs.js @google');
          process.exit(1);
        }
        await fetcher.fetchChannelByUsername(value);
        break;

      case 'search':
        if (!value) {
          console.log('❌ Please provide a search term');
          process.exit(1);
        }
        await fetcher.fetchBySearchTerm(value);
        break;

      case 'trending':
        await fetcher.fetchTrending();
        break;

      case 'rank': {
        shouldPersistResults = false;
        const searchTerm = value || '';
        const gifIdentifier = args[2] || process.env.RANK_GIF_ID || '';
        const maxPages = parseInt(process.env.RANK_MAX_PAGES || '20', 10);

        if (!searchTerm || !gifIdentifier) {
          console.log('❌ Usage: node fetch_tenor_channel_gifs.js rank "<search_term>" <gif_id_or_url>');
          process.exit(1);
        }

        const rankResult = await fetcher.findGifRankByKeyword(searchTerm, gifIdentifier, maxPages);
        if (rankResult) {
          console.log(`\n🏅 GIF "${rankResult.gif.title}" is at position ${rankResult.rank} for "${searchTerm}"`);
        } else {
          console.log(`\n⚠️  Could not find the GIF within the inspected pages for "${searchTerm}"`);
        }
        break;
      }

      case 'tagrank': {
        shouldPersistResults = false;
        const gifIdentifier = value || process.env.RANK_GIF_ID || '';
        const providedTags = args.slice(2);
        const fallbackMaxTags = parseInt(process.env.RANK_MAX_TAGS || '10', 10);
        const maxPagesPerTag = parseInt(process.env.RANK_MAX_PAGES || '10', 10);
        const maxTags = providedTags.length > 0 ? providedTags.length : fallbackMaxTags;

        if (!gifIdentifier) {
          console.log('❌ Usage: node fetch_tenor_channel_gifs.js tagrank <gif_id_or_url> [tag1 tag2 ...]');
          process.exit(1);
        }

        const tagRankResult = await fetcher.findTagRanksForGif({
          gifIdentifier,
          tags: providedTags,
          maxPagesPerTag,
          maxTags
        });

        const gifTitle = tagRankResult.gif?.title || gifIdentifier;
        console.log(`\n🏷️  Tag ranks for GIF "${gifTitle}" (${tagRankResult.gif?.id || gifIdentifier})`);
        if (tagRankResult.ranks.length === 0) {
          console.log('⚠️  No tags available to check.');
        } else {
          tagRankResult.ranks.forEach(entry => {
            const rankLabel = entry.found ? `#${entry.rank}` : 'Not found';
            console.log(`  • ${entry.tag}: ${rankLabel}`);
          });
        }
        break;
      }

      case 'gifid':
        if (!value) {
          console.log('❌ Please provide a GIF ID');
          process.exit(1);
        }
        const gifDetails = await fetcher.getGifDetails(value);
        if (gifDetails) {
          fetcher.allGifs.push(gifDetails);
          fetcher.totalShares = gifDetails.shares || 0;
        }
        break;

      default:
        console.log('❌ Unknown mode:', mode);
        console.log('Valid modes: username, search, trending, gifid, rank, tagrank');
        process.exit(1);
    }

    // Display results
    if (shouldPersistResults && (fetcher.allGifs.length > 0 || fetcher.allStickers.length > 0)) {
      fetcher.displayStats();
      fetcher.saveToJSON();
      fetcher.saveToCSV();
      fetcher.saveStickersToCSV();

      console.log('\n✅ Fetch completed successfully!');
      console.log(`📁 Output files: ${CONFIG.OUTPUT_FILE}, ${CONFIG.OUTPUT_CSV}, ${CONFIG.OUTPUT_STICKER_CSV}`);
    } else if (shouldPersistResults) {
      console.log('\n⚠️  No GIFs or stickers found');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = TenorChannelFetcher;

