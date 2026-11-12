# Styling message controls

In a card's style field, unlayered author CSS overrides the stage's defaults.
The opening switcher uses `.swipeRightBlock` for the capsule, `.swipe_left` and
`.swipe_right` for its arrows, and `.swipes-counter` for its count. The capsule
also has `.hover-pill`, shared with the regenerate control.

The switcher, message menu and regenerate control share `--lt-msg-hint-fg` and
`--lt-msg-hint-bg`. Set these on `.swipeRightBlock` to change only the switcher:

```css
.swipeRightBlock {
  --lt-msg-hint-fg: #292334;
  --lt-msg-hint-bg: #f8f0ff;
}
```

`--lt-canvas-actions-size` sets the message action size. The opening capsule is
10px taller than this value (32px by default); each arrow's default hit area
is 44px wide and extends 6px above and below its visible area.

When a player chooses a custom, blurred or solid background, the stage applies
its background visibility rules to the capsule. Those player preferences take
priority over card styling. Cards without alternate greetings hide the switcher
while keeping the existing empty DOM hooks.
