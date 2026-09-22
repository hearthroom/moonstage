# Mobile display and fullscreen

The player offers an explicit fullscreen action when the browser exposes the standard
Fullscreen API. It requests fullscreen on the host document, so the card and host dialogs
remain together. Browser exit events update the button; a rejected request leaves the
player usable. Unsupported browsers hide the action. On iPhone, use the host site's
Add to Home Screen flow for a standalone launch; support is capability-detected rather
than inferred from the browser name.

The action is part of the existing author-styled header in both ordinary and sandbox
cards: `.header-meun[data-lt="fullscreen"]`. It inherits color, uses a `currentColor`
SVG, and puts its defaults in `@layer lt-base`. Authors can target the existing menu
class or the stable `data-lt` selector. Do not move it into a host-only overlay or add
unlayered styles that defeat card beautification.

Sandbox shells forward `ui: fullscreen` to the host. Optional `ChromeState.header`
fields `fullscreenSupported`, `fullscreenActive`, and `fullscreenLabel` advertise the
capability and presentation. This is an additive version-1 extension: absent capability
means no button; an old shell ignores the additional state. Existing message semantics
are unchanged, so cached old/new peers remain compatible without a protocol-version
cutover. Breaking message changes still require a version increment.

The host reserves top/side safe areas. Bottom controls reserve
`safe-area-max-inset-bottom`, falling back to the current inset on older browsers, so
Android's retracting browser controls do not repeatedly resize the composer. This is
separate from a card's existing full-stage presentation mode.
