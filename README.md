# QR Card

Show a QR code that adds you as a contact. Scanning it opens the phone's native
"Add Contact" screen with your name, job title, company, phone numbers, emails,
websites, address and note already filled in.

Keep several cards — one per company — and swipe between them. Each card has its own
QR pattern, colours and centre logo.

It is a static, client-side web app: no backend, no accounts, no network. Install it on
Android or iOS from the browser and it works offline.

## Use it on your phone

1. Open the site over HTTPS on the phone.
2. **Android (Chrome):** menu → *Add to Home screen* / *Install app*.
   **iOS (Safari):** Share → *Add to Home Screen*.
3. Launch it from the new icon. It opens full screen, with no browser chrome, and works
   in airplane mode.

Tap the QR code to go full screen for someone to scan. If a scanner struggles with your
colours or logo, tap **Use plain black** — every scanner reads that.

## Cards live on the device

Cards are stored in this browser's `localStorage`. They are not synced anywhere, which
also means clearing site data or switching phones loses them.

**Settings → Export all cards** writes a `.json` backup; **Import cards** restores it,
either adding to what is there or replacing everything. Do this before clearing browser
data or moving to a new phone.

## Deploy to GitHub Pages

Every path in the app is relative, so it works unchanged from a `/<repo-name>/` subpath.

```sh
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source: Deploy from a branch**, branch
`main`, folder `/ (root)`. The `.nojekyll` file at the root stops Jekyll from hiding
files, and HTTPS — required for both the service worker and Add to Home Screen — comes
free with Pages.

Any other static host works the same way: upload the folder as-is.

**After changing a shipped file, bump `APP_VERSION` in `js/version.js`.** The service
worker serves the app shell cache-first and names its cache `qrcard-v<APP_VERSION>`, so
returning visitors keep the old version until that number changes. The same number is
shown under Settings → About.

## Layout

```
index.html                  app shell, icon sprite
css/app.css                 design tokens, light and dark
js/app.js                   hash router and bootstrap
js/version.js               APP_VERSION: shown in About, names the SW cache
js/store.js                 the only module that touches localStorage
js/vcard.js                 vCard 3.0 serialiser
js/qr.js                    wrapper around qr-code-styling
js/share.js                 Web Share API and downloads
js/views/                   display, editor, cards, settings, present
vendor/qr-code-styling.js   MIT, vendored so the app works offline
tools/make-icons.ps1        regenerates the app icons
tests/                      test suite (browser page + node runner)
```

No build step and no framework: the files in the repository are the files that ship.

## Licence

MIT — see [LICENSE](LICENSE). The vendored `qr-code-styling` library is MIT too.

## Tests

```sh
node tests/run.mjs           # vCard, storage and QR-option assertions
python -m http.server 8000   # then open http://localhost:8000/tests/
```

The browser page runs the same assertions plus a live render, because the QR library
only runs in a browser. `localhost` counts as a secure context, so the service worker
and install prompt work there too.

The assertions cannot tell you whether a code is *readable*, so after changing styling,
colours or the logo: render it and scan it with a real phone.

## Notes on the QR itself

- Error correction is pinned to level **H** (30% recovery). A vCard payload, a centre
  logo and a non-square module style all eat into readability; level H is what keeps the
  result scannable.
- The logo is clamped to 22% of the code's width and is decoration only — it is not
  embedded in the contact, because a photo would multiply the payload size.
- Uploaded logos are downscaled to a 512px edge before being stored, to stay inside the
  ~5MB `localStorage` budget.
- The editor warns when the QR and background colours fall below a 3:1 contrast ratio.
- All six module patterns were decoded back to a byte-identical vCard with ZXing (the
  decoder behind most phone scanner apps) across a range of sizes. The lighter-weight
  jsQR decoder occasionally misses the **Dots** pattern, so that one carries a note in
  the editor: it is the most decorative and the least robust.
- Long vCard lines are deliberately not folded at 75 octets: folding is spec-correct but
  adds bytes to an already dense QR, and scanners accept unfolded input.
