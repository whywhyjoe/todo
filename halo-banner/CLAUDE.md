# halo-banner

Read **[AGENTS.md](AGENTS.md)** before changing anything here — it is the single source of
truth for the rules, invariants and traps, and it is kept vendor-neutral so other tools can
use it too. Do not duplicate its content into this file; add to it instead.

`README.md` covers what the tool is, the two output formats, and how to run and deploy it.

Quick orientation:

- No build step and no tests. Open `halo-banner-maker.html` in a browser.
- `<style id="halo-banner-css">` in that file is the shipped banner component, not tool
  chrome. Editing it changes every banner anyone has already pasted.
- The other two `<style>` blocks are generated — edit the sibling `.css` and run
  `python inline-css.py`.
- The SVG exporter re-implements the component's geometry. Change one, change both, and
  re-run the difference test in AGENTS.md.
