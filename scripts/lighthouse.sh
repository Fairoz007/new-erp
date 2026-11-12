#!/usr/bin/env bash
# Lighthouse run against a built copy of the app served by `vite preview`.
#   scripts/lighthouse.sh <url> <out-prefix> [lighthouse-bin]
# Runs the mobile (default) and desktop presets and prints the four category scores.
# Without a signed-in session only the sign-in screen renders, so this measures the initial
# bundle, first paint and the accessibility of that screen; signed-in pages are covered by the
# Playwright suite (e2e/) against staging.
set -euo pipefail
URL="${1:?url}"; OUT="${2:?out prefix}"; LH="${3:-npx -y lighthouse@12.8.2}"
for preset in mobile desktop; do
  flags=(--quiet --chrome-flags="--headless=new" --output=json --output-path="${OUT}-${preset}.json")
  [ "$preset" = desktop ] && flags+=(--preset=desktop)
  $LH "$URL" "${flags[@]}"
  node -e "const r=require('${OUT}-${preset}.json');const c=r.categories;console.log('${preset}', Object.fromEntries(Object.entries(c).map(([k,v])=>[k,Math.round(v.score*100)])), 'FCP', r.audits['first-contentful-paint'].displayValue, 'LCP', r.audits['largest-contentful-paint'].displayValue, 'TBT', r.audits['total-blocking-time'].displayValue)"
done
