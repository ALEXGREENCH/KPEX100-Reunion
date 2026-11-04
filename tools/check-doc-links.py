"""Check local Markdown file links in project documentation (stdlib only)."""

from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
errors = []
for file in [
    *ROOT.glob("*.md"),
    *(ROOT / "doc").rglob("*.md"),
    *(ROOT / "tools").glob("*.md"),
    ROOT / "desktop/README.md",
]:
    if not file.is_file():
        continue
    for match in re.finditer(r"\]\(([^)]+)\)", file.read_text(encoding="utf-8")):
        target = match.group(1).split(' "', 1)[0].strip("<>")
        parts = urlsplit(target)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        destination = (file.parent / unquote(parts.path)).resolve()
        if not destination.is_relative_to(ROOT) or not destination.exists():
            errors.append(f"{file.relative_to(ROOT)}: {target}")
if errors:
    print("Broken local documentation links:\n" + "\n".join(errors))
    sys.exit(1)
print("All local documentation file links resolve.")
