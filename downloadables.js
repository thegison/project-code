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
  const publishForm = document.getElementById('publishForm');
  const publishTitle = document.getElementById('publishTitle');
  const publishDescription = document.getElementById('publishDescription');
  const publishCredit = document.getElementById('publishCredit');
  const publishFilesInput = document.getElementById('publishFiles');
  const publishDropzone = document.getElementById('publishDropzone');
  const choosePublishFiles = document.getElementById('choosePublishFiles');
  const publishFileList = document.getElementById('publishFileList');
  const publishRights = document.getElementById('publishRights');
  const publishButton = document.getElementById('publishButton');
  const publishStatus = document.getElementById('publishStatus');
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
  let isPublishing = false;
  const publishFiles = [];
  const MAX_PUBLISH_FILES = 20;
  const MAX_PUBLISH_FILE_BYTES = 35 * 1024 * 1024;
  const MAX_PUBLISH_BYTES = 75 * 1024 * 1024;

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

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function setPublishStatus(message, type = '') {
    publishStatus.textContent = message;
    publishStatus.className = `publish-status${type ? ` ${type}` : ''}`;
  }

  function totalPublishBytes() {
    return publishFiles.reduce((sum, file) => sum + file.size, 0);
  }

  function renderPublishFiles() {
    publishFileList.replaceChildren();
    publishTitle.disabled = isPublishing;
    publishDescription.disabled = isPublishing;
    publishCredit.disabled = isPublishing;
    publishRights.disabled = isPublishing;
    publishFilesInput.disabled = isPublishing;
    publishFiles.forEach((file, index) => {
      const row = document.createElement('li');
      row.className = 'publish-file-row';
      const name = document.createElement('span');
      name.className = 'publish-file-name';
      name.textContent = file.name;
      name.title = file.name;
      const size = document.createElement('span');
      size.className = 'publish-file-size';
      size.textContent = formatBytes(file.size);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-publish-file';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${file.name}`);
      remove.disabled = isPublishing;
      remove.addEventListener('click', () => {
        publishFiles.splice(index, 1);
        renderPublishFiles();
        setPublishStatus(publishFiles.length
          ? `${publishFiles.length} ${publishFiles.length === 1 ? 'file' : 'files'} selected · ${formatBytes(totalPublishBytes())} of 75 MB.`
          : 'Your files stay on this device. Choose files to create a publish-ready website ZIP.');
      });
      row.append(name, size, remove);
      publishFileList.append(row);
    });

    publishButton.disabled = isPublishing || !publishFiles.length || !publishRights.checked || !publishTitle.value.trim();
    choosePublishFiles.disabled = isPublishing || publishFiles.length >= MAX_PUBLISH_FILES;
  }

  function addPublishFiles(fileList) {
    const existing = new Set(publishFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    const rejected = [];
    for (const file of fileList) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(key)) continue;
      if (file.size > MAX_PUBLISH_FILE_BYTES) {
        rejected.push(`${file.name} is over 35 MB`);
        continue;
      }
      if (publishFiles.length >= MAX_PUBLISH_FILES) {
        rejected.push(`Only ${MAX_PUBLISH_FILES} files can be added`);
        break;
      }
      if (totalPublishBytes() + file.size > MAX_PUBLISH_BYTES) {
        rejected.push('The 75 MB total size limit would be exceeded');
        break;
      }
      publishFiles.push(file);
      existing.add(key);
    }

    renderPublishFiles();
    if (rejected.length) {
      setPublishStatus(`${rejected.join('. ')}. Remove a file or choose smaller files to continue.`, 'error');
    } else if (publishFiles.length) {
      setPublishStatus(`${publishFiles.length} ${publishFiles.length === 1 ? 'file' : 'files'} selected · ${formatBytes(totalPublishBytes())} of 75 MB.`);
    }
  }

  function getUniquePublishNames(files) {
    const used = new Set();
    return files.map((file) => {
      const base = safeFileName(file.name);
      const extensionIndex = base.lastIndexOf('.');
      const stem = extensionIndex > 0 ? base.slice(0, extensionIndex) : base;
      const extension = extensionIndex > 0 ? base.slice(extensionIndex) : '';
      let candidate = base;
      let suffix = 2;
      while (used.has(candidate.toLowerCase())) {
        candidate = `${stem} (${suffix})${extension}`;
        suffix += 1;
      }
      used.add(candidate.toLowerCase());
      return candidate;
    });
  }

  function createPublishedPage(title, description, credit, files, names) {
    const cards = files.map((file, index) => {
      const safeHref = escapeHTML(`files/${encodeURIComponent(names[index])}`);
      const safeName = escapeHTML(file.name);
      const safeMime = escapeHTML(file.type || '');
      let preview;
      if (file.type.startsWith('image/')) {
        preview = `<img src="${safeHref}" alt="${safeName}" loading="lazy">`;
      } else if (file.type.startsWith('audio/')) {
        preview = `<audio controls preload="metadata" src="${safeHref}">Your browser does not support audio playback.</audio>`;
      } else if (file.type.startsWith('video/')) {
        preview = `<video controls preload="metadata" src="${safeHref}">Your browser does not support video playback.</video>`;
      } else {
        preview = '<div class="file-icon" aria-hidden="true">↧</div>';
      }
      const type = safeMime ? ` · ${safeMime}` : '';
      return `<article class="card"><div class="preview">${preview}</div><div class="details"><h2>${safeName}</h2><p>${escapeHTML(formatBytes(file.size))}${type}</p><a class="download" href="${safeHref}" download="${escapeHTML(names[index])}">Download file <span aria-hidden="true">↓</span></a></div></article>`;
    }).join('\n');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHTML(description || 'A collection of files shared with care.')}">
  <meta name="theme-color" content="#101110">
  <title>${escapeHTML(title)}</title>
  <style>
    :root{color-scheme:dark;--bg:#101110;--panel:#1a1c1a;--ink:#f1eee7;--muted:#a4a59e;--accent:#e16a45;--line:#343632;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}header,main,footer{width:min(1040px,calc(100% - 36px));margin:auto}
    header{padding:64px 0 34px;border-bottom:1px solid var(--line)}.eyebrow{margin:0 0 10px;color:#f19a79;font:500 11px ui-monospace,monospace;letter-spacing:1.6px;text-transform:uppercase}
    h1{margin:0;font:600 clamp(36px,7vw,64px)/1.08 Georgia,serif;letter-spacing:-1.5px}header p:last-child{max-width:620px;margin:17px 0 0;color:#c1c6be;font-size:16px;line-height:1.7}
    main{padding:30px 0 56px}.count{margin:0 0 17px;color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
    .card{min-width:0;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.preview{display:grid;min-height:180px;place-items:center;overflow:hidden;background:#222522}
    .preview img,.preview video{display:block;width:100%;max-height:360px;object-fit:contain}.preview audio{width:calc(100% - 26px)}.file-icon{color:#f19a79;font-size:48px}
    .details{padding:14px}.details h2{overflow-wrap:anywhere;margin:0 0 7px;font-size:14px}.details p{margin:0 0 13px;color:var(--muted);font-size:11px}
    .download{display:flex;justify-content:space-between;align-items:center;padding:10px 11px;border-radius:4px;background:var(--accent);color:white;font-size:12px;font-weight:600;text-decoration:none}.download:hover{background:#bd4d30}
    footer{padding:18px 0 28px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.6}footer strong{color:#d5d4cb}
    @media(max-width:520px){header{padding-top:42px}.grid{grid-template-columns:1fr}.preview{min-height:160px}}
  </style>
</head>
<body>
  <header><p class="eyebrow">A collection, shared</p><h1>${escapeHTML(title)}</h1><p>${escapeHTML(description || 'A collection of files shared with care.')}</p></header>
  <main><p class="count">${files.length} ${files.length === 1 ? 'file' : 'files'} in this collection</p><div class="grid">${cards}</div></main>
  <footer><strong>Credits &amp; permissions</strong><br>${escapeHTML(credit || 'Shared by the collection creator.')}</footer>
</body>
</html>`;
  }

  async function publishFilesAsWebsite() {
    if (!window.JSZip) {
      setPublishStatus('The ZIP library did not load. Check your connection and refresh the page.', 'error');
      return;
    }
    if (!publishFiles.length || !publishRights.checked || !publishTitle.value.trim()) {
      renderPublishFiles();
      setPublishStatus('Add files, enter a website title, and confirm you have permission to publish them.', 'error');
      return;
    }

    isPublishing = true;
    renderPublishFiles();
    publishButton.textContent = 'Building your website…';
    setPublishStatus('Packing your files into a publish-ready website…');
    try {
      const zip = new window.JSZip();
      const files = [...publishFiles];
      const names = getUniquePublishNames(files);
      files.forEach((file, index) => zip.file(`files/${names[index]}`, file));
      zip.file('index.html', createPublishedPage(
        publishTitle.value.trim(),
        publishDescription.value.trim(),
        publishCredit.value.trim(),
        files,
        names
      ));
      zip.file('README.txt', `PUBLISHING THIS WEBSITE\n\n1. Extract this ZIP on your computer.\n2. Create a new GitHub repository (or open an existing one).\n3. Upload index.html and the entire files folder to the repository's main/root folder.\n4. Open repository Settings > Pages.\n5. Choose "Deploy from a branch", select your main branch and the /(root) folder, then save.\n6. Wait for GitHub Pages to publish. The website address will appear in Settings > Pages.\n\nKeep index.html and the files folder together. The website is static and needs no build step or backend.\n\nMake sure you have permission to publish every file and include any required credits or license information.`);
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } },
        (progress) => setPublishStatus(`Building your website ZIP… ${Math.round(progress.percent)}%`)
      );
      const baseName = safeFileName(publishTitle.value.trim()).replace(/\.[^.]+$/, '').replace(/\s+/g, '-').toLowerCase();
      triggerDownload(blob, `${baseName || 'my-collection'}-website.zip`);
      setPublishStatus('Your website ZIP is ready. Extract it, then follow README.txt to publish with GitHub Pages.', 'success');
    } catch (error) {
      setPublishStatus(`Could not build the website ZIP: ${error.message}`, 'error');
    } finally {
      isPublishing = false;
      publishButton.innerHTML = 'Build my website <span aria-hidden="true">↗</span>';
      renderPublishFiles();
    }
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
  choosePublishFiles.addEventListener('click', () => publishFilesInput.click());
  publishFilesInput.addEventListener('change', () => {
    addPublishFiles(publishFilesInput.files);
    publishFilesInput.value = '';
  });
  publishDropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    publishDropzone.classList.add('is-dragging');
  });
  publishDropzone.addEventListener('dragleave', (event) => {
    if (!publishDropzone.contains(event.relatedTarget)) publishDropzone.classList.remove('is-dragging');
  });
  publishDropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    publishDropzone.classList.remove('is-dragging');
    addPublishFiles(event.dataTransfer.files);
  });
  publishRights.addEventListener('change', renderPublishFiles);
  publishTitle.addEventListener('input', renderPublishFiles);
  publishForm.addEventListener('submit', (event) => {
    event.preventDefault();
    publishFilesAsWebsite();
  });

  renderPublishFiles();
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
