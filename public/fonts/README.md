# Fonts

## Manifold DSA (brand font)

The site's brand typeface is **Manifold DSA**, DSA's brand font. It is wired up
and shipped here:

```
public/fonts/manifold-dsa/ManifoldDSA-Medium.woff2   (weight 400 — normal)
public/fonts/manifold-dsa/ManifoldDSA-Bold.woff2     (weight 600–800 — bold)
```

- **`@font-face`** is declared at the top of `app/styles/global.css`; the CSS
  font stack (`--font`) lists `"Manifold DSA"` first with **Inter** as the
  loading/failure fallback.
- **Provenance:** these are the chapter's own web fonts, taken from the theme
  the live `siliconvalleydsa.org` already serves publicly. Used with the
  chapter's authorization as a continuation of its existing brand-font use.

Only the modern `.woff2` files are included (every current browser supports
woff2); the legacy `.woff`/`.ttf` the old theme also shipped aren't needed.

When this moves onto official DSA infrastructure, confirm the font sits under
DSA's own brand-font arrangement there (nothing to change technically).
