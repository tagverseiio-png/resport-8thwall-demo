# Device test matrix

8th Wall SLAM behaviour genuinely varies between Safari iOS, Chrome Android
and GPU drivers — fill one row per real-device test run. Copy the `device`
line from Copy diagnostics (`?ar-debug=1` → DBG → panel) into the Device
column so rows stay comparable.

| Date | Device (from diagnostics) | OS + browser | Surface tested | Result | Notes (lock time, fallback used?) |
|---|---|---|---|---|---|
| 2026-09-05 | iPhone iOS 18.2 Safari, 390x844@3 | iOS 18.2 / Safari | glossy ceramic tile | ❌ no lock (feature-points only) | strict never promoted; assisted placed OK |
| | | | | | |
| | | | | | |

Result key: ✅ locked < 10 s · ⚠️ locked slowly / needed assisted · ❌ no lock.

What to record on a failure: `worldPoints`, hit types seen, `surface rot`,
whether the gold ring ever appeared, and the exact surface (matte/glossy,
texture density, light). That triple separates environment failures (this
table will never work) from device failures (this phone needs the earlier
assisted fallback / lower lock threshold) without guessing.
