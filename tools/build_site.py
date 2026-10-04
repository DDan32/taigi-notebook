"""Build the deployable site (the repository root) from src/page.html.

    python3 tools/build_site.py

Writes, next to this repository's other files:
    index.html             a complete HTML document: a strict Content-Security-Policy first, then the page
    _headers               the same policy as real HTTP headers, for hosts that can send them
                           (Cloudflare Pages, Netlify). GitHub Pages ignores this file.
    manifest.webmanifest   so "Add to Home Screen" opens it like an app
    icon.svg, icon-180.png, .nojekyll

src/page.html is written in the Claude Artifact format (title, font link and <style> first, then the
body), so the same file can still be published there. This script moves the leading <title>/<link>/
<style> into <head>, hashes each inline <style> and puts the hashes in the policy, and refuses to build
if the page contains anything the policy would block (inline scripts, on*= handlers, style= attributes,
links to other hosts), so a broken policy is found here and not on the phone.
"""
import base64
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_CSS = "https://fonts.googleapis.com/"
FONTS_FILES = "https://fonts.gstatic.com"

LEADING = re.compile(r"\A\s*(?:(?:<title>.*?</title>|<link\b[^>]*>|<style>.*?</style>)\s*)+", re.S)
STYLE = re.compile(r"<style>(.*?)</style>", re.S)

RESET = """:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,sans-serif;background:#fafafa}
img{max-width:100%}
[hidden]{display:none!important}
html.framed body{display:none!important}
"""

MANIFEST = """{
  "name": "台語生字簿",
  "short_name": "台語生字簿",
  "lang": "zh-Hant",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#F6FAF3",
  "theme_color": "#256F45",
  "icons": [
    {"src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
    {"src": "icon-180.png", "sizes": "180x180", "type": "image/png"}
  ]
}
"""

ICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
<rect width="180" height="180" fill="#256F45"/>
<rect x="26" y="26" width="128" height="128" fill="#F6FAF3"/>
<path d="M90 26v128M26 90h128" stroke="#63AD7E" stroke-width="2" stroke-dasharray="6 6" fill="none"/>
<text x="90" y="120" font-size="88" text-anchor="middle" font-family="PingFang TC, Heiti TC, sans-serif" fill="#1C2A30">台</text>
<path d="M52 140h76" stroke="#CF3324" stroke-width="6" stroke-linecap="round"/>
</svg>
"""


def sri(text):
    return "sha256-" + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode()


def policy(hashes, header=False):
    """The Content-Security-Policy. Everything not listed is blocked (default-src 'none')."""
    parts = [
        "default-src 'none'",
        "script-src 'self'",                                              # only our own files; no inline script, no eval
        "style-src 'self' " + " ".join("'%s'" % h for h in hashes) + " " + FONTS_CSS.rstrip("/"),
        "font-src " + FONTS_FILES,
        "img-src 'self'",
        "connect-src 'self'",                                             # fetch() of data/*.json only
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "worker-src 'none'",
        "media-src 'self'",                                               # the recordings: same origin (the taigi-audio site of the same account)
    ]
    if header:
        parts.append("frame-ancestors 'none'")                            # not allowed in <meta>, fine as a header
    return "; ".join(parts)


def lint(body, head_parts):
    """Things the policy (or good sense) forbids. Raises SystemExit with the reason."""
    problems = []
    if re.search(r"<script\b(?![^>]*\bsrc=)", body, re.I):
        problems.append("inline <script>")
    for m in re.finditer(r"<script\b[^>]*\bsrc=\"([^\"]+)\"", body, re.I):
        if re.match(r"(?i)(https?:)?//|data:|javascript:", m.group(1)):
            problems.append("script from another origin: " + m.group(1))
    if re.search(r"<[a-zA-Z][^>]*\son[a-z]+\s*=", body):
        problems.append("inline event handler (on*=)")
    if re.search(r"<[a-zA-Z][^>]*\sstyle\s*=", body):
        problems.append("style= attribute")
    if re.search(r"<(iframe|object|embed|form|base)\b", body, re.I):
        problems.append("iframe/object/embed/form/base element")
    if re.search(r"""(?:href|src|action)\s*=\s*["']?\s*(?:javascript|data|http:)""", body + head_parts, re.I):
        problems.append("javascript:/data:/http: URL")
    for m in re.finditer(r"<link\b[^>]*>", head_parts):
        tag = m.group(0)
        href = re.search(r'href="([^"]+)"', tag)
        if not href or not href.group(1).startswith(FONTS_CSS):
            problems.append("link that is not the font stylesheet: " + tag)
    if problems:
        sys.exit("src/page.html would break the Content-Security-Policy:\n  - " + "\n  - ".join(problems))


def main():
    with open(os.path.join(ROOT, "src", "page.html"), encoding="utf-8") as f:
        page = f.read()
    m = LEADING.match(page)
    if not m:
        sys.exit("src/page.html must start with <title>, <link> and <style>")
    head_parts, body = m.group(0).strip(), page[m.end():].strip()
    lint(body, head_parts)

    styles = [RESET] + STYLE.findall(head_parts)
    hashes = [sri(s) for s in styles]
    csp = policy(hashes)

    doc = f"""<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="學台語用的網站：華語逐詞對應成台語，標出本調與變調，附教育部辭典查詢、生字簿與每日複習。">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="台語生字簿">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#F6FAF3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#13201A" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-180.png">
<style>{styles[0]}</style>
<script src="js/frameguard.js"></script>
{head_parts}
</head>
<body>
<noscript>這個網站需要開啟 JavaScript 才能使用。</noscript>
{body}
</body>
</html>
"""
    headers = f"""/*
  Content-Security-Policy: {policy(hashes, header=True)}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Strict-Transport-Security: max-age=63072000; includeSubDomains
"""
    out = {"index.html": doc, "_headers": headers, "manifest.webmanifest": MANIFEST, "icon.svg": ICON, ".nojekyll": ""}
    for name, text in out.items():
        with open(os.path.join(ROOT, name), "w", encoding="utf-8") as f:
            f.write(text)
    png = os.path.join(ROOT, "tools", "icon-180.png")
    if os.path.exists(png):
        with open(png, "rb") as src, open(os.path.join(ROOT, "icon-180.png"), "wb") as dst:
            dst.write(src.read())
    print(f"index.html written ({len(doc) / 1024:.0f} KB), {len(hashes)} style hashes")
    print("policy:", csp)


if __name__ == "__main__":
    main()
