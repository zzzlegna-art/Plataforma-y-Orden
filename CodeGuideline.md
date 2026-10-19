# Code Guideline

## Project Structure Overview

```
project-root/
  ├── i18n.config.json       # i18n manifest (single locale: es)
  ├── public/
  │   ├── icons/             # PWA icons (png generados desde icon.svg)
  │   ├── locales/           # public/locales/{code}.json translation files
  │   ├── manifest.webmanifest
  │   └── sw.js              # service worker mínimo (instalación PWA)
  ├── src/
  │   ├── components/        # All reusable UI components
  │   │   ├── auth/          # RequireAuth / RequirePermission
  │   │   ├── layout/        # AppLayout, SidebarNav, Topbar, MobileTabBar, nav-items
  │   │   ├── shared/        # DataTable, PageHeader, StatCard, StatusBadge, SerialScanInput…
  │   │   └── ui/            # Prebuilt shadcn/ui building blocks
  │   ├── hooks/             # Una responsabilidad por archivo (use-store, use-auth…)
  │   ├── lib/
  │   │   ├── actions/       # Acciones de dominio (escrituras) por módulo
  │   │   ├── types.ts       # Tipos del dominio (= forma de las tablas futuras)
  │   │   ├── backend.ts     # Lectura/escritura contra Supabase (pullDb/pushDb) y tiempo real
  │   │   ├── db.ts          # Modelo en memoria, DomainError, bitácora y movimientos
  │   │   ├── selectors.ts   # Datos derivados que consumen las páginas
  │   │   ├── permissions.ts # Matriz de permisos por rol
  │   │   ├── format.ts      # Moneda, números y fechas en es-MX
  │   │   └── pwa.ts         # Registro del service worker
  │   ├── store/             # Contexto raíz: datos, sesión y ejecución de acciones
  │   ├── pages/             # Application pages (cada página en su subdirectorio)
  │   ├── App.tsx            # Providers globales
  │   ├── router.tsx         # Router config
  │   └── index.css          # Design tokens y estilos globales
  ├── package.json
  ├── tailwind.config.ts
  └── ...
```

> Backend-handoff temporary files (`scripts/`, `i18n.scan.json`, `reports/i18n/`, `docs/i18n-*.md`) are kept in the repo only until backend integration of i18n statistics/scan/auto-translate is complete. They are owned by the backend long-term and will be removed once integration lands. Treat them as read-only handoff copies — do not extend them.

## Arquitectura de datos (Supabase)

El inventario vive en Supabase (Postgres + Auth + RLS + Realtime). La app carga el
inventario completo en memoria al iniciar sesión y trabaja sobre ese modelo; cada
acción sube solo las filas que cambiaron.

- **`src/lib/types.ts`** define las entidades (productos, unidades con serial/IMEI,
  recepciones, pedidos, garantías, movimientos y bitácora).
- **`src/lib/backend.ts`** traduce entre el modelo del dominio y las tablas `nexora_*`.
  `pullDb` lee todo con orden estable y **falla entera si una tabla no se puede leer**
  (nunca se trabaja con un inventario incompleto). `pushDb` compara dos versiones y
  sube solo las diferencias. Los cambios de otros dispositivos llegan por Realtime.
- **`src/lib/actions/*`** son funciones puras
  `(db: Db, actor: Actor, input) => resultado` que mutan el borrador y lanzan
  `DomainError` con una clave de traducción cuando la regla de negocio falla.
  Nunca hablan con el servidor: de eso se encarga el store.
- **`src/store/app-provider.tsx`** mantiene la sesión y expone `run`, que clona la base,
  ejecuta la acción y, si no hubo error, sube los cambios. Si el guardado falla, vuelve
  a descargar la versión del servidor.
- **`src/hooks/use-run-action.ts`** envuelve `run` y traduce `DomainError` a un toast.
  Es la vía por la que las páginas escriben.
- **`src/lib/selectors.ts`** concentra los datos derivados (stock por producto, KPIs,
  vistas de pedido/garantía) para que las páginas solo pinten. `getMovementRows` asume
  que `db.movements` llega con lo más reciente primero (por eso `pullDb` lo ordena así).
- **Invariantes de stock**: una unidad `vendido` no se cambia a mano (se libera o
  cancela el pedido); `en_reparacion`/`entregado_garantia` solo los resuelve la garantía;
  los seriales activos son únicos (índice único parcial en la base).
- **Límites conocidos**: las reglas de negocio se validan en el navegador y la base no las
  repite; el guardado no es transaccional entre tablas; y se cargan como máximo 20.000
  filas por tabla. Ver el PR de endurecimiento para la ruta de mejora (funciones RPC
  transaccionales en Postgres).
- **Migraciones**: `supabase/migrations/*.sql`. Todo cambio de esquema, permisos o RLS
  debe quedar aquí; no se hacen cambios manuales solo en el panel.

## Directory Responsibilities

