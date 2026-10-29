/**
 * Host half of the voice-broadcast bundle.
 *
 * The feature is Client-only: `client.js` reads the live session event stream
 * through `ctx.sessions`, turns it into short spoken lines, and renders the
 * speaker toggle in the composer tool row. This row exists so the Loader can
 * mount the bundle and so Plugin Manager has an inventory entry for it.
 */
export function apply() {}
