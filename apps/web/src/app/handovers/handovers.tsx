"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";

import { Button, ConfirmDialog, Header, ToastBar, inputClass, useToast } from "@/components/ui";
import type { OutstandingGroup, ThaanForReceive, ThaanForSend } from "@/lib/handovers";
import { STAGES } from "@/lib/stages";
import type { VendorRow } from "@/lib/vendors";

import {
  lookupForReceive,
  lookupForSend,
  receiveBatch as receiveBatchAction,
  sendBatch as sendBatchAction,
} from "./actions";

const IN_HOUSE = "in-house";

/**
 * Kora to Shelf, step three: a Thaan's trip through the stage pipeline.
 * Everything here happens by scanning a Thaan's own QR code — that is the
 * accountability the client asked for: a material handler hands a Thaan to
 * a vendor by scanning it, not by ticking a box in a list they might not
 * have the physical piece in front of.
 */
export function Handovers({
  vendors,
  outstanding,
}: {
  vendors: VendorRow[];
  outstanding: OutstandingGroup[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"send" | "receive">("send");
  const [toast, showToast] = useToast();

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="Handovers"
        lede="A Thaan's trip through the stage pipeline — Salava through Ironing. Scan to send, scan to receive."
      />

      <div className="flex-1 px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="flex gap-1.5 rounded-lg border border-rule-2 bg-surface-2 p-1">
            <ModeButton active={mode === "send"} onClick={() => setMode("send")}>
              Send
            </ModeButton>
            <ModeButton active={mode === "receive"} onClick={() => setMode("receive")}>
              Receive
            </ModeButton>
          </div>

          {mode === "send" ? (
            <SendPanel
              vendors={vendors}
              showToast={showToast}
              onDone={() => router.refresh()}
            />
          ) : (
            <ReceivePanel showToast={showToast} onDone={() => router.refresh()} />
          )}

          <OutstandingTable rows={outstanding} />
        </div>
      </div>

      <ToastBar toast={toast} onDismiss={() => showToast(null)} />
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md py-2 text-[13.5px] font-medium transition-colors ${
        active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- send */

function SendPanel({
  vendors,
  showToast,
  onDone,
}: {
  vendors: VendorRow[];
  showToast: (t: { ok: boolean; message: string } | null) => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [stage, setStage] = useState<string>("");
  const [vendorId, setVendorId] = useState<string>(IN_HOUSE);
  const [items, setItems] = useState<ThaanForSend[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function scan(code: string) {
    if (stage === "") {
      setScanError("Choose a stage first.");
      return;
    }
    if (items.some((t) => t.code === code)) return; // Already in this batch.

    const result = await lookupForSend(code, stage);
    if (!result.ok) {
      setScanError(result.message);
      return;
    }
    setScanError(null);
    setItems((prev) => [...prev, result.thaan]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  function confirmSend() {
    start(async () => {
      const result = await sendBatchAction(
        stage,
        vendorId === IN_HOUSE ? null : vendorId,
        items.map((t) => t.id),
      );
      showToast(result);
      setConfirming(false);
      if (result.ok) {
        setItems([]);
        onDone();
      }
    });
  }

  const vendorLabel = vendorId === IN_HOUSE ? "in-house" : (vendors.find((v) => v.id === vendorId)?.name ?? "that vendor");

  return (
    <section className="rounded-lg border border-rule bg-surface p-5">
      <div className="mb-4 grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Stage</span>
          <select
            className={inputClass}
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setItems([]);
            }}
          >
            <option value="">Choose…</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-2">Vendor</span>
          <select
            className={inputClass}
            value={vendorId}
            onChange={(e) => {
              setVendorId(e.target.value);
              setItems([]);
            }}
          >
            <option value={IN_HOUSE}>In-house (no vendor)</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ScanControls
        disabled={stage === ""}
        onCamera={() => setCameraOpen(true)}
        onManual={(code) => void scan(code)}
        error={scanError}
      />

      <BatchList
        items={items}
        renderMeta={(t) => `${t.baleCode} · ${t.itemName}`}
        onRemove={removeItem}
      />

      <div className="mt-4 flex items-center justify-between">
        <Tally items={items} keyFn={(t) => t.baleType} />
        <Button
          tone="primary"
          disabled={items.length === 0 || stage === "" || pending}
          onClick={() => setConfirming(true)}
        >
          Send {items.length > 0 ? items.length : ""}
        </Button>
      </div>

      {cameraOpen && (
        <CameraScanner
          onDetect={(code) => void scan(code)}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={`Send ${items.length} Thaan${items.length === 1 ? "" : "s"} for ${stage}?`}
          description={`Going to ${vendorLabel === "in-house" ? "in-house" : vendorLabel}. ${describeTally(items, (t) => t.baleType)}.`}
          confirmLabel="Send"
          pending={pending}
          onConfirm={confirmSend}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------ receive */

function ReceivePanel({
  showToast,
  onDone,
}: {
  showToast: (t: { ok: boolean; message: string } | null) => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [items, setItems] = useState<ThaanForReceive[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function scan(code: string) {
    if (items.some((t) => t.code === code)) return;

    const result = await lookupForReceive(code);
    if (!result.ok) {
      setScanError(result.message);
      return;
    }
    setScanError(null);
    setItems((prev) => [...prev, result.thaan]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }

  function confirmReceive() {
    start(async () => {
      const result = await receiveBatchAction(items.map((t) => t.id));
      showToast(result);
      setConfirming(false);
      if (result.ok) {
        setItems([]);
        onDone();
      }
    });
  }

  return (
    <section className="rounded-lg border border-rule bg-surface p-5">
      <p className="mb-4 text-[13px] text-muted">
        Scan whatever&rsquo;s coming back — it doesn&rsquo;t matter which stage or which vendor each piece
        is from. Every scan finds its own open handover.
      </p>

      <ScanControls
        disabled={false}
        onCamera={() => setCameraOpen(true)}
        onManual={(code) => void scan(code)}
        error={scanError}
      />

      <BatchList
        items={items}
        renderMeta={(t) => `${t.baleCode} · ${t.vendorName} — ${t.stage}`}
        onRemove={removeItem}
      />

      <div className="mt-4 flex items-center justify-between">
        <Tally items={items} keyFn={(t) => `${t.vendorName} — ${t.stage}`} />
        <Button
          tone="primary"
          disabled={items.length === 0 || pending}
          onClick={() => setConfirming(true)}
        >
          Receive {items.length > 0 ? items.length : ""}
        </Button>
      </div>

      {cameraOpen && (
        <CameraScanner
          onDetect={(code) => void scan(code)}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={`Receive ${items.length} Thaan${items.length === 1 ? "" : "s"}?`}
          description={`${describeTally(items, (t) => `${t.vendorName} — ${t.stage}`)}. Any piece back from a vendor is billed at their rate for that stage.`}
          confirmLabel="Receive"
          pending={pending}
          onConfirm={confirmReceive}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

/* --------------------------------------------------------- scan input */

function ScanControls({
  disabled,
  onCamera,
  onManual,
  error,
}: {
  disabled: boolean;
  onCamera: () => void;
  onManual: (code: string) => void;
  error: string | null;
}) {
  const [value, setValue] = useState("");

  return (
    <div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={value}
          disabled={disabled}
          placeholder={disabled ? "Choose a stage first" : "Scan, or type a Thaan code and press Enter"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim() !== "") {
              onManual(value.trim());
              setValue("");
            }
          }}
        />
        <Button onClick={onCamera} disabled={disabled}>
          Camera
        </Button>
      </div>
      {error !== null && <p className="mt-1.5 text-[12.5px] text-brick">{error}</p>}
      <p className="mt-1.5 text-[11.5px] text-muted">
        A Bluetooth handheld scanner works here too — pair it, tap into this field, and scan.
      </p>
    </div>
  );
}

function CameraScanner({
  onDetect,
  onClose,
}: {
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const onDetectRef = useRef(onDetect);
  const [error, setError] = useState<string | null>(null);

  // Kept current without restarting the camera effect below — that effect
  // has an empty dependency array on purpose, so the stream isn't torn down
  // and re-opened every time the parent re-renders with a new callback.
  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(frame.data, frame.width, frame.height);
          if (result !== null && result.data !== "" && !lockedRef.current) {
            lockedRef.current = true;
            onDetectRef.current(result.data);
            setTimeout(() => {
              lockedRef.current = false;
            }, 1200);
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video !== null) {
          video.srcObject = stream;
          await video.play();
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setError("Couldn't open the camera — check the browser has permission, or use the code field instead.");
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/90 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} muted playsInline className="w-full" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
      </div>
      {error !== null && <p className="max-w-sm text-center text-[13px] text-white">{error}</p>}
      <Button onClick={onClose}>Close camera</Button>
    </div>
  );
}

/* -------------------------------------------------------------- batch */

function BatchList<T extends { id: string; code: string }>({
  items,
  renderMeta,
  onRemove,
}: {
  items: T[];
  renderMeta: (t: T) => string;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-rule-2 px-3 py-6 text-center text-[12.5px] text-muted">
        Nothing scanned yet.
      </p>
    );
  }

  return (
    <ul className="mt-4 max-h-64 divide-y divide-rule overflow-y-auto rounded-md border border-rule">
      {items.map((t) => (
        <li key={t.id} className="flex items-center justify-between px-3 py-1.5 text-[13px]">
          <span>
            <span className="font-mono text-ink">{t.code}</span>
            <span className="ml-2 text-ink-2">{renderMeta(t)}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(t.id)}
            aria-label={`Remove ${t.code}`}
            className="rounded px-1.5 text-muted hover:bg-surface-2 hover:text-brick"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function tally<T>(items: T[], keyFn: (t: T) => string): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}

function Tally<T>({ items, keyFn }: { items: T[]; keyFn: (t: T) => string }) {
  if (items.length === 0) return <span className="text-[12.5px] text-muted">—</span>;

  return (
    <span className="text-[12.5px] text-ink-2">
      {tally(items, keyFn)
        .map((g) => `${g.count} ${g.key}`)
        .join(", ")}
    </span>
  );
}

function describeTally<T>(items: T[], keyFn: (t: T) => string): string {
  return tally(items, keyFn)
    .map((g) => `${g.count} ${g.key}`)
    .join(", ");
}

/* --------------------------------------------------------- outstanding */

function OutstandingTable({ rows }: { rows: OutstandingGroup[] }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-medium text-ink-2">
        Currently out {rows.length > 0 && `(${rows.reduce((n, r) => n + r.count, 0)} Thaans)`}
      </h2>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-rule-2 px-4 py-8 text-center text-[13px] text-muted">
          Nothing is out for a stage right now.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-rule bg-surface-2 text-left">
                <th scope="col" className="px-4 py-2 text-[11.5px] font-medium text-muted">Stage</th>
                <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Vendor</th>
                <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Count</th>
                <th scope="col" className="px-3 py-2 text-[11.5px] font-medium text-muted">Out since</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.stage}::${r.vendorId ?? "in-house"}`} className="h-11 border-b border-rule last:border-b-0 hover:bg-surface-2">
                  <td className="px-4 text-ink">{r.stage}</td>
                  <td className="px-3 text-ink-2">{r.vendorName}</td>
                  <td className="px-3 text-ink-2">{r.count}</td>
                  <td className="px-3 text-ink-2">{r.earliestSentAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
