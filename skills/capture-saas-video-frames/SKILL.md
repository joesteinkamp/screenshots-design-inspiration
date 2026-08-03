---
name: capture-saas-video-frames
description: Capture and curate gallery-ready SaaS product screenshots from public, embeddable YouTube walkthroughs without a YouTube API key. Use when Codex needs to watch a product demo, mine a YouTube video for UI inspiration, build a reviewable contact sheet, or add approved video frames to this screenshot gallery.
---

# Capture SaaS Video Frames

Turn one public YouTube product video into a reviewed set of SaaS UI screenshots. Use the official embedded player; never download streams, inspect private media endpoints, or bypass playback restrictions.

## Workflow

1. Confirm the source URL and product name. Default the platform to `Web` and the final set to at most 12 screenshots.
2. Tell the user that the skill will load and sample the public video through YouTube's embedded player and that they are responsible for reuse rights. Do not continue past a rights objection.
3. Create a temporary session:

   ```bash
   node skills/capture-saas-video-frames/scripts/capture-session.mjs init \
     --url "<youtube-url>" --product "<product>" --platform Web --max-final 12
   ```

4. Serve this skill directory on `0.0.0.0` using an available local port. Run the server from the integration checkout only and keep its session ID so it can be stopped:

   ```bash
   python3 -m http.server <port> --bind 0.0.0.0 \
     --directory skills/capture-saas-video-frames
   ```
5. Generate the capture routine with the server's base URL. It emits the exact harness URL. Open that URL with the host's supported browser-control surface and capture the timestamps in `session.json` at 1920x1080 into `candidates/`. Prefer the host browser tool when available. Otherwise run the generated Playwright routine:

   ```bash
   node skills/capture-saas-video-frames/scripts/capture-session.mjs runner \
     --session "<session-dir>" --base-url "http://localhost:<port>"
   playwright-cli -s=saas-video-capture open about:blank
   playwright-cli -s=saas-video-capture run-code --filename "<session-dir>/capture.run-code.js"
   playwright-cli -s=saas-video-capture close
   ```

   With a host browser tool, mirror the generated routine: wait for `window.saasCapture`, call `captureAt(seconds)` for each timestamp, and save a screenshot of `#player-shell` using the generated `frame-<id>-t-<milliseconds>.png` convention.

   Treat player errors as terminal. Do not substitute a downloader for private, deleted, age-gated, live, DRM-blocked, or embedding-disabled videos.
6. Build the review artifact:

   ```bash
   node skills/capture-saas-video-frames/scripts/capture-session.mjs contact-sheet \
     --session "<session-dir>"
   ```

7. Stop the capture server, serve the session directory on the same port, and open `http://localhost:<port>/contact-sheet.html`. Inspect every candidate visually and recommend a diverse set dominated by product UI. Reject presenters, ads, title cards, transitions, unrelated slides, player overlays, blank frames, and near-duplicates. Give the user the local URL and ask them to approve the final frame IDs.
8. Stage only approved IDs:

   ```bash
   node skills/capture-saas-video-frames/scripts/capture-session.mjs stage \
     --session "<session-dir>" --select "001,007,014"
   ```

9. Show the exact staged filenames and proposed `Platform/Product` destination. Obtain explicit confirmation before modifying the gallery.
10. Install after confirmation:

   ```bash
   node skills/capture-saas-video-frames/scripts/capture-session.mjs install \
     --session "<session-dir>" --repo "<repo-root>"
   node scripts/validate-frontmatter.mjs --dry-run
   ```

11. Report the validation result and draft a Change Log entry. Never write the Change Log, commit, push, or publish without the user's separate approval.

## Capture Rules

- Process one video per session.
- Accept `youtube.com/watch`, `youtu.be`, `/embed/`, `/shorts/`, and `/live/` URLs only when they resolve to an 11-character video ID.
- Use no YouTube API key. The harness obtains duration and playback state from the IFrame Player API.
- Sample at roughly five-second intervals, capped at 60 evenly distributed frames, excluding the first and last three seconds when duration permits.
- Capture only `#player-shell`; do not include the harness or browser chrome.
- Preserve the complete 16:9 player frame, including genuine letterboxing. Do not crop product UI speculatively.
- Use filenames shaped as `<product-slug>__youtube-<video-id>__t-<hhmmss>.png`. Store no sidecar provenance manifest in the gallery.
- Keep all pre-approval output under `/tmp/screenshots-design-inspiration-video-capture/`.

## Review Criteria

Prefer frames that:

- show a coherent product screen at readable scale;
- add a distinct flow, state, navigation pattern, data visualization, form, or interaction;
- are visually stable and free of playback controls or transition blur;
- collectively cover the product rather than repeating the same dashboard.

The contact sheet marks likely blank and perceptually duplicate frames, but treat those marks as guidance. Make the final selection visually.

## Failure Handling

- If browser control is unavailable, report the missing dependency and leave the session intact.
- If the official player rejects embedding, stop and ask for a different embeddable video.
- If sampling misses an important flow, initialize a new session with `--start`, `--end`, or `--sample-count` to inspect a tighter range.
- If installation finds an existing filename with different bytes, append `-2`, `-3`, and so on. Skip byte-identical files.
- Never overwrite an existing product `index.html`; create the minimal gallery frontmatter only when it is absent.
