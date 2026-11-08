# RIGY-V0140 — Hover selection crash correction

V0139: `3cfb6432b45a149458c3c16556b964bf261a6f85`.
Correct a stale `hovered` symbol in `updateVisibility` after unifying the hover and click picker. Use `this.hovered` to match the selected handle identity. No anatomy, Zelda, scale or model changes.

Separately saved branch: `versions/RIGY-V0140-hover-selection-stability`.
Rollback: `backup/RIGY-V0138-before-all-handles-repair` or prior V0139 commit.

Re-run all 12 handle tests and existing regressions; this fix is **not** hardware verified.
