(() => {
  const MAX_FILES = 12;
  const MAX_FILE_BYTES = 35 * 1024 * 1024;
  const MAX_BUNDLE_BYTES = 80 * 1024 * 1024;
  const API_URL = 'https://commons.wikimedia.org/w/api.php';

  const form = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const resultsGrid = document.getElementById('resultsGrid');
  const statusMessage = document.getElementById('statusMessage');
  const resultCount = document.getElementById('resultCount');
  const bundleHeading = document.getElementById('bundleHeading');
  const bundleHint = document.getElementById('bundleHint');
  const bundleSize = document.getElementById('bundleSize');
  const selectedList = document.getElementById('selectedList');
  const zipButton = document.getElementById('zipButton');
  const clearButton = document.getElementById('clearButton');
  const licenseFilter = document.getElementById('licenseFilter');
  const sortOrder = document.getElementById('sortOrder');
  const resetTools = document.getElementById('resetTools');
  const categoryButtons = [...document.querySelectorAll('.category-button')];
  const categories = {
    all: { label: 'Everything', search: '', matches: () => true },
    photography: { label: 'Photography', search: 'photographs', matches: (file) => file.mime.startsWith('image/') },
    illustration: { label: 'Art & illustration', search: 'illustrations drawings', matches: (file) => file.mime.startsWith('image/') },
    audio: { label: 'Audio', search: 'audio recordings', matches: (file) => file.mime.startsWith('audio/') },
    video: { label: 'Video', search: 'videos', matches: (file) => file.mime.startsWith('video/') },
    maps: { label: 'Maps & documents', search: 'maps charts documents', matches: (file) => file.mime.startsWith('image/') || file.mime === 'application/pdf' }
  };
  const selected = new Map();
  let searchController;
  let isPreparingZip = false;
  let isDownloading = false;
  let activeCategory = 'all';
  let searchResults = [];

  function plainText(value) {
    if (!value) return '';
    return new DOMParser().parseFromString(String(value), 'text/html').body.textContent.trim();
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'Size unknown';
    if (bytes === 0) return '0 MB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function safeFileName(name) {
    return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180) || 'download';
  }

  function setStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message${type ? ` ${type}` : ''}`;
  }

  function updateAddress(query = searchInput.value) {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set('q', query.trim());
    else url.searchParams.delete('q');
    url.searchParams.set('category', activeCategory);
    url.searchParams.set('license', licenseFilter.value);
    url.searchParams.set('sort', sortOrder.value);
    window.history.replaceState(null, '', url);
  }

  function getMetadata(page) {
    const info = page.imageinfo && page.imageinfo[0];
    const metadata = info && info.extmetadata ? info.extmetadata : {};
    return {
      title: page.title.replace(/^File:/i, ''),
      url: info && info.url,
      thumb: info && (info.thumburl || info.url),
      size: info && info.size,
      mime: (info && info.mime) || '',
      license: plainText(metadata.LicenseShortName && metadata.LicenseShortName.value) || 'License details',
      licenseUrl: metadata.LicenseUrl && metadata.LicenseUrl.value,
      artist: plainText(metadata.Artist && metadata.Artist.value) || 'Creator not listed'
    };
  }

  function fileKind(mime) {
    if (mime.startsWith('image/')) return { label: 'Image', icon: '▧' };
    if (mime.startsWith('audio/')) return { label: 'Audio', icon: '♫' };
    if (mime.startsWith('video/')) return { label: 'Video', icon: '▶' };
    return { label: 'File', icon: '↧' };
  }

  function createCard(file) {
    const card = document.createElement('article');
    card.className = 'result-card';
    const kind = fileKind(file.mime);

    const imageBox = document.createElement('div');
    imageBox.className = 'result-image';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'result-type';
    typeLabel.textContent = kind.label;
    imageBox.append(typeLabel);

    if (file.thumb && file.mime.startsWith('image/')) {
      const image = document.createElement('img');
      image.src = file.thumb;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => {
        image.remove();
        const fallback = document.createElement('span');
        fallback.className = 'file-symbol';
        fallback.textContent = kind.icon;
        imageBox.append(fallback);
      }, { once: true });
      imageBox.append(image);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'file-symbol';
      fallback.textContent = kind.icon;
      imageBox.append(fallback);
    }

    const info = document.createElement('div');
    info.className = 'result-info';
    const title = document.createElement('p');
    title.className = 'result-title';
    title.textContent = file.title;
    title.title = file.title;

    const meta = document.createElement('div');
    meta.className = 'result-meta';
    const size = document.createElement('span');
    size.textContent = formatBytes(file.size);
    const license = document.createElement('a');
    license.className = 'license-label';
    license.textContent = `✓ ${file.license}`;
    license.href = file.licenseUrl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(`File:${file.title}`).replace(/%20/g, '_')}`;
    license.target = '_blank';
    license.rel = 'noopener noreferrer';
    license.title = `License: ${file.license}. Creator: ${file.artist}`;
    meta.append(size, license);

    const actions = document.createElement('div');
    actions.className = 'result-actions';
    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'download-one';
    downloadButton.textContent = '↓';
    downloadButton.title = `Download ${file.title}`;
    downloadButton.setAttribute('aria-label', `Download ${file.title}`);
    downloadButton.disabled = isPreparingZip || isDownloading || !file.url || !file.size || file.size > MAX_FILE_BYTES;
    if (file.size > MAX_FILE_BYTES) {
      downloadButton.title = `Files over ${formatBytes(MAX_FILE_BYTES)} can be opened from the source link instead.`;
    }
    downloadButton.addEventListener('click', () => downloadOne(file, downloadButton));
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.dataset.fileTitle = file.title;
    addButton.addEventListener('click', () => toggleSelected(file));
    const originalLink = document.createElement('a');
    originalLink.href = file.url;
    originalLink.target = '_blank';
    originalLink.rel = 'noopener noreferrer';
    originalLink.title = `Open original file: ${file.title}`;
    originalLink.setAttribute('aria-label', `Open original file: ${file.title}`);
    originalLink.textContent = '↗';
    originalLink.addEventListener('click', (event) => {
      if (!file.url) event.preventDefault();
    });
    actions.append(downloadButton, addButton, originalLink);

    info.append(title, meta, actions);
    card.append(imageBox, info);
    updateAddButton(addButton, file);
    return card;
  }

  function updateAddButton(button, file) {
    const isAdded = selected.has(file.title);
    const currentBytes = [...selected.values()].reduce((sum, item) => sum + (item.size || 0), 0);
    const exceedsSize = (file.size || 0) > MAX_FILE_BYTES || currentBytes + (file.size || 0) > MAX_BUNDLE_BYTES;
    const atCapacity = selected.size >= MAX_FILES;
    button.textContent = isAdded ? '✓ In bundle' : '+ Add to ZIP';
    button.classList.toggle('is-added', isAdded);
    button.setAttribute('aria-pressed', String(isAdded));
    button.disabled = isPreparingZip || isDownloading || (!isAdded && (exceedsSize || atCapacity || !file.url || !file.size));
    if (!isAdded && file.size > MAX_FILE_BYTES) {
      button.title = `This file is over the ${formatBytes(MAX_FILE_BYTES)} per-file ZIP limit.`;
    } else if (!isAdded && exceedsSize) {
      button.title = 'This would exceed the 80 MB bundle limit.';
    } else if (atCapacity && !isAdded) {
      button.title = `A bundle can contain up to ${MAX_FILES} files.`;
    } else if (!file.size && !isAdded) {
      button.title = 'The file size is not listed, so it cannot be added to a browser ZIP.';
    } else {
      button.title = '';
    }
    const card = button.closest('.result-card');
    if (card) card.classList.toggle('is-selected', isAdded);
  }

  function refreshAddButtons() {
    resultsGrid.querySelectorAll('.result-card').forEach((card, index) => {
      const file = displayedFiles[index];
      if (!file) return;
      const addButton = card.querySelector('button[data-file-title]');
      if (addButton) updateAddButton(addButton, file);
      const downloadButton = card.querySelector('.download-one');
      if (downloadButton) {
        downloadButton.disabled = isPreparingZip || isDownloading || !file.url || !file.size || file.size > MAX_FILE_BYTES;
      }
    });
  }

  function matchesLicense(file, filter) {
    const license = file.license.toLowerCase();
    if (filter === 'reuse') return license.includes('public domain') || license.includes('cc0');
    if (filter === 'attribution') return /cc\s*by\b/.test(license) && !/by[-\s]sa/.test(license);
    if (filter === 'sharealike') return /by[-\s]sa|share[-\s]alike/.test(license);
    return true;
  }

  function renderResults() {
    const license = licenseFilter.value;
    const sort = sortOrder.value;
    const filtered = searchResults.filter((file) => matchesLicense(file, license));
    if (sort === 'largest') filtered.sort((a, b) => (b.size || 0) - (a.size || 0));
    if (sort === 'smallest') filtered.sort((a, b) => (a.size || 0) - (b.size || 0));
    if (sort === 'title') filtered.sort((a, b) => a.title.localeCompare(b.title));
    displayedFiles = filtered;
    resultsGrid.replaceChildren();
    filtered.forEach((file) => resultsGrid.append(createCard(file)));

    const filterIsActive = license !== 'all';
    const sortIsActive = sort !== 'relevance';
    resetTools.hidden = !filterIsActive && !sortIsActive;
    resultCount.textContent = filterIsActive
      ? `${filtered.length} of ${searchResults.length} results`
      : `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-results';
      empty.textContent = searchResults.length
        ? 'No files match this license filter. Try another license or reset the filters.'
        : 'No files found. Try another category or a broader search phrase.';
      resultsGrid.append(empty);
    }
  }

  let displayedFiles = [];

  function renderSelected() {
    selectedList.replaceChildren();
    const files = [...selected.values()];
    const bytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    bundleSize.textContent = `${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatBytes(bytes)} / 80 MB`;
    bundleHeading.textContent = files.length
      ? `${files.length} ${files.length === 1 ? 'find' : 'finds'} in your bundle`
      : 'Nothing in your bundle yet';
    bundleHint.textContent = files.length
      ? 'Ready when you are. We’ll fetch and compress everything on this device.'
      : 'Add a few finds from the shelf and they’ll be packed into one ZIP.';
    selectedList.classList.toggle('has-items', files.length > 0);
    zipButton.disabled = files.length === 0 || isPreparingZip || isDownloading || !window.JSZip;
    clearButton.disabled = files.length === 0 || isPreparingZip;
    zipButton.innerHTML = isPreparingZip
      ? '<span aria-hidden="true">…</span> Packing your ZIP'
      : '<span aria-hidden="true">↓</span> Make my ZIP';

    files.forEach((file) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'selected-name';
      name.textContent = file.title;
      name.title = file.title;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-selected';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${file.title} from bundle`);
      remove.disabled = isPreparingZip;
      remove.addEventListener('click', () => toggleSelected(file));
      item.append(name, remove);
      selectedList.append(item);
    });
    refreshAddButtons();
  }

  function toggleSelected(file) {
    if (isPreparingZip) return;
    if (selected.has(file.title)) {
      selected.delete(file.title);
    } else {
      if (selected.size >= MAX_FILES) {
        setStatus(`A ZIP can include up to ${MAX_FILES} files. Remove one to add another.`, 'error');
        return;
      }
      if (!file.size || file.size > MAX_FILE_BYTES) {
        setStatus(`“${file.title}” is too large or has no size listed, so it can’t be added to a browser ZIP.`, 'error');
        return;
      }
      const currentBytes = [...selected.values()].reduce((sum, item) => sum + item.size, 0);
      if (currentBytes + file.size > MAX_BUNDLE_BYTES) {
        setStatus(`That would exceed the ${formatBytes(MAX_BUNDLE_BYTES)} bundle limit.`, 'error');
        return;
      }
      selected.set(file.title, file);
      setStatus('');
    }
    renderSelected();
  }

  async function search(query) {
    const term = query.trim();
    const category = categories[activeCategory];
    const searchTerm = [term, category.search].filter(Boolean).join(' ') || 'space';
    updateAddress(term);
    if (searchController) searchController.abort();
    const controller = new AbortController();
    searchController = controller;
    resultsGrid.setAttribute('aria-busy', 'true');
    licenseFilter.disabled = true;
    sortOrder.disabled = true;
    resetTools.disabled = true;
    resultsGrid.replaceChildren(...Array.from({ length: 8 }, () => {
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';
      skeleton.setAttribute('aria-hidden', 'true');
      return skeleton;
    }));
    resultCount.textContent = '';
    document.getElementById('resultsHeading').textContent = `Searching ${category.label.toLowerCase()}${term ? ` for “${term}”` : ''}`;
    setStatus('Searching Wikimedia Commons…');

    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: searchTerm,
      gsrnamespace: '6',
      gsrlimit: '16',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '640',
      format: 'json',
      formatversion: '2',
      origin: '*'
    });

    try {
      const response = await fetch(`${API_URL}?${params}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Commons search returned HTTP ${response.status}.`);
      const data = await response.json();
      if (searchController !== controller) return;
      if (data.error) throw new Error(data.error.info || 'Wikimedia Commons could not complete this search.');
      const pages = data.query && data.query.pages ? data.query.pages : [];
      searchResults = pages
        .filter((page) => page.imageinfo && page.imageinfo.length && page.imageinfo[0].url)
        .map(getMetadata)
        .filter(category.matches);
      if (!searchResults.length) {
        displayedFiles = [];
        resultsGrid.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'empty-results';
        empty.textContent = 'No files found for that search. Try a broader phrase or one of the quick finds above.';
        resultsGrid.append(empty);
        document.getElementById('resultsHeading').textContent = `No ${category.label.toLowerCase()} found`;
        resultCount.textContent = '0 results';
        setStatus('Try another category or a broader search phrase.');
        return;
      }
      renderResults();
      document.getElementById('resultsHeading').textContent = term
        ? `${category.label} for “${term}”`
        : `Explore ${category.label.toLowerCase()}`;
      setStatus('Openly licensed media from Wikimedia Commons. Check each file’s license before using it.', 'success');
    } catch (error) {
      if (error.name === 'AbortError' || searchController !== controller) return;
      resultsGrid.replaceChildren();
      displayedFiles = [];
      searchResults = [];
      document.getElementById('resultsHeading').textContent = 'Search couldn’t load';
      setStatus(`${error.message} Check your connection and try again.`, 'error');
    } finally {
      if (searchController === controller) {
        resultsGrid.setAttribute('aria-busy', 'false');
        licenseFilter.disabled = false;
        sortOrder.disabled = false;
        resetTools.disabled = false;
      }
    }
  }

  function triggerDownload(blob, name) {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  async function downloadOne(file, button) {
    if (button.disabled) return;
    isDownloading = true;
    renderSelected();
    setStatus(`Downloading “${file.title}”…`);
    try {
      const response = await fetch(file.url);
      if (!response.ok) throw new Error(`Couldn’t download “${file.title}” (HTTP ${response.status}).`);
      const blob = await response.blob();
      if (blob.size > MAX_FILE_BYTES) throw new Error(`“${file.title}” is larger than the direct-download limit.`);
      triggerDownload(blob, safeFileName(file.title));
      setStatus(`Downloaded “${file.title}”.`, 'success');
    } catch (error) {
      setStatus(`${error.message} Open the source file from its card to download it there.`, 'error');
    } finally {
      isDownloading = false;
      renderSelected();
    }
  }

  async function makeZip() {
    if (!window.JSZip || !selected.size || isPreparingZip || isDownloading) {
      if (!window.JSZip) setStatus('The ZIP library did not load. Refresh the page and try again.', 'error');
      return;
    }
    isPreparingZip = true;
    renderSelected();
    setStatus('Fetching your selected files…');
    const archive = new window.JSZip();
    const files = [...selected.values()];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setStatus(`Fetching ${index + 1} of ${files.length}: ${file.title}`);
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`Couldn’t download “${file.title}” (HTTP ${response.status}).`);
        const blob = await response.blob();
        if (blob.size > MAX_FILE_BYTES) throw new Error(`“${file.title}” is larger than the per-file ZIP limit.`);
        archive.file(safeFileName(file.title), blob);
      }
      const credits = files.map((file) => {
        const source = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.title).replace(/%20/g, '_')}`;
        return [
          file.title,
          `Creator: ${file.artist}`,
          `License: ${file.license}`,
          `Source: ${source}`,
          `License details: ${file.licenseUrl || source}`,
          ''
        ].join('\n');
      }).join('\n');
      archive.file('ATTRIBUTION.txt', `OpenShelf download credits\nCheck each license before reuse.\n\n${credits}`);
      setStatus('Compressing files into your ZIP…');
      const zipBlob = await archive.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (progress) => setStatus(`Compressing your ZIP… ${Math.round(progress.percent)}%`)
      );
      triggerDownload(zipBlob, 'openshelf-downloads.zip');
      setStatus('Your ZIP is ready. Happy making!', 'success');
    } catch (error) {
      setStatus(`${error.message} Try opening the file directly from its card.`, 'error');
    } finally {
      isPreparingZip = false;
      renderSelected();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    search(searchInput.value);
  });
  document.querySelectorAll('.query-chip').forEach((button) => {
    button.addEventListener('click', () => {
      searchInput.value = button.dataset.query;
      search(button.dataset.query);
    });
  });
  categoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      categoryButtons.forEach((categoryButton) => {
        const isActive = categoryButton === button;
        categoryButton.classList.toggle('is-active', isActive);
        categoryButton.setAttribute('aria-pressed', String(isActive));
      });
      search(searchInput.value);
    });
  });
  licenseFilter.addEventListener('change', () => {
    renderResults();
    updateAddress();
  });
  sortOrder.addEventListener('change', () => {
    renderResults();
    updateAddress();
  });
  resetTools.addEventListener('click', () => {
    licenseFilter.value = 'all';
    sortOrder.value = 'relevance';
    renderResults();
    updateAddress();
  });
  zipButton.addEventListener('click', makeZip);
  clearButton.addEventListener('click', () => {
    if (isPreparingZip) return;
    selected.clear();
    setStatus('');
    renderSelected();
  });

  renderSelected();
  const urlParams = new URLSearchParams(window.location.search);
  const requestedCategory = urlParams.get('category');
  const requestedQuery = urlParams.get('q');
  const requestedLicense = urlParams.get('license');
  const requestedSort = urlParams.get('sort');
  if (['all', 'reuse', 'attribution', 'sharealike'].includes(requestedLicense)) {
    licenseFilter.value = requestedLicense;
  }
  if (['relevance', 'largest', 'smallest', 'title'].includes(requestedSort)) {
    sortOrder.value = requestedSort;
  }
  if (requestedCategory && categories[requestedCategory]) {
    activeCategory = requestedCategory;
    categoryButtons.forEach((button) => {
      const isActive = button.dataset.category === activeCategory;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }
  searchInput.value = requestedQuery || 'space';
  search(searchInput.value);
})();
