"use client";
import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
export function CameraScanner({ onScan }: { onScan: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  const [error, setError] = useState("");
  useEffect(() => {
    callback.current = onScan;
  }, [onScan]);
  useEffect(() => {
    let controls: IScannerControls | undefined;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromVideoDevice(undefined, video.current!, (result) => {
        if (result) callback.current(result.getText());
      })
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch(() =>
        setError(
          "تعذر فتح الكاميرا. اسمح بالوصول عبر HTTPS أو استخدم قارئ USB / الإدخال اليدوي.",
        ),
      );
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);
  return (
    <div>
      <video ref={video} className="camera" muted playsInline />
      <p>{error || "وجّه الكاميرا إلى الباركود"}</p>
    </div>
  );
}
