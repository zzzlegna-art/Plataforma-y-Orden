import { Navigate } from "react-router-dom";

import { RequireAuth, RequirePermission } from "./components/auth/require-auth";
import { AppLayout } from "./components/layout/app-layout";
import Administracion from "./pages/administracion";
import Clientes from "./pages/clientes";
import Garantias from "./pages/garantias";
import GarantiaDetalle from "./pages/garantias/detalle";
import Inventario from "./pages/inventario";
import ProductoDetalle from "./pages/inventario/detalle";
import Login from "./pages/login";
import NotFound from "./pages/NotFound";
import Panel from "./pages/panel";
import Pedidos from "./pages/pedidos";
import NuevoPedido from "./pages/pedidos/nuevo";
import PedidoDetalle from "./pages/pedidos/detalle";
import Recepciones from "./pages/recepcion";
import NuevaRecepcion from "./pages/recepcion/nueva";
import TrazabilidadSeriales from "./pages/trazabilidad";

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
            element: <Panel />,
          },
          {
            path: "recepcion",
            name: "recepciones",
            element: <Recepciones />,
          },
          {
            path: "recepcion/nueva",
            name: "recepcion-nueva",
            element: <NuevaRecepcion />,
          },
          {
            path: "recepcion/nueva/:receptionId",
            name: "recepcion-captura",
            element: <NuevaRecepcion />,
          },
          {
            path: "inventario",
            name: "inventario",
            element: <Inventario />,
          },
          {
            path: "inventario/:productId",
            name: "inventario-detalle",
            element: <ProductoDetalle />,
          },
          {
            path: "unidades",
            name: "unidades-legacy",
            element: <Navigate to="/seriales" replace />,
          },
          {
            path: "seriales",
            name: "trazabilidad-seriales",
            element: <TrazabilidadSeriales />,
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
            element: <Pedidos />,
          },
          {
            path: "pedidos/nuevo",
            name: "pedido-nuevo",
            element: <NuevoPedido />,
          },
          {
            path: "pedidos/:orderId",
            name: "pedido-detalle",
            element: <PedidoDetalle />,
          },
          {
            path: "clientes",
            name: "clientes",
            element: <Clientes />,
          },
          {
            path: "garantias",
            name: "garantias",
            element: <Garantias />,
          },
          {
            path: "garantias/:warrantyId",
            name: "garantia-detalle",
            element: <GarantiaDetalle />,
          },
          {
            path: "administracion",
            name: "administracion",
            element: (
              <RequirePermission permission="users.manage">
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
