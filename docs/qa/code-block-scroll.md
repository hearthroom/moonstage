# Code blocks and scroll position

Use synthetic data only. Check both the ordinary chat page and a sandbox card, at a
360 px mobile viewport.

## Fixture

1. A player message containing card HTML with a small animated box: a timer adds and
   removes one child element every 400 ms (for example, falling petals).
2. An earlier assistant reply of plain prose.
3. A short player message.
4. A latest assistant reply with prose plus several fenced code blocks (css, html,
   javascript), at least one line longer than 300 characters.

## Cases

1. **Code blocks scroll inside their frame.** Long lines scroll sideways within the
   code block; the bubble stays inside the chat column. A one-line short code block
   keeps its natural width and is not squeezed narrower than the text above it.
2. **Animation elsewhere does not move the page.** Scroll to the very bottom and wait
   five seconds while the animated box runs. The position stays at the bottom. Repeat
   halfway up the conversation; the position stays put.
3. **Animation inside a wide bubble does not move the page.** Put a fixed-width
   (700 px) element that keeps changing inside the latest reply. Scrolling to the
   bottom or the middle still holds while it animates.
4. **New messages are still kept inside the column.** Send a message whose reply
   contains a 700 px panel; it is held inside the chat column as before.
5. **Rotation.** Rotate or resize the window while scrolled halfway; bubbles are
   re-measured and the reading position does not jump.

## Origin

Player report on 2026-10-05: "can't scroll to the bottom, neither up nor down". The
page did scroll, but snapped back about 300 px every 400 ms. Cause: the bubble width
guard re-measured the last three bubbles on every DOM change anywhere in the chat. To
measure, it removed the pinned width; the latest reply's long code line then widened
the bubble, prose wrapped onto fewer lines, the page got shorter for that instant, and
the browser clamped the scroll position. Pinning the width again restored the height
but not the position.

Validation on 2026-10-05 (Chrome, 360 × 740 mobile emulation, real reply text rendered
with markdown-it, the guard bundled from source):

| Setup | Scrolled to bottom, then every 250 ms |
|---|---|
| Before, no animation | 3390, holds |
| Before, 400 ms animation in another message | 3390 → 3094, stays there |
| After, animation in another message | 3477, holds; middle 1739, holds |
| After, 700 px animated panel inside the latest reply | 3430, holds; middle 1715, holds |

Code block width options measured in the same viewport (bubble width in px):

| CSS | Short code | Long code | Prose + long code | Scrolls |
|---|---|---|---|---|
| none | 91 | 1121 | 1121 | no |
| `overflow-x:auto; max-width:100%` | 91 | 1121 | 1121 | no |
| `width:0; min-width:100%` | 73 | 73 | 338 | yes |
| grid `minmax(0, 1fr)` (chosen) | 91 | 338 | 338 | yes |

Executable regression cases live in `src/pages/canvas/__tests__/canvas-bubble-fit.spec.ts`
("重量氣泡不能動到讀者的捲動位置" and the code block wiring case); three of them failed
before the fix. jsdom has no layout, so cases 1 and 5 above still need a browser check.
