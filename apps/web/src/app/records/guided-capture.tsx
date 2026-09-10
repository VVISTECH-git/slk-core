"use client";

import { useEffect, useRef, useState } from "react";

import {
  ANALYSIS_WIDTH,
  checkFrame,
  toGrey,
  type Grey,
  type PhotoRule,
  type Verdict,
} from "./photo-rules";

/**
 * The camera, with a frame that says where the cloth goes and a shutter that
 * only fires when it is there.
 *
 * Modelled on a face-capture screen: an outline to fill, a ring that is red
 * with one instruction until every check passes, then green, then the
 * photograph takes itself. The person's job is to make the ring go green;
 * the checks do the judging, the same way every time, for everyone.
 *
 * The photograph is taken from the camera stream at its full size and
 * handed back as a file; where it goes from there is the caller's business.
 */
export function GuidedCapture({
  slotLabel,
  rule,
  onUse,
  onClose,
}: {
  slotLabel: string;
  rule: PhotoRule;
  onUse: (file: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const previous = useRef<Grey | null>(null);
  const greenSince = useRef<number | null>(null);
  const shooting = useRef(false);

  const [verdict, setVerdict] = useState<Verdict>({ ok: false, message: "Starting camera…", warning: false });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

  // Open the back camera at the largest size it will give. Stopped on close,
  // or the light on the phone stays on after the screen has gone.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 4096 },
          height: { ideal: 4096 },
        },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        const name = error instanceof Error ? error.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "Camera access was refused. Allow it for this site and try again, or choose a file instead."
            : "The camera could not be opened on this device. Choose a file instead.",
        );
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Look at the frame a few times a second. Not every frame: the checks are
  // cheap but the phone is also encoding video, and four a second is plenty
  // for a person to follow.
  useEffect(() => {
    if (shot !== null || cameraError !== null) return;
    const timer = window.setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2 || v.videoWidth === 0) return;

      const canvas = (scratch.current ??= document.createElement("canvas"));
      const scale = ANALYSIS_WIDTH / Math.max(v.videoWidth, v.videoHeight);
      canvas.width = Math.max(8, Math.round(v.videoWidth * scale));
      canvas.height = Math.max(8, Math.round(v.videoHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const grey = toGrey(ctx.getImageData(0, 0, canvas.width, canvas.height));

      const next = checkFrame(grey, v.videoWidth, v.videoHeight, rule, previous.current);
      previous.current = grey;
      setVerdict(next);

      if (next.ok) {
        greenSince.current ??= Date.now();
        // Green for most of a second: long enough to be sure, short enough
        // that nobody has to hold a saree steady for long.
        if (Date.now() - greenSince.current > 800 && !shooting.current) {
          shooting.current = true;
          void take();
        }
      } else {
        greenSince.current = null;
      }
    }, 250);
    return () => window.clearInterval(timer);
    // `take` reads only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule, shot, cameraError]);

  async function take() {
    const v = video.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) {
      shooting.current = false;
      return;
    }
    const file = new File([blob], `${slotLabel.toLowerCase().replace(/\s+/g, "-")}.jpg`, { type: "image/jpeg" });
    setShot({ file, url: URL.createObjectURL(file) });
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    previous.current = null;
    greenSince.current = null;
    shooting.current = false;
  }

  const ring = shot ? "border-ok" : verdict.ok ? "border-ok" : "border-brick";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photograph the ${slotLabel}`}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onClose} aria-label="Close" className="text-[22px] leading-none text-white/80">
          ←
        </button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{slotLabel}</h2>
          <p className="truncate text-[12px] text-white/70">{rule.guide}</p>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {shot ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={shot.url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <video ref={video} playsInline muted autoPlay className="max-h-full max-w-full object-contain" />
        )}

        {/*
          The frame: an inset outline the cloth should reach. Red with the
          first instruction, green when every check passes. It is decoration
          over the live picture, so it must never take the touch.
        */}
        {!shot && cameraError === null && (
          <div className={`pointer-events-none absolute inset-4 rounded-2xl border-4 ${ring} transition-colors`} />
        )}

        {cameraError !== null && (
          <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-lg bg-white/10 p-4 text-center text-[14px]">
            {cameraError}
          </p>
        )}
      </div>

      <footer className="flex flex-col items-center gap-3 px-4 pb-6 pt-3">
        {shot ? (
          <>
            <p className="text-[14px] text-ok">Photograph taken</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={retake}
                className="rounded-lg border border-white/40 px-5 py-2.5 text-[14px]"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => onUse(shot.file)}
                className="rounded-lg bg-white px-5 py-2.5 text-[14px] font-medium text-black"
              >
                Use this photograph
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={`text-[15px] font-medium ${verdict.ok ? "text-ok" : "text-white"}`} aria-live="polite">
              {verdict.ok ? "Hold still…" : verdict.message}
            </p>
            <button
              type="button"
              onClick={() => {
                if (!shooting.current) {
                  shooting.current = true;
                  void take();
                }
              }}
              disabled={!verdict.ok || cameraError !== null}
              aria-label="Take the photograph"
              className={`size-16 rounded-full border-4 ${
                verdict.ok ? "border-ok bg-white" : "border-white/40 bg-white/30"
              } disabled:cursor-not-allowed`}
            />
            <p className="text-[12px] text-white/60">Takes itself when the frame is green.</p>
          </>
        )}
      </footer>
    </div>
  );
}
