# Tab Finder for Papers

A lightweight Chrome MV3 extension for quickly finding open research, PDF, and documentation tabs.

## Use

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Click the extension icon and search by tab title or tab memo.

The popup searches the current window by default. Use the scope toggle to include every open browser window.

Use **편집** on a row to set a popup-only tab title and memo. Both are saved for the currently open tab and are included in search results.

## Development

Run the pure search tests:

```powershell
npm test
```

No build step is required. Chrome loads the source files directly.
