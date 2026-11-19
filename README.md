# OpenShelf

OpenShelf is a static website for finding freely licensed and public-domain files on Wikimedia Commons. Browse by photography, art and illustration, audio, video, or maps and documents; search, filter by license, sort by size or title, and share a link to the current catalog view. Download individual finds or bundle selections into a compressed ZIP archive. Search and file transfers happen in the browser; the project has no backend and requires no API key.

Visitors can also use **Publish your files** to select their own media and generate a separate, publish-ready static website ZIP. It contains an accessible gallery page, the selected files, and a `README.txt` with GitHub Pages instructions. This feature builds the site in the visitor’s browser; OpenShelf does not upload or host those files. The publishing package accepts up to 20 files, 35 MB per file, and 75 MB total.

To publish a collection, enter a title, choose files or drag them into the upload area, confirm you have permission to publish them, and select **Build my website**. Extract the downloaded ZIP, then upload its `index.html` and complete `files` folder to a GitHub repository. Enable GitHub Pages from the repository’s **Settings → Pages** and deploy from the main branch’s root folder. The ZIP includes these steps in `README.txt`.

## Run it

Open `index.html` in a modern browser while connected to the internet. The site uses the Wikimedia Commons API for search and loads JSZip from jsDelivr to create compressed archives. Both services must be reachable.

## Publish with GitHub Pages

1. Add these project files to a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select the branch containing `index.html` and the `/ (root)` folder, then save.
4. Open the published Pages URL. No server-side build step is needed.

The Commons download bundle limits a bundle to 12 files, 35 MB per file, and 80 MB total to keep browser memory use manageable. Every Commons ZIP includes an `ATTRIBUTION.txt` with file creators, licenses, and source links. Some files may not permit cross-origin downloading; if so, open the original file from its result card. Check each file’s license and attribution requirements before reuse.

## AI project prompt

> Create this project using HTML, CSS, and JavaScript. It must work as a static website and be publishable using GitHub Pages. You may create as many files and folders as needed.
