---
name: gsc-index-check
description: >
  Kiểm tra trạng thái lập chỉ mục của URL bằng quy trình Google Search Console
  URL Inspection. Kích hoạt khi người dùng muốn kiểm tra, audit hoặc báo cáo
  URL đã được Google index chưa. Không dùng skill này để gửi yêu cầu lập chỉ mục.
user-invocable: true
when_to_use: >
  Trigger khi user yêu cầu check index, kiểm tra URL trên GSC, URL Inspection,
  hoặc báo cáo trạng thái indexed/not indexed.
category: seo-ops
keywords: [gsc, google-search-console, indexing, index-check, url-inspection]
metadata:
  version: "1.0.0"
---

# GSC index check

Use the companion GSC checker project to inspect URLs through the official Search Console URL Inspection API. This action is read-only: it reports Google's current inspection data and does not submit a crawl request or change the page.

## Requirements

- The companion checker project must be installed in the current environment and configured for the user's own Google account and Search Console properties.
- Use the user's own input file or configured worklist. Never guess a Google Sheet, property, credential path, or URL.
- The assistant needs access to the project files and its documented execution method. This skill does not include credentials or the checker implementation.

## Workflow

1. Confirm the URLs or worklist the user wants checked. If URLs are supplied directly, preserve them exactly and report malformed or duplicate entries before running.
2. Read the companion project's setup and batch execution instructions. Confirm the configured input source and output destination from that documentation; do not inspect or print credential files.
3. Run the documented index-check command for only the requested scope. Prefer the project's dry-run or one-URL limit when configuration is uncertain. Do not switch to another Google account or property to bypass access restrictions.
4. Read the generated result and summarize each URL using the returned status and relevant details. Distinguish `INDEXED`, `NOT_INDEXED`, and blocked/error states; do not infer an indexing result from an HTTP response, sitemap presence, or a previous report.
5. State the inspection time and any API, permission, quota, or stale-cache limitation shown by the tool. Do not claim that Google will index a URL just because inspection completed.

## Boundaries

- This skill only checks status. If the user also wants a request for indexing, switch to `gsc-request-indexing` and follow its confirmation step.
- Do not edit the page, sitemap, robots rules, canonical tags, or Search Console settings as part of a status check.
- Do not expose tokens, OAuth client files, environment values, private sheet IDs, or raw credential paths in the report.
- Do not retry indefinitely when quota or access errors occur. Report the blocker and stop.

## Companion project

This skill describes the agent workflow. The checker itself is distributed separately; follow that project's `SETUP.md` and `docs/MCP_BATCH_EXECUTION.md` for installation and command details.
