const form = document.getElementById('channel-form');
const input = document.getElementById('channel-input');
const submitBtn = form.querySelector('button');
const statusPanel = document.getElementById('status-panel');
const emptyState = document.getElementById('empty-state');
const toast = document.getElementById('toast');
const timestampEl = document.getElementById('timestamp');
const totalGifsEl = document.getElementById('total-gifs');
const totalSharesEl = document.getElementById('total-shares');
const totalStickersEl = document.getElementById('total-stickers');
const totalStickerSharesEl = document.getElementById('total-sticker-shares');
const gifSearchInput = document.getElementById('search-gifs');
const gifSortSelect = document.getElementById('sort-order');
const stickerSearchInput = document.getElementById('search-stickers');
const stickerSortSelect = document.getElementById('sort-stickers');
const gifGrid = document.getElementById('results-grid');
const stickerGrid = document.getElementById('stickers-section');
const gifFiltersWrapper = document.getElementById('gif-filters');
const stickerFiltersWrapper = document.getElementById('sticker-filters');
const viewToggleButtons = document.querySelectorAll('.toggle[data-view]');
const libraryHint = document.getElementById('library-hint');
const libraryEmpty = document.getElementById('library-empty');
const libraryEmptyHeading = document.getElementById('library-empty-heading');
const libraryEmptyCopy = document.getElementById('library-empty-copy');
const template = document.getElementById('gif-card-template');
const shareRow = document.getElementById('share-row');
const shareInput = document.getElementById('share-input');
const copyBtn = document.getElementById('copy-link');
const viewerBanner = document.getElementById('viewer-banner');
const viewerChannel = document.getElementById('viewer-channel');
const resetViewBtn = document.getElementById('reset-view');
const defaultEmptyState = emptyState.innerHTML;

const urlParams = new URLSearchParams(window.location.search);
const initialChannel = (() => {
  const param = urlParams.get('channel');
  if (!param) return '';
  try {
    return decodeURIComponent(param);
  } catch (_) {
    return param;
  }
})();

const state = {
  gifs: [],
  stickers: [],
  filtered: {
    gif: [],
    sticker: []
  },
  currentView: 'gif',
  activeChannel: initialChannel
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = input.value.trim();

  if (!value) {
    showToast('Please enter a Tenor URL or username.');
    return;
  }

  loadChannel(value);
});

gifSearchInput.addEventListener('input', () => filterAndRender('gif'));
gifSortSelect.addEventListener('change', () => filterAndRender('gif'));
stickerSearchInput.addEventListener('input', () => filterAndRender('sticker'));
stickerSortSelect.addEventListener('change', () => filterAndRender('sticker'));
copyBtn.addEventListener('click', copyShareLink);
resetViewBtn.addEventListener('click', exitViewerMode);
viewToggleButtons.forEach((button) =>
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    if (state.currentView !== view && !(view === 'sticker' && !state.stickers.length) && !(view === 'gif' && !state.gifs.length)) {
      state.currentView = view;
      updateViewVisibility();
    }
  })
);

if (initialChannel) {
  enterViewerMode(initialChannel);
  loadChannel(initialChannel);
}

async function loadChannel(value) {
  setLoading(true);

  try {
    const response = await fetch(`/api/channel?value=${encodeURIComponent(value)}`);

    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error || 'Unable to fetch channel data.');
    }

    const data = await response.json();
    state.gifs = data.gifs || [];
    state.stickers = data.stickers || [];
    state.activeChannel = value;
    filterAndRender('gif');
    filterAndRender('sticker');
    updateStats(data);
    updateShareLink(value);
    showPanels();
    showToast('Channel loaded successfully ✅');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unexpected error. Please retry.');
  } finally {
    setLoading(false);
  }
}

