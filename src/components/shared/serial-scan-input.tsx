import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  CameraOff,
  Check,
  Flashlight,
  ImagePlus,
  Plus,
  ScanLine,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BrowserMultiFormatReader } from "@zxing/browser";
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
  hidePhoto = false,
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
  /** Oculta el botón de leer el código desde una foto. */
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
  const photoInputRef = useRef<HTMLInputElement>(null);
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
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
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
      if (state.candidate === serial && now - state.candidateAt < 1000) {
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

  /** Lee un código desde una foto tomada con la cámara del celular (enfoca y da más detalle que el video). */
  const readPhoto = useCallback(
    async (file: File) => {
      setPhotoBusy(true);
      setPhotoError(false);
      let text: string | null = null;
      try {
        const detector = createNativeDetector();
        if (detector) {
          try {
            const bitmap = await createImageBitmap(file);
            const codes = await detector.detect(bitmap);
            bitmap.close();
            text = codes[0]?.rawValue ?? null;
          } catch {
            text = null;
          }
        }
        if (!text) {
          const url = URL.createObjectURL(file);
          try {
            const result = await new BrowserMultiFormatReader(HINTS).decodeFromImageUrl(url);
            text = result.getText();
          } catch {
            text = null;
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        if (text) submit(text);
        else setPhotoError(true);
      } finally {
        setPhotoBusy(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
      }
    },
    [submit],
  );

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
                  .then((codes) => codes[0]?.rawValue ?? null)
                  .catch(() => {
                    // El detector nativo falló: se sigue con ZXing.
                    useNative = false;
                    return null;
                  })
              : Promise.resolve(decodeCanvas(zxing, canvas));
          void read
            .then((text) => {
              if (text && active) handleCameraRead(text);
            })
            .finally(() => {
              busy = false;
            });
        }, 150);

        controlsRef.current = {
          stop: () => {
            window.clearInterval(timer);
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
            <Button
              type="button"
              variant={cameraOn ? "secondary" : "outline"}
              onClick={() => {
                if (cameraOn) stopCamera();
                else setCameraOn(true);
              }}
            >
              {cameraOn ? <CameraOff /> : <Camera />}
              {t(cameraOn ? "scan.cameraStop" : "scan.scanWithCamera")}
            </Button>
          ) : null}
          {hidePhoto ? null : (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || photoBusy}
              loading={photoBusy}
              onClick={() => photoInputRef.current?.click()}
            >
              <ImagePlus />
              {t("scan.photo")}
            </Button>
          )}
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
            <Button
              type="button"
              variant={cameraOn ? "secondary" : "outline"}
              size="icon"
              aria-label={t("scan.camera")}
              title={t("scan.camera")}
              onClick={() => {
                if (cameraOn) stopCamera();
                else setCameraOn(true);
              }}
            >
              {cameraOn ? <CameraOff /> : <Camera />}
            </Button>
          ) : null}
          {hidePhoto ? null : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled || photoBusy}
              aria-label={t("scan.photo")}
              title={t("scan.photo")}
              onClick={() => photoInputRef.current?.click()}
            >
              <ImagePlus />
            </Button>
          )}
        </div>
      ) : null}

      {/* Abre la cámara nativa del celular: enfoca mejor y da más resolución. */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readPhoto(file);
        }}
      />

      {cameraOn ? (
        <div className="relative overflow-hidden rounded-lg border bg-foreground/5">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-video w-full object-cover"
          />
          {/* Recuadro de lectura: solo lo que entra aquí se analiza; el resto se oscurece. */}
          <div
            ref={frameRef}
            className={cn(
              "pointer-events-none absolute inset-x-5 inset-y-8 rounded-xl border-2 shadow-[0_0_0_9999px_hsl(var(--background)/0.55)] transition-colors duration-300",
              feedback?.error
                ? "border-destructive bg-destructive/20"
                : feedback
                  ? "border-success bg-success/15"
                  : "border-primary/80",
            )}
          />
          {feedback ? (
            <div
              key={feedback.id}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <span
                className={cn(
                  "flex h-14 w-14 animate-pop-in items-center justify-center rounded-full shadow-lg motion-reduce:animate-none",
                  feedback.error
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-success text-success-foreground",
                )}
              >
                {feedback.error ? (
                  <X className="h-8 w-8" strokeWidth={3} />
                ) : (
                  <Check className="h-8 w-8" strokeWidth={3} />
                )}
              </span>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute left-2 top-2"
            aria-label={soundOn ? t("scan.soundOff") : t("scan.soundOn")}
            title={soundOn ? t("scan.soundOff") : t("scan.soundOn")}
            onClick={toggleSound}
          >
            {soundOn ? <Volume2 /> : <VolumeX />}
          </Button>
          {cameraError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-sm text-destructive">
              {t("scan.cameraError")}
            </div>
          ) : null}
          {torchAvailable && !cameraError ? (
            <Button
              type="button"
              variant={torch ? "default" : "secondary"}
              size="icon"
              className="absolute right-2 top-2"
              aria-label={t("scan.torch")}
              title={t("scan.torch")}
              onClick={() => applyTorch(!torch)}
            >
              <Flashlight />
            </Button>
          ) : null}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 px-3 py-1.5 text-center text-xs backdrop-blur transition-colors duration-300",
              feedback?.error
                ? "bg-destructive/90 font-medium text-destructive-foreground"
                : feedback
                  ? "bg-success/90 font-medium text-success-foreground"
                  : "bg-background/70 text-foreground",
            )}
          >
            {feedback?.error ? (
              <span>{feedback.error}</span>
            ) : feedback ? (
              <span className="font-tabular">
                {t("scan.read")}: {feedback.serial}
              </span>
            ) : (
              t("scan.scanning")
            )}
          </div>
        </div>
      ) : null}

      {photoError ? (
        <p className="text-xs text-destructive">{t("scan.photoError")}</p>
      ) : null}

      {cameraError && !cameraOn ? (
        <p className="text-xs text-destructive">{t("scan.cameraError")}</p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {hint ?? t(cameraSupported ? "scan.hint" : "scan.hintNoCamera")}
      </p>
    </div>
  );
};
