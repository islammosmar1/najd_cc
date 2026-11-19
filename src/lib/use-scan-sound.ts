"use client";

import { useCallback, useEffect, useRef } from "react";

/** Unlock on a user gesture so camera scans can play sound later as well. */
export function useScanSound() {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    function unlock() {
      try {
        audio.current ??= new AudioContext();
        if (audio.current.state === "suspended") void audio.current.resume().catch(() => {});
      } catch { /* Audio support must never interrupt scanning. */ }
    }
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      const context = audio.current;
      audio.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
  }, []);

  return useCallback(() => {
    try {
      const context = audio.current ??= new AudioContext();
      if (context.state === "suspended") void context.resume().catch(() => {});
      if (context.state !== "running") return;
      const tone = context.createOscillator();
      const volume = context.createGain();
      const now = context.currentTime;
      tone.frequency.value = 1400;
      volume.gain.setValueAtTime(0, now);
      volume.gain.linearRampToValueAtTime(0.16, now + 0.008);
      volume.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
      tone.connect(volume);
      volume.connect(context.destination);
      tone.onended = () => { tone.disconnect(); volume.disconnect(); };
      tone.start(now);
      tone.stop(now + 0.11);
    } catch { /* A muted or unsupported device must not block a sale. */ }
  }, []);
}
