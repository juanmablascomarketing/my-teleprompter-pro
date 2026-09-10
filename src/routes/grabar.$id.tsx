import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FlipHorizontal2,
  Pause,
  Play,
  RotateCcw,
  Square,
  SwitchCamera,
  Type,
  Gauge,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  defaultPrefs,
  getScript,
  loadPrefs,
  savePrefs,
  type Prefs,
  type Script,
} from "@/lib/scripts-store";

export const Route = createFileRoute("/grabar/$id")({
  head: () => ({
    meta: [
      { title: "Grabar con teleprompter — Teleprompter Personal" },
      {
        name: "description",
        content:
          "Vista de cámara a pantalla completa con tu guion en scroll automático, velocidad ajustable, modo espejo y grabación descargable.",
      },
      { property: "og:title", content: "Grabar con teleprompter" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        property: "og:description",
        content: "Cámara en directo con el guion superpuesto en scroll automático.",
      },
    ],
  }),
  component: RecordPage,
});

type PermState = "idle" | "ready" | "denied" | "error";

type ZoomCapabilities = MediaTrackCapabilities & {
  zoom?: { min?: number; max?: number; step?: number };
};

type ZoomSettings = MediaTrackSettings & {
  zoom?: number;
};

type ZoomConstraintSet = MediaTrackConstraintSet & {
  zoom?: number;
};

function mediaErrorDetails(error: unknown) {
  if (error instanceof DOMException || error instanceof Error) {
    return `${error.name}: ${error.message || "Sin mensaje adicional"}`;
  }
  return `Error desconocido: ${String(error)}`;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

const CODEC_CANDIDATES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm",
] as const;

function getCodecSupport() {
  if (typeof MediaRecorder === "undefined") return [];
  return CODEC_CANDIDATES.map((mimeType) => ({
    mimeType,
    supported: MediaRecorder.isTypeSupported(mimeType),
  }));
}

