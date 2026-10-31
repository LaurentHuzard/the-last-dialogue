#!/usr/bin/env python3
"""Check that WebViewAssetLoader can resolve the APK's offline entry and assets.

The Android shell registers AssetsPathHandler under '/', which maps URL
https://appassets.androidplatform.net/foo to APK entry assets/foo.
Bundling assets/www/foo instead will compile but fails at runtime.
"""

import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


class ReferencedLocalAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = set()

    def handle_starttag(self, tag, attrs):
        if tag not in ("link", "script", "img", "source"):
            return
        for key, value in attrs:
            if key in ("href", "src") and value:
                url = urlsplit(value)
                if not url.scheme and not url.netloc and url.path.startswith("/"):
                    self.references.add(url.path.lstrip("/"))


def verify(apk: Path):
    with zipfile.ZipFile(apk) as z:
        entries = set(z.namelist())
        entry = "assets/index.html"
        if entry not in entries:
            raise AssertionError(
                f"Missing {entry}. WebViewAssetLoader handles '/' from the APK assets root. "
                "Do not package the frontend inside assets/www/."
            )
        parser = ReferencedLocalAssets()
        parser.feed(z.read(entry).decode("utf-8"))
        if not any(p.startswith("_next/static/") and p.endswith(".js") for p in parser.references):
            raise AssertionError("No Next.js JavaScript referenced by offline index.html")
        if not any(p.startswith("_next/static/") and p.endswith(".css") for p in parser.references):
            raise AssertionError("No Next.js CSS referenced by offline index.html")
        missing = sorted(p for p in parser.references if f"assets/{p}" not in entries)
        if missing:
            raise AssertionError("WebView local URL paths have no matching APK assets: " + ", ".join(missing))
        print(f"Verified {entry} and {len(parser.references)} embedded root-relative web resources")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: verify_apk_assets.py /path/to/app-debug.apk")
    verify(Path(sys.argv[1]))
