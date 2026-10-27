/**
 * SKU comerciales legibles y estables. La clave interna de cada referencia
 * sigue siendo su ID (no la SKU), así que los movimientos nunca dependen de
 * abreviaturas cambiantes.
 */
export interface SkuDescriptor {
  name: string;
  categoria?: string;
  marca?: string;
}

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const familyCodes: Record<string, string> = {
  consola: "CONS", consolas: "CONS", videojuegos: "JUE", videojuego: "JUE",
  juegos: "JUE", juego: "JUE", gaming: "GAM", accesorios: "ACC",
  accesorio: "ACC", computador: "PC", computadores: "PC",
  portatil: "PORT", portatiles: "PORT", laptop: "PORT", laptops: "PORT",
  monitor: "MON", monitores: "MON", televisor: "TV", televisores: "TV",
  parlante: "PARLANTE", parlantes: "PARLANTES",
  impresora: "IMP", impresoras: "IMP",
  router: "ROU", routers: "ROU", cargador: "CAR", cargadores: "CAR",
};

const compact = (components: string[]) => components.filter(Boolean).join("-");

const capacity = (normal: string): string => {
  const m = normal.match(/\b(\d{1,4})\s*(TB|TA|GB|MB)\b/);
  if (!m) return "";
  return m[1] + (m[2] === "TB" || m[2] === "TA" ? "T" : m[2] === "MB" ? "M" : "");
};

const model = (normal: string): string => {
  const iphone = normal.match(/\bIPHONE\s*(SE(?:\s*\d{4})?|XR|XS|X|\d{1,2})(?:\s*G)?\b/);
  if (iphone) {
    const base = "IP" + iphone[1].replace(/\s/g, "");
    const after = normal.slice((iphone.index ?? 0) + iphone[0].length);
    // No aplicar 'Pro' del segundo equipo de una batería compartida.
    if (/^(\s+(?:PRO\s+MAX|PRO|PLUS|MINI|AIR|MAX))\b/.test(after)) {
      if (/^\s+PRO\s+MAX\b/.test(after)) return base + "PM";
      if (/^\s+PRO\b/.test(after)) return base + "P";
      if (/^\s+PLUS\b/.test(after)) return base + "PL";
      if (/^\s+MINI\b/.test(after)) return base + "MN";
      if (/^\s+AIR\b/.test(after)) return base + "A";
      if (/^\s+MAX\b/.test(after)) return base + "M";
    }
    return base;
  }
  const galaxyZ = normal.match(/\bZ\s*(FOLD|FLIP)\s*(\d)\b/);
  if (galaxyZ) return "Z" + (galaxyZ[1] === "FOLD" ? "F" : "FL") + galaxyZ[2];
  const galaxyS = normal.match(/\bS\s*(\d{1,2})\b/);
  if (galaxyS) return "S" + galaxyS[1] +
    (/\bULTRA\b/.test(normal) ? "U" : /\bFE\b/.test(normal) ? "FE" : /\bPLUS\b/.test(normal) ? "P" : "");
  const galaxyA = normal.match(/\bA\s*(\d{1,2})\b/);
  if (galaxyA) return "A" + galaxyA[1];
  const pixel = normal.match(/\bPIXEL\s*(\d{1,2})\b/);
  if (pixel) return "PX" + pixel[1] + (/\bPRO\b/.test(normal) ? "P" : "") + (/\bXL\b/.test(normal) ? "XL" : "");
  const redmi = normal.match(/\bNOTE\s*(\d{1,2})\b/);
  if (redmi) return "RN" + redmi[1] + (/\bPRO\b/.test(normal) ? "P" : "");
  const ipad = normal.match(/\bIPAD\s+(A\d{1,2}|M\d{1,2})\b/);
  if (ipad) return ipad[1];
  const watch = normal.match(/\bWATCH\s+(?:SERIE|SERIES)\s*(\d{1,2})\s*(\d{2})?\b/);
  if (watch) return "WASE" + watch[1] + (watch[2] ? "-" + watch[2] : "");
  const airpods = normal.match(/\bAIRPODS?\s*(\d{1,2})\b/);
  if (airpods) return "AI" + airpods[1];
  const ps = normal.match(/\b(?:PLAYSTATION|PS)\s*(\d{1,2})\b/);
  if (ps) return "PS" + ps[1];
  const xbox = normal.match(/\bXBOX\s*(SERIES\s*)?(X|S|\d{3,4})\b/);
  if (xbox) return "XB" + xbox[2];
  const switchModel = normal.match(/\bSWITCH(?:\s*(OLED|LITE|\d))?\b/);
  if (switchModel) return "SW" + (switchModel[1] === "OLED" ? "OL" : switchModel[1] === "LITE" ? "LI" : switchModel[1] ?? "");
  return "";
};

const partCode = (normal: string): string =>
  /\b(BATERIA|BATERIAS|PILA)\b/.test(normal) ? "BAT" :
  /\b(PANTALLA|DISPLAY|DISPAY|MODULO|TACTIL)\b/.test(normal) ? "PAN" :
  /\b(CAMARA|CAMARAS)\b/.test(normal) ? "CAM" :
  /\b(TAPA|CARCASA)\b/.test(normal) ? "TAP" :
  /\b(CONECTOR|PUERTO)\b/.test(normal) ? "CON" :
  /\bFLEX\b/.test(normal) ? "FLE" :
  /\b(CARGADOR|CARGA)\b/.test(normal) ? "CAR" :
  /\b(ALTAVOZ|PARLANTE|BUZZER)\b/.test(normal) ? "ALT" :
  /\bMICROFONO\b/.test(normal) ? "MIC" : "REP";

