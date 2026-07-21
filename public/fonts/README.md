# Fonts

## Manifold DSA (brand font — licensed, NOT included)

The site's brand typeface is **Manifold DSA**, DSA's licensed font. The font
files are **intentionally not committed**: they're licensed and this site is
public, so redistributing them without holding the license would be
infringement. Until the chapter has the license, the site falls back to
**Inter** (bundled) — `"Manifold DSA"` is already first in the CSS font stack.

### Enabling it once licensed

1. Obtain the licensed **web** font files (`.woff2`) for the weights we use.
2. Place them here as:

   ```
   public/fonts/manifold-dsa/ManifoldDSA-Regular.woff2   (weight 400)
   public/fonts/manifold-dsa/ManifoldDSA-Bold.woff2      (weight 700)
   ```

   (Add more `@font-face` rules for other weights if the license includes them.)

3. Uncomment the `@font-face` block at the top of `app/styles/global.css`.
4. Commit the files and push — Workers Builds redeploys and the brand font
   activates. No other change needed.

Keep the font license terms in mind: only the web `.woff2` files needed for the
site, served from our own origin, per whatever the DSA license permits.
