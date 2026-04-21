/**
 * pr-comment.mjs
 *
 * Consumes the JSON report from `validate-frontmatter.mjs --json` and posts
 * GitHub PR review comments. Invoked from `.github/workflows/pr-validate.yml`
 * via actions/github-script (which provides an Octokit-compatible `github`
 * and `context`).
 *
 * Behavior:
 *   - Each auto-fixable issue becomes an inline review comment on the exact
 *     line, with a ```suggestion``` block so the contributor can one-click
 *     apply the fix.
 *   - Taxonomy warnings and unfixable errors are collected into a single
 *     summary comment (upserted — edited in place on subsequent pushes so
 *     the PR doesn't collect a pile of stale summaries).
 *   - Exits non-zero only when unfixable errors exist, so auto-fixable
 *     issues don't block the PR check.
 */

import fs from "node:fs";

const SUMMARY_SENTINEL = "<!-- frontmatter-validator-summary -->";

function formatSuggestionBody(applied) {
  const header = `**${applied.rule}** — ${applied.message}\n\n`;
  if (applied.after === "" || applied.after === null) {
    // Deletion. GitHub suggestion blocks can't express "delete line" directly;
    // approximate with an empty suggestion.
    return (
      header +
      "Suggested fix — delete this line:\n\n" +
      "```suggestion\n```\n"
    );
  }
  return (
    header +
    "Suggested fix:\n\n" +
    "```suggestion\n" +
    applied.after +
    "\n```\n"
  );
}

function formatSummary(report) {
  const lines = [SUMMARY_SENTINEL];
  lines.push("### Frontmatter validator report");
  lines.push("");
  const s = report.summary;
  lines.push(
    `- Scanned **${s.files}** changed file(s). Auto-fixable: **${s.fixed}**. Warnings: **${s.warnings}**. Unfixable errors: **${s.errors}**.`
  );
  lines.push("");

  if (s.errors > 0) {
    lines.push("#### ❌ Unfixable errors");
    lines.push("These need a human. The rest of the site will still build (the safety-net plugin falls back to minimal frontmatter), but the product will render with empty tags until fixed.");
    lines.push("");
    for (const r of report.results) {
      for (const e of r.errors) {
        lines.push(`- \`${r.file}:${e.line}\` — **${e.rule}**: ${e.message}`);
      }
    }
    lines.push("");
  }

  if (s.warnings > 0) {
    lines.push("#### ⚠️ Warnings");
    lines.push("These won't block the PR. Taxonomy warnings typically mean a tag is misspelled or a new tag needs adding to `screenshot_tags.csv`.");
    lines.push("");
    for (const r of report.results) {
      for (const w of r.warnings) {
        lines.push(`- \`${r.file}\` — **${w.rule}**: ${w.message}`);
      }
    }
    lines.push("");
  }

  if (s.fixed > 0) {
    lines.push("#### 🔧 Auto-fixable");
    lines.push(`Left inline suggestions on ${s.fixed} line(s). Click **Commit suggestion** to apply, or run \`node scripts/validate-frontmatter.mjs --fix\` locally.`);
    lines.push("");
  }

  if (s.fixed === 0 && s.errors === 0 && s.warnings === 0) {
    lines.push("✅ No issues detected. Thanks for contributing!");
  }

  return lines.join("\n");
}

async function findExistingSummary({ github, context }) {
  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
    per_page: 100,
  });
  return comments.find((c) => c.body && c.body.includes(SUMMARY_SENTINEL));
}

async function upsertSummary({ github, context, body }) {
  const existing = await findExistingSummary({ github, context });
  if (existing) {
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      body,
    });
  }
}

async function postInlineSuggestions({ github, context, report }) {
  const commitSha = context.payload.pull_request.head.sha;

  // Fetch existing inline review comments so we don't duplicate. Match by
  // file+line+rule — simplest stable key.
  const { data: existing } = await github.rest.pulls.listReviewComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number,
    per_page: 100,
  });
  const seen = new Set(
    existing
      .filter((c) => c.body && c.body.includes("**") && c.path)
      .map((c) => `${c.path}:${c.line}:${(c.body.match(/\*\*(.*?)\*\*/) || [])[1] || ""}`)
  );

  for (const r of report.results) {
    for (const a of r.applied) {
      const key = `${a.file}:${a.line}:${a.rule}`;
      if (seen.has(key)) continue;
      try {
        await github.rest.pulls.createReviewComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          pull_number: context.payload.pull_request.number,
          commit_id: commitSha,
          path: a.file,
          line: a.line,
          side: "RIGHT",
          body: formatSuggestionBody(a),
        });
      } catch (err) {
        // Line may not exist in the diff (e.g. unchanged line far from the
        // diff hunk). Fall back to silently skipping — the summary comment
        // will still list the issue.
        console.log(`Skipped inline comment for ${a.file}:${a.line} — ${err?.message || err}`);
      }
    }
  }
}

export async function run({ github, context, core, reportPath, validatorExit }) {
  if (!context.payload.pull_request) {
    core.info("Not a pull_request event; skipping.");
    return;
  }

  const raw = fs.readFileSync(reportPath, "utf-8");
  const report = JSON.parse(raw);

  await postInlineSuggestions({ github, context, report });
  await upsertSummary({ github, context, body: formatSummary(report) });

  if (report.summary.errors > 0 || validatorExit === 1) {
    core.setFailed(
      `Frontmatter validator found ${report.summary.errors} unfixable error(s). See the PR summary comment for details.`
    );
  } else if (report.summary.fixed > 0) {
    core.notice(
      `Frontmatter validator found ${report.summary.fixed} auto-fixable issue(s) — inline suggestions posted.`
    );
  }
}
