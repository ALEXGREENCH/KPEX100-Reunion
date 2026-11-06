"""Save all publicly listed Sinjisoft Newswire press releases as original HTML.

Follows only the observed company pagination and release links, not unrelated
site navigation. Existing verified responses are reused; failed URLs can retry.
No login, posting, JavaScript execution or historical program execution.
"""

import argparse
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

COMPANY = "https://www.newswire.co.kr/?act=article&md=A10&no=2845"


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.urls.add(urllib.parse.urljoin(COMPANY, href).split("#", 1)[0])
        for key, value in attrs:
            if key in ("href", "src") and value and media_url(value):
                self.urls.add(value)


def media_url(url):
    parsed = urllib.parse.urlsplit(url)
    return (
        parsed.scheme == "https"
        and parsed.hostname == "file.newswire.co.kr"
        and parsed.path.startswith("/data/datafile2/")
    )


def company_page(url):
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qs(parsed.query)
    return (
        parsed.hostname == "www.newswire.co.kr"
        and parsed.path == "/"
        and query.get("act") == ["article"]
        and query.get("md") == ["A10"]
        and query.get("no") == ["2845"]
        and "perpage" not in query
    )


def release_page(url):
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qs(parsed.query)
    return (
        parsed.hostname == "www.newswire.co.kr"
        and parsed.path == "/newsRead.php"
        and len(query.get("no", [])) == 1
        and query["no"][0].isdigit()
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    root = args.directory
    root.mkdir(parents=True, exist_ok=True)
    receipts_file = root / "receipts.jsonl"
    receipts = (
        [json.loads(line) for line in receipts_file.read_text("utf8").splitlines()]
        if receipts_file.exists()
        else []
    )
    cached = {item["url"]: item for item in receipts if item.get("status") == 200}

    def fetch(url):
        if not (company_page(url) or release_page(url) or media_url(url)):
            raise ValueError("Out-of-scope URL")
        old = cached.get(url)
        if old:
            body = (root / old["path"]).read_bytes()
            if hashlib.sha256(body).hexdigest() != old["sha256"]:
                raise ValueError("Preserved source changed")
            return body
        time.sleep(1)
        item = {"url": url, "utc": datetime.now(timezone.utc).isoformat()}
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "KPEX100-Reunion-preservation/1.0",
                    "Accept-Encoding": "identity",
                },
            )
            try:
                response = urllib.request.urlopen(request, timeout=40)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                body = response.read()
                item.update(
                    status=response.status,
                    final_url=response.url,
                    headers=list(response.headers.items()),
                )
            digest = hashlib.sha256(body).hexdigest()
            suffix = (
                ".jpg"
                if media_url(url)
                and urllib.parse.urlsplit(url).path.lower().endswith(".jpg")
                else ".html"
            )
            destination = "originals/" + digest + suffix
            (root / "originals").mkdir(exist_ok=True)
            if not (root / destination).exists():
                (root / destination).write_bytes(body)
            item.update(path=destination, bytes=len(body), sha256=digest)
        except OSError as error:
            body = None
            item.update(status=0, error=str(error))
        with receipts_file.open("a", encoding="utf8", newline="\n") as stream:
            stream.write(json.dumps(item, ensure_ascii=False) + "\n")
        receipts.append(item)
        print(
            json.dumps(
                {"url": url, "status": item["status"], "bytes": item.get("bytes")}
            ),
            flush=True,
        )
        return body if item["status"] == 200 else None

    pending, visited, releases = {COMPANY}, set(), set()
    failed = []
    while pending:
        url = sorted(pending)[0]
        pending.remove(url)
        visited.add(url)
        body = fetch(url)
        if body is None:
            failed.append(url)
            continue
        if "신지소프트".encode() not in body or b"newsRead.php" not in body:
            failed.append(url)
            continue
        links = Links()
        links.feed(body.decode("utf8"))
        releases.update(item for item in links.urls if release_page(item))
        pending.update(
            item for item in links.urls if company_page(item) and item not in visited
        )
    entries, media = [], set()
    for url in sorted(releases):
        body = fetch(url)
        if body is None:
            failed.append(url)
            continue
        text = body.decode("utf8")
        links = Links()
        links.feed(text)
        owner = any(company_page(item) for item in links.urls)
        if owner:
            media.update(item for item in links.urls if media_url(item))
            # Original image URLs also occur in literal modal markup in scripts.
            # Read those strings as data; do not execute the page's JavaScript.
            media.update(
                re.findall(
                    r'https://file\.newswire\.co\.kr/data/datafile2/[^\s"\'<>\\]+', text
                )
            )
        title = re.search(r"<title>(.*?)</title>", text, re.S | re.I)
        published = re.search(r'"datePublished"\s*:\s*"([^"]+)"', text)
        entries.append(
            {
                "url": url,
                "sha256": hashlib.sha256(body).hexdigest(),
                "bytes": len(body),
                "title": title[1].strip() if title else None,
                "datePublished": published[1] if published else None,
                "providerCompany2845Linked": owner,
            }
        )
    media_entries = []
    for url in sorted(media):
        body = fetch(url)
        if body is None:
            failed.append(url)
            continue
        media_entries.append(
            {
                "url": url,
                "bytes": len(body),
                "sha256": hashlib.sha256(body).hexdigest(),
                "jpegMagic": body.startswith(b"\xff\xd8\xff"),
            }
        )
    report = {
        "schema": 1,
        "utc": datetime.now(timezone.utc).isoformat(),
        "companyIndex": COMPANY,
        "listingPages": sorted(visited),
        "releaseLinks": len(releases),
        "releases": entries,
        "mediaLinks": len(media),
        "media": media_entries,
        "failed": failed,
        "completeForListedHtml": bool(entries)
        and not failed
        and all(item["providerCompany2845Linked"] for item in entries),
        "scope": "All release HTML links in the public Sinjisoft company-2845 listing, including observed pagination, and their directly linked file.newswire.co.kr/data/datafile2 media (original photos and published thumbnail variants). Original response bodies/headers retained; no claim that Newswire contains all historical company releases. Shared site icons and other sites are outside this package.",
    }
    (root / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    print(
        json.dumps(
            {
                "pages": len(visited),
                "releases": len(entries),
                "failed": len(failed),
                "completeForListedHtml": report["completeForListedHtml"],
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
