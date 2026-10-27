/** Directorio de proveedores de compra: separado de los clientes de venta. */
// Importar el cliente solo al consultar/guardar: evita inicializar credenciales
// al abrir formularios en pruebas y mantiene el módulo de interfaz independiente.
const getClient = async () => (await import("@/integrations/supabase/client")).supabase;

export interface Supplier {
  id: string;
  name: string;
  taxId?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
}

export type SupplierInput = Omit<Supplier, "id" | "createdAt">;
type SupplierRow = {
  id: string; name: string; tax_id: string | null; contact_name: string | null;
  phone: string | null; email: string | null; address: string | null;
  notes: string | null; is_active: boolean; created_at: string | null;
};

const read = (row: SupplierRow): Supplier => ({
  id: row.id,
  name: row.name,
  taxId: row.tax_id ?? undefined,
  contactName: row.contact_name ?? undefined,
  phone: row.phone ?? undefined,
  email: row.email ?? undefined,
  address: row.address ?? undefined,
  notes: row.notes ?? undefined,
  isActive: row.is_active,
  createdAt: row.created_at ?? undefined,
});

export const listSuppliers = async (): Promise<Supplier[]> => {
  const client = await getClient();
  const { data, error } = await client.from("suppliers").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(read);
};

export const saveSupplier = async (input: SupplierInput, id?: string): Promise<Supplier> => {
  const name = input.name.trim();
  if (!name) throw new Error("El nombre del proveedor es obligatorio.");
  const clean = (value?: string) => value?.trim() || null;
  const payload = {
    name, tax_id: clean(input.taxId), contact_name: clean(input.contactName),
    phone: clean(input.phone), email: clean(input.email),
    address: clean(input.address), notes: clean(input.notes),
    is_active: input.isActive, updated_at: new Date().toISOString(),
  };
  const client = await getClient();
  const query = id
    ? client.from("suppliers").update(payload).eq("id", id)
    : client.from("suppliers").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return read(data);
};

export const setSupplierActive = async (supplier: Supplier, isActive: boolean) =>
  saveSupplier({ ...supplier, isActive }, supplier.id);
