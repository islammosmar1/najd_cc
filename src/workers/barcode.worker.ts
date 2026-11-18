import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (value: unknown) => void;
};
let ready: Promise<unknown>;
let queue = Promise.resolve();
scope.onmessage = ({ data }) => {
  if (data.type === "init") {
    ready = prepareZXingModule({ overrides: { locateFile: () => data.wasmUrl }, fireImmediately: true });
    ready.then(() => scope.postMessage({ type: "ready" })).catch(() => scope.postMessage({ type: "init-error" }));
    return;
  }
  queue = queue.then(async () => {
    try {
      await ready;
      const start = performance.now();
      const pixels = new Uint8ClampedArray(data.buffer);
      const image: ImageData = { data: pixels, width: data.width, height: data.height, colorSpace: "srgb" };
      let results = await readBarcodes(image, {
        formats: ["AllReadable"], maxNumberOfSymbols: 1,
        tryHarder: data.hard, tryRotate: true, tryInvert: true, tryDownscale: true,
      });
      // Some linear formats don't use the engine's built-in inversion pass.
      if (!results.length && data.hard) {
        for (let i = 0; i < pixels.length; i += 4) {
          pixels[i] = 255 - pixels[i]; pixels[i + 1] = 255 - pixels[i + 1]; pixels[i + 2] = 255 - pixels[i + 2];
        }
        results = await readBarcodes(image, { formats: ["AllReadable"], maxNumberOfSymbols: 1, tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true });
      }
      scope.postMessage({ id: data.id, results: results.map(result => ({ text: result.text, format: result.format })), elapsed: performance.now() - start });
    } catch { scope.postMessage({ id: data.id, error: true }); }
  });
};
