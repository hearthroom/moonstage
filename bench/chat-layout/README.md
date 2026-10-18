# Chat layout regression

From Moonstage root, run:

```sh
npm exec vite -- --config bench/chat-layout/vite.config.ts
```

Open `/bench/chat-layout/`. This mounts the actual shell and shared Vue stage,
message and header components using synthetic card CSS. It does not replace
full host/import-path or original-card QA.

Each route shows an opening panel, a long AI reply and a long player message.
Use `?mode=traditional` for the same components with traditional hierarchy and
its host border-box reset. Run at 360×800, 390×844 and 1280×800.

Options can be combined:

- `long=1`: longer text for real scroll start/middle/end checks.
- `bom=1`: mount HTML containing a standalone BOM; the slot must have zero height.
- `bom=1&broken=1`: positive control reinserting that BOM after platform mounting;
  the slot must gain a persistent line height while messages scroll.
- `docks=1`: 16px fixed author sidebars; text must clear them by at least 4px.
- `docks=1&pad=0`: author clears bubble padding; full dock clearance must return.
- `frontend=1`: opening uses the platform frontend-block iframe.
- `wide=1`: author opening panel deliberately sets min-width:100vw; this is an
  author-requested exception and is kept, subject to existing viewport safety.

Read `window.legacyStageSnapshot()` after scrolling `#scrollview` to the start,
middle and end. Without docks, AI near-side margin is 10px on phones and its
far-side margin is at least 30.4px (360) / 32.2px (390); player margins mirror it.
A normal opening must obey the same cap. Ordinary cards and both modes must
have no horizontal overflow. Author CSS stays unlayered and overridable.
