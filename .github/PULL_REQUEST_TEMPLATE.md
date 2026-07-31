<!--
Thanks for contributing! A few checks before you submit — the PR validator
will run automatically but ticking these off locally saves a round trip.
-->

## Summary

<!-- What changed? New app? Additional screenshots? A tag fix? -->

## Checklist

- [ ] Screenshots are in the correct platform folder (`Web/`, `iOS/`, `Android/`, or `Email/`).
- [ ] For a new app: `index.html` includes `layout: gallery` and `gallery-directory: <AppName>`.
- [ ] Ran `node scripts/validate-frontmatter.mjs --dry-run` locally — no unfixable errors.
- [ ] Any digit-leading filename keys in `image_tags` are quoted (e.g. `"20240327.png":`).
- [ ] No manual YAML edits I'm unsure about — if the validator flags something in review, I'll click "Commit suggestion" to apply the fix.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full frontmatter reference and common gotchas.
