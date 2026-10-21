export function createRenderer(ctx) {
  return {
    mount() {},
    unmount() {},
    onResize() {},
    onState() {}
  };
}
// Headless experiment renderer: real physics/actions/observations run server-side.
// The public web viewer displays log-derived activity separately.
