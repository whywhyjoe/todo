"""Splice the sibling stylesheets into halo-banner-maker.html.

The generator is pasted whole into a SharePoint custom script web part, so a
relative <link> would resolve against the page URL and never load. The CSS has
to travel inside the HTML. The .css files stay the editable source of truth;
this rewrites the matching <style id="..."> block in place.

    python inline-css.py

Idempotent. Run it after touching either stylesheet.
"""

import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
TARGET = HERE / "halo-banner-maker.html"
SHEETS = ["dcs-workbench", "halo-overrides"]

BANNER = ("/* @inline {name}.css - generated block, do not hand-edit.\n"
          "  Edit the sibling {name}.css and re-run: python inline-css.py */")


def main():
    html = TARGET.read_text(encoding="utf-8")
    for name in SHEETS:
        source = (HERE / f"{name}.css").read_text(encoding="utf-8").strip()
        block = f"{BANNER.format(name=name)}\n{source}\n"
        pattern = re.compile(
            rf'(<style id="{re.escape(name)}">\n).*?(</style>)', re.DOTALL)
        html, count = pattern.subn(
            lambda m: m.group(1) + block + m.group(2), html)
        if count != 1:
            sys.exit(f"expected exactly one <style id=\"{name}\"> block, found {count}")
        print(f"inlined {name}.css ({len(source)} bytes)")
    TARGET.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
