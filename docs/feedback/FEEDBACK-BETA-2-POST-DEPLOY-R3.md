# Beta-2 Post-Deploy Feedback Round 3 (v0.28)

> Date: 2026-03-25
> Source: Live testing on deployed site (desktop Chrome)

---

## F-07: Settings (theme/lang) still leak between accounts

**Severity**: HIGH
**Status**: Likely NOT YET DEPLOYED — the clearTokens() fix (PR #191) was merged to main but may not have been built and pushed to CloudFront yet. If already deployed, investigate further.

**Verification needed**: Check CloudFront deployment timestamp vs PR #191 merge time (2026-03-25T12:4x).

**If still occurring after deploy**: The theme reverting to 'system' suggests the settings API is returning defaults and overwriting. Check the `!s.updated_at` guard in ProfilePage — it should skip overwrite when API has no saved settings.

---

## F-08: Nav menu labels don't update when changing locale on Profile page

**Severity**: MEDIUM
**Symptoms**: Change language to Japanese on Profile → content pane updates → nav menu stays in English → navigate to another page → nav updates to Japanese
**Root cause**: The mobile tab bar labels use static HTML with `data-i18n` attributes. The inline `<script>` in BaseLayout.astro translates them on `DOMContentLoaded` only. When the user changes locale dynamically via the Profile settings, `data-locale` attribute is updated but the translation script doesn't re-run.

**Fix**: After changing locale in `applyLocale()`, re-run the nav label translation by querying `[data-i18n]` elements and updating their textContent. This is the same logic as the DOMContentLoaded script but triggered on locale change.

---

*Collected: 2026-03-25 | v0.28 post-deploy round 3*
