# Selected destination and planet naming

The sector survey now starts with the selected terrain preview, catalog/custom name,
sector number and type. Inspect and Move share one row; movement has an accessible
destination label. Owners can rename planets through a keyboard-accessible native
dialog. Default names are deterministic per game/sector; overrides use the existing
`sectorname` database column, so existing campaigns need no migration.

`sector-preview.js` receives live, passive, unknown and dated views from GameUI.
Its display state is separate from `GAME_STATE.selectedSectorData`: viewing an old
report never turns it into actionable live intel. Unknown terrain has no image.
`Galaxy3D.sectorPreview` captures one 320×180 still with the existing renderer,
restores scene visibility/render target, disposes its target and caches the result.
It adds no renderer or animation loop. Existing terrain art provides a loading fallback.

Inspection supports every tile. Planet close-ups retain illustrative orbital ships
and installations; non-planet views retain their terrain and omit planet capacity
and terraforming fields. Escape returns keyboard focus to the Inspect control.

On phones the minimap defaults to collapsed unless the player saved a preference.
The existing Show minimap toggle remains available. The survey uses the freed width,
and its height prioritizes the preview/actions over the decorative comms band.

Validation: planet catalog/validation/ownership and visibility regression tests;
`sector-preview.spec.js` covers persistent Unicode renaming, dialog accessibility,
desktop/mobile action alignment and visibility, terrain inspection and unknown
preview privacy. Existing planet inspection and opening readability tests also run.
The wire contract and visibility limitations are in `server/websocket-protocol.md`.