const partBrand = (normal: string, marca = "") => {
  const brands: Array<[RegExp, string]> = [
    [/\bSUNLONG\b/, "SUN"], [/\bJK\b/, "JK"], [/\bOEM\b/, "OEM"],
    [/\bORIGINAL\b/, "ORI"], [/\bGENERICO|GENERICA\b/, "GEN"],
    [/\bFOXCONN\b/, "FOX"], [/\bBOE\b/, "BOE"],
  ];
  for (const [pattern, code] of brands) {
    if (pattern.test(normal)) return code;
  }
  const n = normalize(marca);
  // Apple o Samsung es el fabricante del teléfono compatible, no
  // necesariamente el fabricante del display/batería.
  if (!n || ["APPLE", "SAMSUNG", "XIAOMI", "MOTOROLA", "GOOGLE"].includes(n)) return "";
  return brands.find(([pattern]) => pattern.test(n))?.[1] ??
    n.replace(/\s/g, "").slice(0, 5);
};

const genericTokens = (normal: string, categoria: string, modelo = "") => {
  const forbidden = new Set([
    "DE", "DEL", "LA", "EL", "PARA", "CON", "SIN", "Y", "EN",
    "GB", "TB", "TA", "MB", "APPLE", "SAMSUNG", "GALAXY",
    "PLAYSTATION", "PS4", "PS5", "VIDEOJUEGO", "VIDEOJUEGOS",
    "JUEGO", "JUEGOS", "CONSOLA", "CONSOLAS", "XBOX",
    "ACCESORIO", "ACCESORIOS", "PARLANTE", "PARLANTES", "IPHONE",
    "IPAD", "WATCH", "SERIE", "AIRPODS", "SWITCH",
  ]);
  categoria.split(/[^A-Z0-9]+/).forEach((token) => forbidden.add(token));
  if (modelo) forbidden.add(modelo);
  const tokens = normal.split(" ").filter((token) => !forbidden.has(token) &&
    !/^\d+(?:GB|TB|MB)$/.test(token));
  return tokens.slice(0, modelo ? 3 : 4).join("").slice(0, 18);
};

/** SKU base sin sufijo de colisión, máximo 35 caracteres. */
export const skuBaseReferencia = ({ name, categoria, marca }: SkuDescriptor): string => {
  const n = normalize(name);
  if (!n) return "";
  const tipo = normalize(categoria ?? "");
  const device = model(n);
  const cap = capacity(n);

  if (tipo === "REPUESTO" || tipo === "REPUESTOS") {
    const part = partCode(n);
    const brand = partBrand(n, marca);
    const shared = n.match(/\bIPHONE\s*(\d{1,2})\s+(?:Y\s+)?\1\s+PRO(?:\s+MAX)?\b/);
    const compat = shared
      ? "IP" + shared[1] + "-" + shared[1] + (/\bPRO MAX\b/.test(shared[0]) ? "PM" : "P")
      : device || genericTokens(n, tipo);
    const flex = part === "BAT"
      ? (/\b(SIN|NO)\s+FLEX\b/.test(n) ? "SF" : /\bFLEX\b/.test(n) ? "CF" : "")
      : "";
    const screenType = part === "PAN"
      ? (/\bOLED\b/.test(n) ? "OLED" : /\bINCELL\b/.test(n) ? "INC" : /\bLCD\b/.test(n) ? "LCD" : "")
      : "";
    return compact([part, brand, compat, flex || screenType]).slice(0, 35);
  }

  if (["", "CELULAR", "TABLET", "RELOJ", "AUDIFONO"].includes(tipo)) {
    if (device) return compact([device, cap]).slice(0, 35);
    // Compatibilidad: WASE11-42, AI4, A16-128.
    const words = n.replace(/\b\d{1,4}\s*(GB|TB|TA|MB)\b/g, " ").split(" ")
      .filter((token) => token && !["APPLE","SAMSUNG","GALAXY","XIAOMI","REDMI","GOOGLE","HUAWEI","MOTOROLA","OPPO","VIVO","REALME","ONEPLUS"].includes(token));
    const numbered = words.find((t) => /\d/.test(t));
    return compact([((words.filter(x=>x!==numbered).slice(0,2).map(x=>x.slice(0,2)).join("") + (numbered ?? "")) || "PROD").slice(0, 12), cap]);
  }

  const family = familyCodes[tipo.toLowerCase()] ?? tipo.replace(/[^A-Z0-9]/g, "").slice(0, 10) || "OTR";
  const suffix = /\bSLIM\b/.test(n) ? "SL" : /\bPRO\b/.test(n) && !device.endsWith("P") ? "PRO" : "";
  const generic = genericTokens(n, tipo, device);
  const brand = marca && !n.includes(normalize(marca))
    ? normalize(marca).replace(/\s/g, "").slice(0, 8)
    : "";
  const content = compact([family, brand, device, generic, suffix, cap]);
  return (content || family + "-PROD").slice(0, 35);
};
