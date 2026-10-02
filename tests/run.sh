#!/bin/sh
# Runs every test. Needs data/ (python3 tools/build_data.py) and widget/ (node tools/build_widget.js).
# tests/browser-xss.js is the one test that needs a real browser: see the comment at its top.
set -e
cd "$(dirname "$0")/.."
node tests/tailo.test.js
node tests/sandhi.test.js
node tests/convert.test.js
node tests/store.test.js
node tests/widget.test.js
node tests/security.test.js
node tests/fuzz.test.js
