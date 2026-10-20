import { createRoot } from "react-dom/client";
import "./i18n/config";
// Se importa antes que App para capturar "beforeinstallprompt" desde el
// primer instante, sin depender de que algún componente ya esté montado.
import "./lib/pwa";
import App from "./App.tsx";
import "./index.css";
import "./responsive-scale.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

createRoot(container).render(<App />);
