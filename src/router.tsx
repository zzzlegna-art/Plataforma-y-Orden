import { lazy } from "react";
import { Navigate } from "react-router-dom";

import { RequireAuth, RequirePermission } from "./components/auth/require-auth";
import { RequireSupplierReception } from "./components/auth/require-supplier-reception";
import { AppLayout } from "./components/layout/app-layout";
import { useApp } from "./hooks/use-app";
import Login from "./pages/login";
import NotFound from "./pages/NotFound";

// Only load the pages needed for the current route. Keep authentication,
// permission checks and the shared navigation shell available immediately.
const Administracion = lazy(() => import("./pages/administracion"));
const Clientes = lazy(() => import("./pages/clientes"));
const Garantias = lazy(() => import("./pages/garantias"));
const GarantiaDetalle = lazy(() => import("./pages/garantias/detalle"));
const Inventario = lazy(() => import("./pages/inventario"));
const WorkerGlobalInventory = lazy(() =>
  import("./pages/inventario/WorkerGlobalInventory").then(({ WorkerGlobalInventory }) => ({
    default: WorkerGlobalInventory,
  })),
);
const ProductoDetalle = lazy(() => import("./pages/inventario/detalle"));
const Panel = lazy(() => import("./pages/panel"));
const MiSede = lazy(() => import("./pages/mi-sede"));
const Pedidos = lazy(() => import("./pages/pedidos"));
const NuevoPedido = lazy(() => import("./pages/pedidos/nuevo"));
const PedidoDetalle = lazy(() => import("./pages/pedidos/detalle"));
const PedidoHistoricoDetalle = lazy(() => import("./pages/pedidos/historial/detalle"));
const Traslados = lazy(() => import("./pages/traslados"));
const Recepciones = lazy(() => import("./pages/recepcion"));
const InvoiceCapture = lazy(() => import("./pages/recepcion/factura"));
const NuevaRecepcion = lazy(() => import("./pages/recepcion/nueva"));
const TrazabilidadSeriales = lazy(() => import("./pages/trazabilidad"));

const InventoryByRole=({ serials=false }:{serials?:boolean})=>{
  const {role}=useApp();
  return role==="vendedor"||role==="encargado" ? <WorkerGlobalInventory serials={serials}/>
    : serials?<TrazabilidadSeriales/>:<Inventario/>;
};

export const routers = [
  {
    path: "/login",
    name: "login",
    element: <Login />,
  },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            name: "home",
            element: <Navigate to="/panel" replace />,
          },
          {
            path: "panel",
            name: "panel",
            element: <RequirePermission permission="dashboard.view"><Panel /></RequirePermission>,
          },
          {
            path: "mi-sede",
            name: "mi-sede",
            element: <RequirePermission permission="workspace.view"><MiSede /></RequirePermission>,
          },
          {
            path: "recepcion",
            name: "recepciones",
            element: <RequirePermission permission="receptions.manage"><RequireSupplierReception><Recepciones /></RequireSupplierReception></RequirePermission>,
          },
          {
            path: "recepcion/factura",
            name: "factura-asistida",
            element: <RequirePermission permission="receptions.manage"><RequireSupplierReception><InvoiceCapture /></RequireSupplierReception></RequirePermission>,
          },
          {
            path: "recepcion/nueva",
            name: "recepcion-nueva",
            element: <RequirePermission permission="receptions.manage"><RequireSupplierReception><NuevaRecepcion /></RequireSupplierReception></RequirePermission>,
          },
          {
            path: "recepcion/nueva/:receptionId",
            name: "recepcion-captura",
            element: <RequirePermission permission="receptions.manage"><RequireSupplierReception><NuevaRecepcion /></RequireSupplierReception></RequirePermission>,
          },
          {
            path: "traslados",
            name: "traslados",
            element: <RequirePermission permission="transfers.manage"><Traslados /></RequirePermission>,
          },
          {
            path: "inventario",
            name: "inventario",
            element: <RequirePermission permission="inventory.view"><InventoryByRole /></RequirePermission>,
          },
          {
            path: "inventario/:productId",
            name: "inventario-detalle",
            element: <RequirePermission permission="inventory.view"><ProductoDetalle /></RequirePermission>,
          },
          {
            path: "unidades",
            name: "unidades-legacy",
            element: <Navigate to="/seriales" replace />,
          },
          {
            path: "seriales",
            name: "trazabilidad-seriales",
            element: <RequirePermission permission="inventory.view"><InventoryByRole serials /></RequirePermission>,
          },
          {
            path: "liberar",
            name: "liberar-seriales-legacy",
            element: (
              <RequirePermission permission="users.manage">
                <Navigate to="/seriales?view=liberar" replace />
              </RequirePermission>
            ),
          },
          {
            path: "seriales-previos",
            name: "seriales-previos-legacy",
            element: <Navigate to="/seriales?view=previos" replace />,
          },
          {
            path: "pedidos",
            name: "pedidos",
            element: <RequirePermission permission="orders.manage"><Pedidos /></RequirePermission>,
          },
          {
            path: "pedidos/historial/:sourceId",
            name: "pedido-historico-detalle",
            element: <RequirePermission permission="orders.manage"><PedidoHistoricoDetalle /></RequirePermission>,
          },
          {
            path: "pedidos/nuevo",
            name: "pedido-nuevo",
            element: <RequirePermission permission="orders.manage"><NuevoPedido /></RequirePermission>,
          },
          {
            path: "pedidos/:orderId",
            name: "pedido-detalle",
            element: <RequirePermission permission="orders.manage"><PedidoDetalle /></RequirePermission>,
          },
          {
            path: "clientes",
            name: "clientes",
            element: <RequirePermission permission="customers.manage"><Clientes /></RequirePermission>,
          },
          {
            path: "proveedores",
            name: "proveedores-legacy",
            element: (
              <RequirePermission permission="receptions.manage">
                <Navigate to="/administracion?tab=suppliers" replace />
              </RequirePermission>
            ),
          },
          {
            path: "garantias",
            name: "garantias",
            element: <RequirePermission permission="warranties.manage"><Garantias /></RequirePermission>,
          },
          {
            path: "garantias/:warrantyId",
            name: "garantia-detalle",
            element: <RequirePermission permission="warranties.manage"><GarantiaDetalle /></RequirePermission>,
          },
          {
            path: "administracion",
            name: "administracion",
            element: (
              <RequirePermission permission="receptions.manage">
                <Administracion />
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
