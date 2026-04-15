"use client";
// LiveWaveform — oscilloscope drawn from a Web Audio AnalyserNode.
// Single responsibility: read time-domain data ~60fps and paint a waveform on canvas.
//
// Stroke colour comes from the element's computed CSS `color`, so the parent controls
// the appearance without any extra props (e.g. `className="text-accent"`).
// GAIN amplifies the signal so a quiet mic doesn't look like a flat line.

import { useRef, useEffect } from "react";
import type { RefObject } from "react";

const GAIN = 6;

interface LiveWaveformProps {
  analyserRef: RefObject<AnalyserNode | null>;
  className?: string;
}

export function LiveWaveform({ analyserRef, className = "w-full text-accent" }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const analyser = analyserRef.current;
      if (!analyser || !canvas || !ctx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = getComputedStyle(canvas).color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();

      const sliceWidth = width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const raw = (data[i] - 128) / 128;
        const boosted = Math.max(-1, Math.min(1, raw * GAIN));
        const y = height / 2 + boosted * (height / 2) * 0.88;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserRef]);

  return <canvas ref={canvasRef} width={800} height={128} className={className} aria-hidden />;
}
