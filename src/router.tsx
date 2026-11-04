import { Navigate } from "react-router-dom";

import { RequireAuth, RequirePermission } from "./components/auth/require-auth";
import { AppLayout } from "./components/layout/app-layout";
import Administracion from "./pages/administracion";
import Clientes from "./pages/clientes";
import Garantias from "./pages/garantias";
import GarantiaDetalle from "./pages/garantias/detalle";
import Inventario from "./pages/inventario";
import { WorkerGlobalInventory } from "./pages/inventario/WorkerGlobalInventory";
import { useApp } from "./hooks/use-app";
import ProductoDetalle from "./pages/inventario/detalle";
import Login from "./pages/login";
import NotFound from "./pages/NotFound";
import Panel from "./pages/panel";
import MiSede from "./pages/mi-sede";
import Pedidos from "./pages/pedidos";
import NuevoPedido from "./pages/pedidos/nuevo";
import PedidoDetalle from "./pages/pedidos/detalle";
import Traslados from "./pages/traslados";
import Recepciones from "./pages/recepcion";
import NuevaRecepcion from "./pages/recepcion/nueva";
import TrazabilidadSeriales from "./pages/trazabilidad";

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
            element: <RequirePermission permission="receptions.manage"><Recepciones /></RequirePermission>,
          },
          {
            path: "recepcion/nueva",
            name: "recepcion-nueva",
            element: <RequirePermission permission="receptions.manage"><NuevaRecepcion /></RequirePermission>,
          },
          {
            path: "recepcion/nueva/:receptionId",
            name: "recepcion-captura",
            element: <RequirePermission permission="receptions.manage"><NuevaRecepcion /></RequirePermission>,
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