function filterAndRender(kind = 'gif') {
  const searchEl = kind === 'sticker' ? stickerSearchInput : gifSearchInput;
  const sortEl = kind === 'sticker' ? stickerSortSelect : gifSortSelect;
  const items = kind === 'sticker' ? state.stickers : state.gifs;

  const searchTerm = searchEl.value.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!searchTerm) return true;
    const haystack = `${item.title || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  const sorted = sortData(filtered, sortEl.value);
  state.filtered[kind] = sorted;
  renderMedia(kind, sorted);
}

function sortData(data, sortKey) {
  const sorted = [...data];
  switch (sortKey) {
    case 'shares-asc':
      return sorted.sort((a, b) => (a.shares || 0) - (b.shares || 0));
    case 'shares-desc':
    default:
      return sorted.sort((a, b) => (b.shares || 0) - (a.shares || 0));
  }
}

function renderMedia(kind, mediaItems) {
  const gridEl = kind === 'sticker' ? stickerGrid : gifGrid;
  const isActiveView = state.currentView === kind;

  gridEl.innerHTML = '';
  if (!mediaItems.length) {
    gridEl.classList.add('grid--empty');
    if (isActiveView && libraryEmpty) {
      libraryEmptyHeading.textContent =
        kind === 'sticker' ? 'No stickers match this filter.' : 'No GIFs match this filter.';
      libraryEmptyCopy.textContent = 'Try clearing your filters or switch libraries to see more assets.';
      libraryEmpty.classList.remove('hidden');
    }
    return;
  }

  if (isActiveView && libraryEmpty) {
    libraryEmpty.classList.add('hidden');
  }
  gridEl.classList.remove('grid--empty');

  mediaItems.forEach((item) => {
    const clone = template.content.cloneNode(true);
    const img = clone.querySelector('img');
    const title = clone.querySelector('h4');
    const meta = clone.querySelector('.meta');
    const tagsContainer = clone.querySelector('.tags');
    const tagRankSection = clone.querySelector('.tag-rank-section');
    const tagRankBtn = clone.querySelector('.tag-rank-btn');
    const tagRankList = clone.querySelector('.tag-rank-list');
    const shares = clone.querySelector('.shares');
    const link = clone.querySelector('.link');

    img.src = item.media?.gif || item.media?.preview || '';
    img.alt = item.title || 'Tenor asset';
    title.textContent = item.title || (kind === 'sticker' ? 'Untitled Sticker' : 'Untitled GIF');

    const created = item.created ? new Date(item.created).toLocaleDateString() : 'Unknown date';
    meta.textContent = `Created ${created} • Audio ${item.hasaudio ? 'On' : 'Off'}`;

    (item.tags || []).slice(0, 4).forEach((tag) => {
      const span = document.createElement('span');
      span.textContent = tag;
      tagsContainer.appendChild(span);
    });

    tagRankSection.style.display = 'flex';
    tagRankList.innerHTML = '<p class="tag-rank-placeholder">Tap to fetch rank positions</p>';
    tagRankBtn.addEventListener('click', () => handleTagRankClick(item, tagRankBtn, tagRankList));
    if (item.tagRanks) {
      renderTagRankList(item.tagRanks, tagRankList, item.tagRanksFetchedAt);
      tagRankBtn.textContent = 'Refresh tag ranks';
    }

    shares.textContent = `${formatNumber(item.shares || 0)} shares`;
    link.href = item.url;

    gridEl.appendChild(clone);
  });
}

function updateStats(data) {
  totalGifsEl.textContent = formatNumber(data.totalGifs || 0);
  totalSharesEl.textContent = formatNumber(data.totalShares || 0);
  totalStickersEl.textContent = formatNumber(data.totalStickers || 0);
  totalStickerSharesEl.textContent = formatNumber(data.totalStickerShares || 0);
  timestampEl.textContent = `Fetched ${new Date(data.fetchedAt).toLocaleString()}`;
}

function showPanels() {
  statusPanel.classList.remove('hidden');
  const hasGifs = state.gifs.length > 0;
  const hasStickers = state.stickers.length > 0;

  if (!hasGifs && hasStickers) {
    state.currentView = 'sticker';
  } else if (!hasStickers && hasGifs) {
    state.currentView = 'gif';
  }

  updateViewVisibility(hasGifs, hasStickers);

  if (hasGifs || hasStickers) {
    emptyState.style.display = 'none';
  } else {
    emptyState.style.display = 'block';
    emptyState.innerHTML = defaultEmptyState;
  }
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Fetching…' : 'Fetch GIFs';

  if (isLoading && state.activeChannel) {
    emptyState.style.display = 'block';
    emptyState.innerHTML = `
      <div>
        <h3>Loading channel data…</h3>
        <p>Fetching stats for ${state.activeChannel}</p>
      </div>
    `;
  } else if (!state.gifs.length && !state.stickers.length) {
    emptyState.style.display = 'block';
    emptyState.innerHTML = defaultEmptyState;
  }
}

function updateViewVisibility(hasGifs = state.gifs.length > 0, hasStickers = state.stickers.length > 0) {
  if (!hasGifs && !hasStickers) {
    gifGrid.classList.add('hidden');
    stickerGrid.classList.add('hidden');
    gifFiltersWrapper.style.display = 'none';
    stickerFiltersWrapper.style.display = 'none';
    if (libraryHint) {
      libraryHint.textContent = 'No media available yet. Fetch a channel to get started.';
    }
    return;
  }

  if (!hasGifs) {
    state.currentView = 'sticker';
  }
  if (!hasStickers) {
    state.currentView = 'gif';
  }

  const viewingGif = state.currentView === 'gif';
  gifGrid.classList.toggle('hidden', !viewingGif);
  stickerGrid.classList.toggle('hidden', viewingGif);
  gifFiltersWrapper.classList.toggle('active', viewingGif);
  stickerFiltersWrapper.classList.toggle('active', !viewingGif && hasStickers);
  if (libraryHint) {
    libraryHint.textContent = viewingGif
      ? 'Showing channel GIFs. Use the filters to refine results.'
      : 'Showing channel stickers. Adjust filters to spotlight the right assets.';
  }

  const activeItems = state.filtered[viewingGif ? 'gif' : 'sticker'] || [];
  if (libraryEmpty) {
    if (!activeItems.length) {
      libraryEmptyHeading.textContent = viewingGif ? 'No GIFs match this filter.' : 'No stickers match this filter.';
      libraryEmptyCopy.textContent = 'Try clearing your filters or switch libraries to see more assets.';
      libraryEmpty.classList.remove('hidden');
    } else {
      libraryEmpty.classList.add('hidden');
    }
  }

  viewToggleButtons.forEach((button) => {
    const targetView = button.dataset.view;
    const disabled = (targetView === 'gif' && !hasGifs) || (targetView === 'sticker' && !hasStickers);
    button.disabled = disabled;
    button.classList.toggle('active', targetView === state.currentView && !disabled);
    button.classList.toggle('toggle--disabled', disabled);
  });
}

function formatNumber(num) {
  if (Number.isNaN(num)) return '0';
  return Number(num).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function updateShareLink(channelValue) {
  if (!channelValue) {
    shareRow.classList.add('hidden');
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('channel', channelValue);
  history.replaceState(null, '', url);

  shareInput.value = url.toString();
  shareRow.classList.remove('hidden');
}

async function copyShareLink() {
  if (!shareInput.value) return;
  try {
    await navigator.clipboard.writeText(shareInput.value);
    showToast('Shareable link copied to clipboard 📋');
  } catch (_) {
    shareInput.select();
    document.execCommand('copy');
    showToast('Link copied to clipboard 📋');
  }
}

function enterViewerMode(channelValue) {
  viewerBanner.classList.remove('hidden');
  viewerChannel.textContent = channelValue;
  input.value = channelValue;
  input.readOnly = true;
  submitBtn.classList.add('is-hidden');
}

function exitViewerMode() {
  viewerBanner.classList.add('hidden');
  input.readOnly = false;
  submitBtn.classList.remove('is-hidden');
  state.activeChannel = '';
  history.replaceState(null, '', window.location.pathname);
  shareRow.classList.add('hidden');
  emptyState.innerHTML = defaultEmptyState;
  emptyState.style.display = 'block';
  input.focus();
}

async function handleTagRankClick(gif, button, listEl) {
  if (!gif?.id) {
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Fetching…';
  listEl.innerHTML = '<p class="tag-rank-placeholder">Fetching tag ranks…</p>';

  try {
    const params = new URLSearchParams({ gifId: gif.id });
    params.append('type', gif.assetType || 'gif');
    if (gif.tags?.length) {
      params.append('tags', gif.tags.join(','));
    }

    const response = await fetch(`/api/gif-ranks?${params.toString()}`);
    const rawBody = await response.text();
    let data;

    if (!response.ok) {
      try {
        const parsed = JSON.parse(rawBody);
        throw new Error(parsed.error || 'Unable to fetch tag ranks.');
      } catch (err) {
        throw new Error(rawBody || 'Unable to fetch tag ranks.');
      }
    }

    try {
      data = JSON.parse(rawBody);
    } catch (_) {
      throw new Error('Received an unexpected response from the server.');
    }

    gif.tagRanks = data.ranks || [];
    gif.tagRanksFetchedAt = data.fetchedAt;
    renderTagRankList(gif.tagRanks, listEl, gif.tagRanksFetchedAt);
    button.textContent = 'Refresh tag ranks';
  } catch (error) {
    console.error('Tag rank fetch failed:', error);
    listEl.innerHTML = `<p class="tag-rank-placeholder error">${error.message || 'Failed to load tag ranks.'}</p>`;
    button.textContent = originalText;
  } finally {
    button.disabled = false;
  }
}

function renderTagRankList(ranks = [], container, fetchedAt) {
  container.innerHTML = '';

  if (!ranks.length) {
    container.innerHTML = '<p class="tag-rank-placeholder">No tag ranks available.</p>';
    return;
  }

  ranks.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'tag-rank-row';

    const label = document.createElement('span');
    label.className = 'tag-label';
    label.textContent = entry.tag;

    const value = document.createElement('span');
    value.className = 'tag-rank-value';
    value.textContent = entry.found && entry.rank ? `#${entry.rank}` : 'Not found';

    row.appendChild(label);
    row.appendChild(value);
    container.appendChild(row);
  });

  if (fetchedAt) {
    const updated = document.createElement('p');
    updated.className = 'tag-rank-updated';
    updated.textContent = `Updated ${new Date(fetchedAt).toLocaleTimeString()}`;
    container.appendChild(updated);
  }
}

