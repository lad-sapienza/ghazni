declare module 'probe-image-size/sync' {
  interface ProbeResult {
    width: number;
    height: number;
    type: string;
    mime: string;
  }
  function probeSync(buffer: Buffer | Uint8Array): ProbeResult | null;
  export default probeSync;
}