function pickMime(diagnosticMode: boolean) {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = diagnosticMode
    ? ["video/webm;codecs=vp8,opus", "video/webm", "video/webm;codecs=vp9,opus"]
    : CODEC_CANDIDATES;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function fmtMB(bytes: number) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function RecordPage() {
  const { id } = Route.useParams();
  const router = useRouter();

  const [script, setScript] = useState<Script | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [perm, setPerm] = useState<PermState>("idle");
  const [permMsg, setPermMsg] = useState("");
  const [audioError, setAudioError] = useState("");
  const [videoInfo, setVideoInfo] = useState("");
  const [zoomInfo, setZoomInfo] = useState("");
  const [audioLabel, setAudioLabel] = useState("");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  const [scrolling, setScrolling] = useState(false);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadExt, setDownloadExt] = useState("webm");
  const [downloadMeta, setDownloadMeta] = useState("");
  const [showPanel, setShowPanel] = useState(true);
  const [recLog, setRecLog] = useState("");
  const [postCheck, setPostCheck] = useState("");
  const [diagnosticMode, setDiagnosticMode] = useState(false);
  const [codecSupport, setCodecSupport] = useState<ReturnType<typeof getCodecSupport>>([]);
  const [activeMime, setActiveMime] = useState("");
  const [finalizing, setFinalizing] = useState(false);

  // GRABACIÓN CON RecordRTC: tras confirmar que MediaRecorder nativo (con
  // distintos códecs, bitrates, resoluciones, fotogramas clave forzados y
  // grabación por tramos) no produce un archivo decodificable en este
  // dispositivo para duraciones largas, pasamos a una librería especializada
  // y ampliamente usada (RecordRTC) que gestiona internamente estas
  // incompatibilidades de Android/Chrome para grabaciones continuas largas,
  // en vez de seguir ajustando la API nativa a mano.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordRTCRef = useRef<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const startTsRef = useRef(0);
  const startPerfRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const speedRef = useRef(prefs.speed);
  speedRef.current = prefs.speed;


  useEffect(() => {
    const s = getScript(id);
    if (!s) {
      router.navigate({ to: "/" });
      return;
    }
    setScript(s);
    setPrefs(loadPrefs());
  }, [id, router]);

  useEffect(() => {
    const support = getCodecSupport();
    setCodecSupport(support);
    console.info("[MediaRecorder] soporte de códecs", support);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(list.filter((d) => d.kind === "audioinput"));
    } catch (err) {
      console.error("[Audio] enumerateDevices falló", err);
    }
  }, []);

  const startCamera = useCallback(
    async (facing: "user" | "environment", audioDeviceId: string, useDiagnosticMode: boolean) => {
      const orientationType = window.screen.orientation?.type ?? "desconocida";
      // Ya no forzamos aspectRatio ni width/height según orientación de pantalla:
      // el navegador negocia lo que el sensor entregue de forma nativa, y el
      // recorte/orientación final correctos se resuelven en el <canvas> antes
      // de grabar, no aquí. Esto evita OverconstrainedError y comportamiento
      // errático al girar el móvil.
      const videoConstraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      };
      const audioConstraints: MediaStreamConstraints = {
        audio: {
          ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPerm("idle");
      setPermMsg("");
      setAudioError("");
      setVideoInfo("");
      setZoomInfo("");
      setAudioLabel("");

      let videoStream: MediaStream;
      try {
        videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
      } catch (err) {
        const name = err instanceof DOMException || err instanceof Error ? err.name : "";
        const details = mediaErrorDetails(err);
        console.error("[Cámara] getUserMedia falló", {
          constraints: videoConstraints,
          orientationType,
          err,
        });
        setPerm(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
        setPermMsg(details);
        return;
      }

      let audioStream: MediaStream | null = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      } catch (err) {
        const details = mediaErrorDetails(err);
        console.error("[Micrófono] getUserMedia falló", { constraints: audioConstraints, err });
        setAudioError(details);
      }

      const stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...(audioStream?.getAudioTracks() ?? []),
      ]);
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      let capabilities: ZoomCapabilities | null = null;
      if (videoTrack) {
        try {
          capabilities = videoTrack.getCapabilities() as ZoomCapabilities;
          const zoom = capabilities.zoom;
          if (zoom) {
            const neutralZoom = Math.min(zoom.max ?? 1, Math.max(zoom.min ?? 1, 1));
            await videoTrack.applyConstraints({
              advanced: [{ zoom: neutralZoom } as ZoomConstraintSet],
            });
            console.info("[Cámara] zoom neutro aplicado", { neutralZoom, zoom });
          }
        } catch (err) {
          console.warn("[Cámara] no se pudo aplicar zoom neutro", err);
        }
      }

      const vs = videoTrack?.getSettings() as ZoomSettings | undefined;
      if (vs) {
        const orientation =
          vs.width && vs.height
            ? vs.height > vs.width
              ? "vertical"
              : "horizontal"
            : "orientación ?";
        setVideoInfo(
          `${vs.width ?? "?"}×${vs.height ?? "?"} · ${orientation} @ ${Math.round(vs.frameRate ?? 0)}fps`,
        );
        const zoomCapability = capabilities?.zoom;
        setZoomInfo(
          zoomCapability
            ? `Zoom disponible ${zoomCapability.min ?? "?"}–${zoomCapability.max ?? "?"} (paso ${zoomCapability.step ?? "?"}) · aplicado ${vs.zoom ?? "?"}`
            : `Zoom no expuesto por el dispositivo · aplicado ${vs.zoom ?? "no informado"}`,
        );
        console.info("[Cámara] capacidades y ajustes reales", {
          capabilities,
          settings: vs,
          screenOrientation: orientationType,
          requestedExactAspectRatio: 9 / 16,
        });
      }
      const at = stream.getAudioTracks()[0];
      if (at) setAudioLabel(at.label || "Micrófono predeterminado");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (err) {
          console.error("[Cámara] El vídeo no pudo reproducirse", err);
        }
      }
      setPerm("ready");
      refreshDevices();
    },
    [refreshDevices],
  );

  useEffect(() => {
    const p = loadPrefs();
    startCamera(p.facingMode, p.audioDeviceId, false);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);



  useEffect(() => {
    const onChange = () => refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", onChange);
    refreshDevices();
    return () => navigator.mediaDevices?.removeEventListener("devicechange", onChange);
  }, [refreshDevices]);

  // Auto-scroll loop
  useEffect(() => {
    if (!scrolling) {
      lastTsRef.current = 0;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const step = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      offsetRef.current += speedRef.current * dt;
      const el = trackRef.current;
      if (el) {
        const max = el.scrollHeight + 40;
        if (offsetRef.current > max) offsetRef.current = max;
        el.style.transform = `translate3d(0, ${-offsetRef.current}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrolling]);

  // Recording timer. This only refreshes the visible clock; elapsed time is
  // derived from a monotonic timestamp so delayed ticks cannot accumulate.
  useEffect(() => {
    if (!recording) return;
    const updateElapsed = () => {
      setElapsed(Math.floor((performance.now() - startPerfRef.current) / 1000));
    };
    updateElapsed();
    const t = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(t);
  }, [recording]);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeRef.current?.release();
    } catch {
      /* ignore */
    }
    wakeRef.current = null;
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      /* not critical */
    }
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && recording) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [recording, requestWakeLock]);

  useEffect(() => () => void releaseWakeLock(), [releaseWakeLock]);

  function resetScroll() {
    offsetRef.current = 0;
    if (trackRef.current) trackRef.current.style.transform = "translate3d(0,0,0)";
  }

  function updatePrefs(patch: Partial<Prefs>) {
    setPrefs((p) => ({ ...p, ...patch }));
    savePrefs(patch);
  }

  async function beginRecording() {
    const previewStream = streamRef.current;
    if (!previewStream || startingRef.current || recordRTCRef.current) return;
    startingRef.current = true;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setDownloadMeta("");
    setPostCheck("");
    resetScroll();
    setShowPanel(false);

    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCountdown(null);

    if (!previewStream.active) {
      startingRef.current = false;
      setRecLog("La cámara dejó de estar activa durante la cuenta atrás.");
      return;
    }

    const videoTrack = previewStream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") {
      setRecLog(
        `⚠ El track de vídeo de la cámara no está activo (readyState: ${videoTrack?.readyState ?? "sin track"}). No se iniciará la grabación.`,
      );
      startingRef.current = false;
      return;
    }
    const vset = videoTrack.getSettings();
    const pixels = (vset.width ?? 1080) * (vset.height ?? 1920);
    const fps = vset.frameRate ?? 30;
    const videoBitsPerSecond = diagnosticMode
      ? 4_000_000
      : Math.min(24_000_000, Math.max(8_000_000, Math.round(pixels * fps * 0.07)));

    setActiveMime("RecordRTC · vp8");
    setDownloadExt("webm");
    stoppingRef.current = false;

    const { default: RecordRTC, MediaStreamRecorder } = await import("recordrtc");
    // RecordRTC gestiona internamente el trocear y volver a unir la grabación
    // de forma segura para Android/Chrome, que es justo la parte que
    // fallaba al hacerlo a mano con MediaRecorder — timeSlice aquí es
    // manejado por la propia librería de forma fiable, no por nuestro código.
    const recorder = new RecordRTC(previewStream, {
      type: "video",
      mimeType: "video/webm;codecs=vp8,opus",
      recorderType: MediaStreamRecorder,
      videoBitsPerSecond,
      audioBitsPerSecond: 192_000,
      disableLogs: true,
      timeSlice: 3000,
      checkForInactiveTracks: true,
    });
    recordRTCRef.current = recorder;
    startTsRef.current = Date.now();
    startPerfRef.current = performance.now();
    recorder.startRecording();
    startingRef.current = false;
    setRecLog("Grabando con RecordRTC…");
    setElapsed(0);
    setRecording(true);
    setScrolling(true);
    requestWakeLock();
  }

  function stopRecording() {
    const recorder = recordRTCRef.current;
    setRecording(false);
    setScrolling(false);
    setShowPanel(true);
    releaseWakeLock();
    if (!recorder || stoppingRef.current) return;
    stoppingRef.current = true;
    setFinalizing(true);
    setRecLog("Cerrando el archivo… no cierres la pantalla");
    const durationMs = Date.now() - startTsRef.current;
    recorder.stopRecording(() => {
      const blob: Blob = recorder.getBlob();
      recordRTCRef.current = null;
      stoppingRef.current = false;
      if (!blob || blob.size === 0) {
        setRecLog("⚠ RecordRTC no generó ningún dato");
        setFinalizing(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const seconds = Math.round(durationMs / 1000);
      setDownloadUrl(url);
      setDownloadMeta(`${seconds}s · ${fmtMB(blob.size)}`);
      setRecLog(`Grabación finalizada · ${seconds}s · ${fmtMB(blob.size)}`);
      setFinalizing(false);

      // Misma comprobación que antes: dejamos que el propio navegador
      // decodifique el archivo para confirmar cuánto vídeo real contiene.
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.src = url;
      probe.onloadedmetadata = () => {
        const decoded = probe.duration;
        const diff = seconds - decoded;
        const verdict =
          Number.isFinite(decoded) && diff > 3
            ? `⚠ EL VÍDEO SE CORTA ANTES: decodificado ${decoded.toFixed(1)}s de los ${seconds}s grabados`
            : `✓ Duración decodificada OK: ${Number.isFinite(decoded) ? decoded.toFixed(1) : "?"}s de ${seconds}s`;
        setPostCheck(verdict);
      };
      probe.onerror = () => {
        setPostCheck("⚠ El navegador no pudo leer metadatos del archivo generado");
      };
    });
  }

  const title = script?.title ?? "";

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 size-full object-contain"
        style={{ transform: prefs.facingMode === "user" ? "scaleX(-1)" : undefined }}
      />

      {/* Teleprompter overlay */}
      <div
        onClick={() => recording && setScrolling((s) => !s)}
        className="absolute inset-x-0 top-0 h-[58svh] cursor-pointer"
      >
        <div className="absolute inset-x-2 top-[calc(env(safe-area-inset-top,0px)+4rem)] bottom-3 overflow-hidden rounded-3xl bg-glass-strong backdrop-blur-[2px] prompter-fade">
          <div
            ref={trackRef}
            className="px-5 pt-16 pb-24 will-change-transform"
            style={{
              transform: "translate3d(0,0,0)",
              fontSize: `${prefs.fontSize}px`,
              lineHeight: 1.45,
              transformOrigin: "center",
            }}
          >
            <div
              style={{ transform: prefs.mirror ? "scaleX(-1)" : undefined }}
              className="whitespace-pre-wrap text-center font-semibold text-foreground drop-shadow"
            >
              {script?.body}
            </div>
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 safe-top safe-x">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Volver a guiones"
            className="size-11 shrink-0 rounded-full bg-glass-strong backdrop-blur"
            onClick={() => {
              if (recording) stopRecording();
              router.navigate({ to: "/" });
            }}
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div className="min-w-0 text-center">
            {recording ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-glass-strong px-3 py-1.5 text-sm font-bold tabular-nums backdrop-blur">
                <span className="size-2.5 animate-pulse rounded-full bg-rec" />
                {fmt(elapsed)}
                {!scrolling && (
                  <span className="text-xs font-medium text-muted-foreground">
                    · scroll en pausa
                  </span>
                )}
              </span>
            ) : (
              <span className="block truncate rounded-full bg-glass px-3 py-1.5 text-sm font-semibold backdrop-blur">
                {title}
              </span>
            )}
          </div>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Cambiar de cámara"
            disabled={recording || countdown !== null}
            className="size-11 shrink-0 rounded-full bg-glass-strong backdrop-blur disabled:opacity-40"
            onClick={() => {
              const next = prefs.facingMode === "user" ? "environment" : "user";
              updatePrefs({ facingMode: next });
              startCamera(next, prefs.audioDeviceId, diagnosticMode);
            }}
          >
            <SwitchCamera className="size-5" />
          </Button>
        </div>
      </div>

      {/* Countdown */}
      {countdown !== null && (
        <div className="absolute inset-0 grid place-items-center bg-black/50">
          <span className="text-[8rem] font-extrabold text-primary tabular-nums">{countdown}</span>
        </div>
      )}

      {/* Permission error */}
      {(perm === "denied" || perm === "error") && (
        <div className="absolute inset-0 grid place-items-center bg-background/95 safe-x">
          <div className="max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
            <h2 className="text-lg font-bold">Error real de cámara</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Petición ejecutada con resolución vertical ideal:{" "}
              {diagnosticMode ? "720×1280" : "1080×1920"}.
            </p>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-left text-xs text-foreground">
              {permMsg}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Revisa el permiso de cámara en el candado de la barra de direcciones o en los ajustes
              del navegador.
            </p>
            <Button
              className="mt-5 h-12 w-full rounded-2xl font-bold"
              onClick={() => startCamera(prefs.facingMode, prefs.audioDeviceId, diagnosticMode)}
            >
              Reintentar
            </Button>
          </div>
        </div>
      )}

      {perm === "ready" && audioError && (
        <div className="absolute inset-x-3 top-20 z-10 rounded-lg border border-border bg-card p-3 text-sm shadow-lg">
          <p className="font-bold">La cámara funciona, pero el micrófono ha fallado</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Petición: <code>getUserMedia({"{ audio: true }"})</code>
          </p>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-foreground">
            {audioError}
          </pre>
        </div>
      )}

      {perm === "ready" && (videoInfo || zoomInfo || audioLabel) && (
        <div className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] z-10 flex justify-center">
          <div className="max-w-full rounded-lg bg-glass-strong px-3 py-1 text-center text-[10px] text-muted-foreground backdrop-blur">
            <p>
              {videoInfo} · {audioLabel}
            </p>
            <p>{zoomInfo}</p>
          </div>
        </div>
      )}

      {recording && (
        <div className="pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top,0px)+5.75rem)] z-10 flex justify-center">
          <div className="w-full max-w-md rounded-lg bg-glass-strong px-3 py-2 text-[10px] text-muted-foreground backdrop-blur">
            <p className="text-center font-semibold text-foreground">
              Grabando… {elapsed}s transcurridos
            </p>
            <p className="mt-0.5 text-center">
              {activeMime || "Códec predeterminado"} · flujo continuo sin cortes
            </p>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 safe-bottom safe-x">
        {showPanel && (
          <div className="mb-3 rounded-3xl bg-glass-strong p-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <Gauge className="size-5 shrink-0 text-primary" />
              <Slider
                aria-label="Velocidad de scroll"
                value={[prefs.speed]}
                min={8}
                max={160}
                step={2}
                onValueChange={(v) => updatePrefs({ speed: v[0] ?? prefs.speed })}
                className="flex-1"
              />
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {prefs.speed}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Type className="size-5 shrink-0 text-primary" />
              <Slider
                aria-label="Tamaño de fuente"
                value={[prefs.fontSize]}
                min={16}
                max={72}
                step={1}
                onValueChange={(v) => updatePrefs({ fontSize: v[0] ?? prefs.fontSize })}
                className="flex-1"
              />
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {prefs.fontSize}px
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Mic className="size-5 shrink-0 text-primary" />
              <select
                aria-label="Micrófono"
                disabled={recording || countdown !== null}
                value={prefs.audioDeviceId}
                onChange={(e) => {
                  const value = e.target.value;
                  updatePrefs({ audioDeviceId: value });
                  startCamera(prefs.facingMode, value, diagnosticMode);
                }}
                className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-40"
              >
                <option value="">Micrófono predeterminado</option>
                {audioDevices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Micrófono ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <label className="mt-4 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={diagnosticMode}
                disabled={recording || countdown !== null}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setDiagnosticMode(enabled);
                  startCamera(prefs.facingMode, prefs.audioDeviceId, enabled);
                }}
                className="size-5 accent-primary"
              />
              <span>Prueba estable: vertical 720×1280 · VP8 · 4 Mbps</span>
            </label>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>Perfil: {diagnosticMode ? "Prueba VP8 720p / 4 Mbps" : "Vertical 1080×1920"}</p>
              <p>Vídeo: {videoInfo || "—"} (stream real de la cámara)</p>
              <p>Zoom: {zoomInfo || "—"}</p>
              <p className="truncate">Micrófono: {audioLabel || "—"}</p>
              <p className="break-words">Códec activo: {activeMime || "Se decidirá al grabar"}</p>
              <p className="break-words">
                Soporte:{" "}
                {codecSupport
                  .map(
                    (codec) =>
                      `${codec.mimeType.replace("video/", "")} ${codec.supported ? "✓" : "✕"}`,
                  )
                  .join(" · ") || "—"}
              </p>
              {recLog && <p className="break-words text-foreground">Estado: {recLog}</p>}
              {postCheck && (
                <p
                  className={`break-words font-semibold ${
                    postCheck.startsWith("⚠") ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {postCheck}
                </p>
              )}
            </div>
          </div>
        )}

        {finalizing && (
          <div className="mb-3 rounded-2xl bg-glass-strong px-4 py-2 text-center text-sm font-semibold backdrop-blur">
            Cerrando el archivo de vídeo…
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Reiniciar guion al principio"
            className="size-14 rounded-full bg-glass-strong backdrop-blur"
            onClick={resetScroll}
          >
            <RotateCcw className="size-6" />
          </Button>

          <Button
            variant="secondary"
            size="icon"
            aria-label={scrolling ? "Pausar scroll" : "Reanudar scroll"}
            className="size-14 rounded-full bg-glass-strong backdrop-blur"
            onClick={() => setScrolling((s) => !s)}
          >
            {scrolling ? <Pause className="size-6" /> : <Play className="size-6" />}
          </Button>

          {recording ? (
            <Button
              size="icon"
              aria-label="Detener grabación"
              className="size-20 rounded-full bg-rec text-foreground hover:bg-rec/90"
              onClick={stopRecording}
            >
              <Square className="size-8 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              aria-label="Empezar a grabar"
              disabled={perm !== "ready" || countdown !== null}
              className="size-20 rounded-full border-4 border-foreground/70 bg-rec text-foreground hover:bg-rec/90"
              onClick={beginRecording}
            >
              <span className="size-7 rounded-full bg-foreground" />
            </Button>
          )}

          <Button
            variant="secondary"
            size="icon"
            aria-label="Modo espejo"
            className={`size-14 rounded-full backdrop-blur ${
              prefs.mirror ? "bg-primary text-primary-foreground" : "bg-glass-strong"
            }`}
            onClick={() => updatePrefs({ mirror: !prefs.mirror })}
          >
            <FlipHorizontal2 className="size-6" />
          </Button>

          {downloadUrl ? (
            <a
              href={downloadUrl}
              download={`${title || "toma"}.${downloadExt}`}
              aria-label="Descargar vídeo"
              className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              <Download className="size-6" />
              {downloadMeta && (
                <span className="sr-only">{downloadMeta}</span>
              )}
            </a>
          ) : (
            <Button
              variant="secondary"
              size="icon"
              aria-label="Ajustes de texto"
              className="size-14 rounded-full bg-glass-strong backdrop-blur"
              onClick={() => setShowPanel((v) => !v)}
            >
              <Type className="size-6" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
