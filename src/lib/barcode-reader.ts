export type BarcodeReading = { text: string; format: string };
export class BarcodeReader {
  private worker: Worker;
  private serial = 0;
  private jobs = new Map<number, { resolve: (results: BarcodeReading[]) => void; reject: (error: Error) => void }>();
  private rejectReady!: (error: Error) => void;
  readonly ready: Promise<void>;
  constructor() {
    this.worker = new Worker(new URL("../workers/barcode.worker.ts", import.meta.url));
    this.ready = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      this.worker.onmessage = ({ data }) => {
        if (data.type === "ready") { resolve(); return; }
        if (data.type === "init-error") { reject(Error("تعذر تحميل قارئ الباركود. حدّث الصفحة وحاول مجددًا.")); return; }
        const job = this.jobs.get(data.id);
        if (!job) return;
        this.jobs.delete(data.id);
        if (data.error) job.reject(Error("تعذر تحليل الصورة"));
        else job.resolve(data.results);
      };
      this.worker.onerror = () => { this.fail(Error("تعذر تشغيل قارئ الباركود. حدّث الصفحة.")); };
    });
    this.worker.postMessage({ type: "init", wasmUrl: new URL("/scanner/zxing-reader-3.1.7.wasm", location.origin).href });
  }
  async read(image: ImageData, hard = false) {
    await this.ready;
    const id = ++this.serial;
    return new Promise<BarcodeReading[]>((resolve, reject) => {
      this.jobs.set(id, { resolve, reject });
      this.worker.postMessage({ id, width: image.width, height: image.height, buffer: image.data.buffer, hard }, [image.data.buffer]);
    });
  }
  private fail(error: Error) {
    this.rejectReady(error);
    this.jobs.forEach(job => job.reject(error)); this.jobs.clear();
  }
  close() { this.fail(Error("تم إيقاف القارئ")); this.worker.terminate(); }
}
