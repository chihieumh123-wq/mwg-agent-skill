---
name: gsc-request-indexing
description: >
  Gửi yêu cầu Google crawl lại và xem xét lập chỉ mục URL qua giao diện Search
  Console. Chỉ kích hoạt khi user chủ động yêu cầu gửi request indexing hoặc
  recrawl; thao tác này tác động bên ngoài và có thể dùng quota theo property.
user-invocable: true
when_to_use: >
  Trigger khi user yêu cầu request indexing, yêu cầu lập chỉ mục, gửi URL lên
  GSC, hoặc yêu cầu Google crawl lại URL.
category: seo-ops
keywords: [gsc, google-search-console, indexing, request-indexing, recrawl]
metadata:
  version: "1.0.0"
---

# GSC request indexing

Use the companion request-crawl workflow to submit URLs through the Search Console interface in a browser session the user has already authenticated. Google does not provide a general public API for the Search Console “Request indexing” button; do not substitute the Google Indexing API or call undocumented endpoints.

## Requirements

- The companion checker project must be installed and configured for the user's own account and Search Console properties.
- Chrome must have an authenticated Search Console session in the profile documented by that project.
- Use only the URLs and input source the user specified. Never guess a sheet, property, account, or URL.

## Workflow

1. Confirm the exact URL list and explain that requests are sent to Google, may use a limited daily quota, and do not guarantee indexing.
2. Validate and deduplicate the URLs. Show the exact URLs and count to be submitted. Do not add URLs based on recommendations, sitemaps, or adjacent rows unless the user asks.
3. Before sending, get the user's confirmation for this exact list and count. A general request to prepare or inspect a list is not confirmation to submit it.
4. Read the companion project's request-crawl instructions. Use its documented setup or probe mode first if the browser session or Search Console UI state is uncertain. A setup, check, or probe must stop before the actual request button is clicked.
5. After confirmation, run the documented request workflow for only the confirmed URLs. Respect the configured per-run limit, quota response, CAPTCHA, and login-required states. Stop on quota exhaustion, login required, or CAPTCHA; do not rotate accounts/properties or retry around those controls.
6. Report per-URL outcomes from the tool, separating requests Google accepted, requests already pending, and failures that occurred before or after clicking. Say clearly that acceptance is not a guarantee of indexing.

## Boundaries

- Never click “Request indexing” before the confirmation in step 3.
- Do not use private or undocumented Google endpoints, the Google Indexing API for arbitrary web pages, CAPTCHA solving, quota evasion, account rotation, or password handling.
- Do not request indexing for URLs outside the confirmed list.
- Do not expose cookies, tokens, OAuth files, environment values, private sheet IDs, or raw credential paths.

## Companion project

This skill describes the agent workflow. The browser automation is distributed separately; follow that project's `docs/REQUEST_CRAWL.md` for setup and command details.
