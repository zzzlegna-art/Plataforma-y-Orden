import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  CameraOff,
  Check,
  Flashlight,
  Plus,
  ScanLine,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  MultiFormatReader,
} from "@zxing/library";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const HINTS = new Map<DecodeHintType, unknown>();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
]);
// Busca más a fondo en cada fotograma (mejora la lectura en bodega/local).
HINTS.set(DecodeHintType.TRY_HARDER, true);

type ScanControls = { stop: () => void };

/** Detector nativo del navegador (Chrome/Android, Samsung Internet): más rápido y preciso que ZXing. */
interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
}
type NativeBarcodeDetectorCtor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

type LiveOcrWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<void>;
  terminate: () => Promise<unknown>;
};
type LiveOcrApi = {
  createWorker: (language: string, oem: number, options: {
    workerPath: string; corePath: string; langPath: string;
  }) => Promise<LiveOcrWorker>;
};
let liveOcrApiPromise: Promise<LiveOcrApi> | null = null;

const loadLiveOcr = (): Promise<LiveOcrApi> => {
  const current = (window as Window & { Tesseract?: LiveOcrApi }).Tesseract;
  if (current) return Promise.resolve(current);
  if (liveOcrApiPromise) return liveOcrApiPromise;
  liveOcrApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-nexora-live-ocr]");
    const script = existing ?? document.createElement("script");
    const finish = () => {
      const api = (window as Window & { Tesseract?: LiveOcrApi }).Tesseract;
      if (api) resolve(api);
      else reject(new Error("El motor OCR no quedó disponible"));
    };
    if (existing) {
      if ((window as Window & { Tesseract?: LiveOcrApi }).Tesseract) finish();
      else script.addEventListener("load", finish, { once: true });
      return;
    }
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js";
    script.async = true;
    script.dataset.nexoraLiveOcr = "true";
    script.onload = finish;
    script.onerror = () => reject(new Error("No se pudo descargar el motor OCR"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    liveOcrApiPromise = null;
    throw error;
  });
  return liveOcrApiPromise;
};

const isValidImei = (value: string): boolean => {
  if (!/^\\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    let digit = Number(value[index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
};

const extractValidImei = (text: string): string | null => {
  const digits = text.replace(/\\D/g, "");
  for (let index = 0; index <= digits.length - 15; index += 1) {
    const candidate = digits.slice(index, index + 15);
    if (isValidImei(candidate)) return candidate;
  }
  return null;
};

const NATIVE_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
];

const createNativeDetector = (): NativeBarcodeDetector | null => {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: NATIVE_FORMATS });
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
};

/** Zona del fotograma (en píxeles del video) que queda dentro del recuadro de escaneo. */
const getFrameArea = (video: HTMLVideoElement, frame: HTMLElement | null) => {
  if (!frame || !video.videoWidth || !video.videoHeight) return null;
  const videoBox = video.getBoundingClientRect();
  const frameBox = frame.getBoundingClientRect();
  if (!videoBox.width || !videoBox.height) return null;

  // El video se muestra con object-cover: se recorta por los lados, y hay que descontarlo.
  const scale = Math.max(videoBox.width / video.videoWidth, videoBox.height / video.videoHeight);
  const offsetX = (videoBox.width - video.videoWidth * scale) / 2;
  const offsetY = (videoBox.height - video.videoHeight * scale) / 2;

  const sx = Math.max(0, (frameBox.left - videoBox.left - offsetX) / scale);
  const sy = Math.max(0, (frameBox.top - videoBox.top - offsetY) / scale);
  const sw = Math.min(frameBox.width / scale, video.videoWidth - sx);
  const sh = Math.min(frameBox.height / scale, video.videoHeight - sy);
  if (sw < 16 || sh < 16) return null;
  return { sx, sy, sw, sh };
};

/** Lee un código de barras desde un canvas con ZXing; null si no hay ninguno legible. */
const decodeCanvas = (reader: MultiFormatReader, canvas: HTMLCanvasElement): string | null => {
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)));
    return reader.decode(bitmap, HINTS).getText();
  } catch {
    return null;
  } finally {
    reader.reset();
  }
};

let audioContext: AudioContext | null = null;

/** Pitido corto de confirmación (Web Audio: no necesita archivos de sonido). */
const playBeep = (frequency = 1200) => {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!audioContext) audioContext = new Ctor();
    const ctx = audioContext;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
  } catch {
    // Sin audio disponible: la confirmación visual y la vibración bastan.
  }
};