- **public/**: Static files served directly. Los iconos PWA y `sw.js` se publican tal cual.
- **public/locales/**: Translation files, one per language (`{code}.json`). Flat dotted keys (e.g. `order.title`); el archivo de `fallbackLng` es la fuente estructural.
- **i18n.config.json**: The lightweight i18n manifest for fallback language, language labels, browser detection aliases, and document direction. Single source of truth for the language list.
- **src/components/**: All UI components.  
  - **ui/**: Contains atomic and composite UI components.  
  - **shared/**: componentes de producto reutilizables (tabla responsive, badges de estado, escáner de seriales).  
  - **layout/** y **auth/**: armazón de la aplicación y guardas de ruta.
- **src/hooks/**: Custom React hooks. Each file should export a single hook focused on one responsibility.
- **src/lib/**: utilidades y capa de dominio (acciones, selectores, permisos, formato).
- **src/store/**: único contexto raíz; ningún componente lee `localStorage` directamente.
- **src/pages/**: All route-level pages.  
  - *Cada página tiene su subdirectorio; los componentes y formularios exclusivos de la página viven ahí mismo.*
- **src/App.tsx**: Sets up global providers.
- **src/router.tsx**: Sets up routing.
- **src/index.css**: design tokens (colores semánticos, gráficos, sidebar, gradientes).

**Important:**
Whenever a new module (such as a component, hook, or utility) or a new page is added or removed, this document **must be updated immediately** to reflect the changes.

## How to Add New Code

### 1. Adding a New Page

- **Crea un subdirectorio bajo `src/pages/`** (ej. `src/pages/reportes/`).
- **El componente principal es `index.tsx`** dentro del subdirectorio.
- **Registra la ruta en `src/router.tsx`** dentro del layout protegido y con un `name` semántico:
  ```tsx
  {
    path: "reportes",
    name: "reportes",
    element: <Reportes />,
  }
  ```
- Si la página es solo para administradores, envuélvela con `RequirePermission permission="users.manage"` y añade su entrada en `src/components/layout/nav-items.ts` con el permiso correspondiente.

### 2. Adding a New Component

- **Si es un grupo de componentes relacionados, crea un subdirectorio** (ej. `form/`, `charts/`).
- **Si solo lo usa una página, colócalo en el subdirectorio de esa página** (ej. `src/pages/pedidos/OrderFormDialog.tsx`).
- **Cada componente debe tener una sola responsabilidad** y usar los tokens del design system (nunca colores fijos como `text-white`/`bg-black`).

### 3. Adding a New Hook

- **Crea el archivo en `src/hooks/` con el nombre del hook** (ej. `use-stock-alerts.ts`) y exporta un único hook.

### 4. Adding a New Domain Action

- **Añádela en `src/lib/actions/<módulo>.ts`** con la firma `(db, actor, input) => resultado`.
- **Valida con los helpers de `./guards`** (`requirePermission`, `requireText`, `requireNumber`) y lanza `DomainError` con una clave de traducción nueva en `public/locales/es.json`.
- **Registra el rastro**: `logAudit` para la bitácora y, si cambia el stock, `logMovement`.
- **Ejecútala desde la página con `useRunAction`**, que ya muestra el error o el mensaje de éxito.

### 5. Adding or Updating Languages

- **Language metadata must go through `i18n.config.json`.**
- **Do not hardcode supported languages, labels, browser detection aliases, or RTL direction lists in `src/i18n/*.ts`.**
- **Locale content lives in `public/locales/{code}.json`** as flat dotted-key JSON; el archivo de `fallbackLng` (`es`) es el conjunto canónico de claves.
- **Runtime code reads the manifest only through `src/i18n/util.ts`.** Adding or removing a language means editing `i18n.config.json` plus the matching `public/locales/{code}.json`; nothing in `src/i18n/` needs to change.
- **Translations are read with the official `useTranslation()` from `react-i18next`.** No custom hook, no cast at call sites.

## Coding Best Practices

- **One module, one responsibility:**  
  Each file (component, hook, utility) should do one thing only.
- **High cohesion, low coupling:**  
  Keep related logic together and avoid unnecessary dependencies between modules.
- **Naming conventions:**  
  - Use `PascalCase` for componentes y archivos de componente; `kebab-case` para hooks y utilidades.
  - Name page subdirectories and files after their route or feature.
- **Component structure:**  
  Keep components small and focused; extrae subcomponentes si el archivo crece.
- **Responsive obligatorio:** tablas en escritorio y tarjetas en móvil (`DataTable`), navegación por sidebar en escritorio y tab bar en móvil. Sin scroll horizontal en 360–390 px.
- **Accessibility:** etiqueta los controles (`Label`, `aria-label`) y mantén contraste suficiente en tema claro y oscuro.
- **Documentation:**  
  Add comments for complex logic and document the purpose of each module at the top of the file when it is not obvious.