/** Pide enfoque continuo (si la cámara lo permite): sin esto, los códigos pequeños salen borrosos. */
const requestContinuousFocus = (track: MediaStreamTrack | undefined) => {
  if (!track) return;
  track
    .applyConstraints({ advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet] })
    .catch(() => {
      // La cámara no soporta enfoque continuo: se usa el automático.
    });
};

/**
 * Entrada de serial/IMEI pensada para escaneo: mantiene el foco, acepta lectores
 * USB/Bluetooth (que escriben y envían Enter) y escanea con la cámara del móvil
 * o del escritorio usando ZXing. La cámara usa la trasera (facingMode
 * "environment"), una resolución generosa y una cadencia rápida; además tiene
 * linterna para bodegas con poca luz. Si la cámara no está disponible o se
 * bloquea, queda la captura manual.
 */
export const SerialScanInput = ({
  onScan,
  validate,
  placeholder,
  disabled = false,
  autoFocus = true,
  hint,
  className,
  stacked = false,
  submitLabel,
  autoConfirm = false,
}: {
  onScan: (serial: string) => void | Promise<void>;
  /** Si devuelve un texto, la lectura se rechaza y se muestra ese mensaje (p. ej. "Debe tener 15 dígitos"). */
  validate?: (serial: string) => string | null;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  hint?: string;
  className?: string;
  /** Diseño apilado: campo arriba y botones "Agregar" / "Escanear con cámara" debajo. */
  stacked?: boolean;
  /** Texto del botón de agregar (solo en modo apilado). */
  submitLabel?: string;
  /** Propiedad heredada; la lectura por foto ya no existe. */
  hidePhoto?: boolean;
  /**
   * Confirma solo el serial escrito cuando ya es válido (sin tener que presionar Enter).
   * Espera un instante tras dejar de escribir para no cortar un serial que aún se está tecleando.
   */
  autoConfirm?: boolean;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScanControls | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // En celular/tablet (puntero táctil) no se enfoca el campo solo: abriría el teclado.
  const touchDeviceRef = useRef(
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
  );
  const cameraOnRef = useRef(false);
  // Siempre la última función del padre: así `submit` es estable y la cámara no se reinicia
  // (parpadeo) cada vez que la pantalla se vuelve a dibujar tras un escaneo.
  const onScanRef = useRef(onScan);
  const validateRef = useRef(validate);
  const feedbackTimerRef = useRef<number | null>(null);
  const cameraStateRef = useRef({
    candidate: "",
    candidateAt: 0,
    candidateCount: 0,
    acceptedValue: "",
    acceptedSeenAt: 0,
    acceptedAt: 0,
  });
  const [feedback, setFeedback] = useState<{ id: number; serial: string; error?: string } | null>(null);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem("scan-sound") !== "off";
    } catch {
      return true;
    }
  });
  const soundOnRef = useRef(soundOn);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const [value, setValue] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [sessionScans, setSessionScans] = useState<string[]>([]);
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const cameraSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  /** Lectura rechazada por la validación: aviso, vibración y marca roja en el visor. */
  const rejectScan = useCallback((serial: string, problem: string) => {
    toast.error(problem, { id: "scan-invalid" });
    try {
      navigator.vibrate?.([80, 60, 80]);
    } catch {
      // Vibración no disponible.
    }
    if (soundOnRef.current) playBeep(320);
    setFeedback({ id: Date.now(), serial, error: problem });
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 1800);
  }, []);

  const submit = useCallback(
    (raw: string): boolean => {
      const serial = raw.trim();
      if (!serial) return false;
      const problem = validateRef.current?.(serial) ?? null;
      if (problem) {
        rejectScan(serial, problem);
        return false;
      }
      const now = Date.now();
      // Los escáneres pueden disparar dos veces la misma lectura seguida.
      if (lastScanRef.current.value === serial && now - lastScanRef.current.at < 1200) {
        return false;
      }
      lastScanRef.current = { value: serial, at: now };
      void onScanRef.current(serial);
      setValue("");
      // Con lector USB/Bluetooth en escritorio se mantiene el foco; con cámara o en móvil no,
      // porque el teclado taparía el visor.
      if (!touchDeviceRef.current && !cameraOnRef.current) inputRef.current?.focus();
      return true;
    },
    [rejectScan],
  );

  useEffect(() => {
    onScanRef.current = onScan;
    validateRef.current = validate;
  });

  useEffect(() => {
    if (!autoConfirm) return;
    const serial = value.trim();
    if (!serial || validateRef.current?.(serial) !== null) return;
    const timer = window.setTimeout(() => submit(serial), 450);
    return () => window.clearTimeout(timer);
  }, [autoConfirm, value, submit]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    try {
      localStorage.setItem("scan-sound", next ? "on" : "off");
    } catch {
      // Sin almacenamiento: la preferencia solo dura esta sesión.
    }
  };

  /** Confirmación de lectura: vibración, pitido y marca verde en el visor. */
  const confirmScan = useCallback((serial: string) => {
    try {
      navigator.vibrate?.(60);
    } catch {
      // Vibración no disponible (p. ej. iPhone).
    }
    if (soundOnRef.current) playBeep();
    setSessionScans((current) => [serial, ...current].slice(0, 4));
    setFeedback({ id: Date.now(), serial });
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 1400);
  }, []);

  /**
   * Lecturas de la cámara: la cámara ve el mismo código muchas veces por segundo, así que
   * (1) se exige leerlo 2 veces seguidas (evita lecturas erróneas), (2) mientras siga frente
   * a la cámara no se vuelve a registrar, y solo cuenta de nuevo si se aparta y regresa.
   */
  const handleCameraRead = useCallback(
    (raw: string) => {
      const serial = raw.trim();
      if (!serial) return;
      const now = Date.now();
      const state = cameraStateRef.current;

      if (state.acceptedValue === serial && now - state.acceptedSeenAt < 1500) {
        state.acceptedSeenAt = now;
        return;
      }
      if (state.candidate === serial && now - state.candidateAt < 1800) {
        state.candidateCount += 1;
      } else {
        state.candidate = serial;
        state.candidateCount = 1;
      }
      state.candidateAt = now;
      if (state.candidateCount < 2 || now - state.acceptedAt < 700) return;

      state.acceptedValue = serial;
      state.acceptedSeenAt = now;
      state.acceptedAt = now;
      state.candidate = "";
      state.candidateCount = 0;
      if (submit(serial)) confirmScan(serial);
    },
    [submit, confirmScan],
  );

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }, []);

  const applyTorch = useCallback((on: boolean) => {
    const video = videoRef.current;
    const track =
      video?.srcObject instanceof MediaStream
        ? video.srcObject.getVideoTracks()[0]
        : undefined;
    if (!track) return;
    track
      // `torch` no está en los tipos estándar, pero es lo que usan los navegadores.
      .applyConstraints({ advanced: [{ torch: on } as unknown as MediaTrackConstraintSet] })
      .then(() => setTorch(on))
      .catch(() => {
        // El dispositivo no soporta linterna en esta cámara.
        setTorch(false);
        setTorchAvailable(false);
      });
  }, []);


  useEffect(() => {
    if (autoFocus && !disabled && !touchDeviceRef.current) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
    if (!cameraOn) return;
    // Al abrir la cámara se suelta el campo de texto para que no aparezca el teclado.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    let active = true;
    setCameraError(false);
    setTorch(false);
    setTorchAvailable(false);

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            // Resolución alta: los IMEI impresos son pequeños y necesitan detalle.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        requestContinuousFocus(stream.getVideoTracks()[0]);
        video.srcObject = stream;
        await video.play();

        // Solo se analiza lo que está dentro del recuadro: se recorta ese pedazo del video
        // a un canvas y se lee con el detector nativo (o ZXing si el navegador no lo tiene).
        const native = createNativeDetector();
        let useNative = Boolean(native);
        const zxing = new MultiFormatReader();
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        let busy = false;
        let ocrWorker: LiveOcrWorker | null = null;
        let lastOcrAt = 0;

        // El OCR se prepara en segundo plano mientras los códigos de barras ya se leen.
        void loadLiveOcr()
          .then(async (api) => {
            const worker = await api.createWorker("eng", 1, {
              workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/worker.min.js",
              corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
              langPath: "https://tessdata.projectnaptha.com/4.0.0",
            });
            await worker.setParameters({
              tessedit_char_whitelist: "0123456789",
              tessedit_pageseg_mode: "7",
            });
            if (!active) await worker.terminate();
            else ocrWorker = worker;
          })
          .catch(() => {
            if (active) toast.error("No se pudo cargar el reconocimiento de IMEI. Los códigos de barras siguen disponibles.");
          });

        const timer = window.setInterval(() => {
          if (busy || !active || !context || video.readyState < 2) return;
          const area = getFrameArea(video, frameRef.current);
          if (!area) return;

          const shrink = Math.min(1, 1600 / area.sw);
          canvas.width = Math.round(area.sw * shrink);
          canvas.height = Math.round(area.sh * shrink);
          context.drawImage(
            video,
            area.sx,
            area.sy,
            area.sw,
            area.sh,
            0,
            0,
            canvas.width,
            canvas.height,
          );

          busy = true;
          const read: Promise<string | null> =
            useNative && native
              ? native
                  .detect(canvas)
                  .then((codes) => codes.map((code) => code.rawValue).filter(Boolean).join("\n") || null)
                  .catch(() => {
                    // El detector nativo falló: se sigue con ZXing.
                    useNative = false;
                    return null;
                  })
              : Promise.resolve(decodeCanvas(zxing, canvas));
          void read
            .then(async (text) => {
              if (!active) return;
              if (text) {
                text.split("\n").forEach((value) => handleCameraRead(value));
                return;
              }
              // OCR solo se ejecuta cuando el detector no encuentra un código de barras.
              // Analiza un fotograma del video local; no sube ni guarda imágenes.
              if (!ocrWorker || Date.now() - lastOcrAt < 600) return;
              lastOcrAt = Date.now();
              try {
                const result = await ocrWorker.recognize(canvas);
                const imei = extractValidImei(result.data.text);
                if (imei && active) handleCameraRead(imei);
              } catch {
                // Un fotograma borroso no debe detener el escaneo continuo.
              }
            })
            .finally(() => {
              busy = false;
            });
        }, 150);

        controlsRef.current = {
          stop: () => {
            window.clearInterval(timer);
            if (ocrWorker) {
              void ocrWorker.terminate();
              ocrWorker = null;
            }
            stream.getTracks().forEach((track) => track.stop());
            video.srcObject = null;
          },
        };
        setTorchAvailable(true);
      } catch {
        if (active) {
          setCameraError(true);
          setCameraOn(false);
        }
      }
    };
    void start();

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [cameraOn, handleCameraRead]);

  return (
    <div className={cn("space-y-2", className)}>
      {stacked ? (
        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={value}
            disabled={disabled}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder ?? t("scan.placeholder")}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit(value);
              }
            }}
            className="pl-9 font-tabular"
          />
        </div>
      ) : null}

      {stacked ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={disabled || !value.trim()}
            onClick={() => submit(value)}
          >
            <Plus />
            {submitLabel ?? t("scan.add")}
          </Button>
          {cameraSupported ? (
            <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setCameraOn(true)}>
              <Camera className="mr-2 h-5 w-5" />
              {t("scan.scanWithCamera")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!stacked ? (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={value}
              disabled={disabled}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder ?? t("scan.placeholder")}
              onChange={(event) => setValue(event.target.value)}
              onBlur={() => {
                const serial = value.trim();
                if (autoConfirm && serial && validateRef.current?.(serial) === null) submit(serial);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit(value);
                }
              }}
              className="pl-9 font-tabular"
            />
          </div>
          {cameraSupported ? (
            <Button type="button" variant="outline" size="icon" aria-label={t("scan.camera")} title={t("scan.camera")} onClick={() => setCameraOn(true)}>
              <Camera />
            </Button>
          ) : null}
        </div>
      ) : null}


      <Dialog open={cameraOn} onOpenChange={(open) => { if (!open) stopCamera(); else setCameraOn(true); }}>
        <DialogContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-0 left-0 top-0 z-[100] flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white shadow-none sm:rounded-none max-sm:bottom-auto max-sm:left-0 max-sm:top-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-hidden max-sm:rounded-none max-sm:pb-0"
        >
          <DialogTitle className="sr-only">Escáner de recepción Nexora</DialogTitle>
          <DialogDescription className="sr-only">Cámara en vivo para leer IMEI y códigos de barras. El análisis se realiza en el dispositivo.</DialogDescription>
          <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/80 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.85rem)]">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-wide">NEXORA · ESCÁNER</p>
              <p className="mt-0.5 text-xs text-white/60">Apunta al IMEI o al código de barras</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium tabular-nums">{sessionScans.length} recientes</span>
              <Button type="button" variant="secondary" size="icon" className="h-10 w-10 rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Cerrar escáner" onClick={stopCamera}>
                <CameraOff className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-black/20" />
            <div
              ref={frameRef}
              className={cn(
                "pointer-events-none absolute left-[7%] right-[7%] top-1/2 h-[23%] -translate-y-1/2 rounded-2xl border-[3px] shadow-[0_0_0_9999px_rgba(0,0,0,0.48)] transition-colors duration-200",
                feedback?.error ? "border-red-400 bg-red-500/10" : feedback ? "border-emerald-400 bg-emerald-400/10" : "border-cyan-300",
              )}
            >
              <span className="absolute -left-[3px] -top-[3px] h-7 w-7 rounded-tl-xl border-l-[5px] border-t-[5px] border-current" />
              <span className="absolute -right-[3px] -top-[3px] h-7 w-7 rounded-tr-xl border-r-[5px] border-t-[5px] border-current" />
              <span className="absolute -bottom-[3px] -left-[3px] h-7 w-7 rounded-bl-xl border-b-[5px] border-l-[5px] border-current" />
              <span className="absolute -bottom-[3px] -right-[3px] h-7 w-7 rounded-br-xl border-b-[5px] border-r-[5px] border-current" />
              {!feedback ? <span className="absolute inset-x-4 top-1/2 h-px animate-pulse bg-cyan-200/90 shadow-[0_0_12px_rgba(103,232,249,0.9)]" /> : null}
            </div>
            {feedback ? (
              <div key={feedback.id} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className={cn("flex max-w-[85%] flex-col items-center gap-2 rounded-2xl px-5 py-4 text-center shadow-2xl backdrop-blur-md", feedback.error ? "bg-red-500/90 text-white" : "bg-emerald-500/90 text-white")}>
                  {feedback.error ? <X className="h-9 w-9" /> : <Check className="h-9 w-9" />}
                  <span className="text-sm font-bold">{feedback.error ? "NO VÁLIDO" : "LECTURA CORRECTA"}</span>
                  <span className="break-all font-mono text-base font-semibold">{feedback.serial}</span>
                  {feedback.error ? <span className="text-xs">Revisa el enfoque e inténtalo otra vez</span> : null}
                </div>
              </div>
            ) : null}
            {cameraError ? <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 text-center text-sm text-red-300">{t("scan.cameraError")}</div> : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center">
              <span className="rounded-full bg-black/55 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur">
                {feedback?.error ? "No se agregó · vuelve a intentarlo" : feedback ? "Agregado a la recepción" : "Centra el código dentro del recuadro"}
              </span>
            </div>
          </div>
          <div className="shrink-0 space-y-3 border-t border-white/10 bg-[#090b10] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", cameraError ? "bg-red-400" : "animate-pulse bg-emerald-400")} />
                <span className="truncate text-xs text-white/75">{cameraError ? "Cámara no disponible" : "Cámara activa · lectura continua"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-full text-white hover:bg-white/10 hover:text-white" aria-label={soundOn ? t("scan.soundOff") : t("scan.soundOn")} onClick={toggleSound}>
                  {soundOn ? <Volume2 /> : <VolumeX />}
                </Button>
                {torchAvailable ? <Button type="button" variant={torch ? "secondary" : "ghost"} size="icon" className="h-10 w-10 rounded-full text-white hover:bg-white/10 hover:text-white" aria-label={t("scan.torch")} onClick={() => applyTorch(!torch)}><Flashlight /></Button> : null}
              </div>
            </div>
            {sessionScans.length > 0 ? (
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/40">Últimas</span>
                <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
                  {sessionScans.slice(0, 3).map((serial) => <span key={serial} className="truncate rounded-md bg-white/10 px-2 py-1 font-mono text-[11px] text-emerald-200">{serial}</span>)}
                </div>
              </div>
            ) : null}
            <p className="text-center text-[11px] text-white/45">No se toman ni se suben fotos. Nexora analiza la cámara en tiempo real en este dispositivo.</p>
          </div>
        </DialogContent>
      </Dialog>

      {cameraError && !cameraOn ? (
        <p className="text-xs text-destructive">{t("scan.cameraError")}</p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {hint ?? t(cameraSupported ? "scan.hint" : "scan.hintNoCamera")}
      </p>
    </div>
  );
};
