import type { Variant } from "./domain";
export type Row = {
  id: string;
  business_id: string;
  branch_id: string;
  [key: string]: string | number | boolean | null;
};
export type Dataset = {
  businesses: Row[];
  branches: Row[];
  memberships: Row[];
  products: Row[];
  product_variants: Row[];
  product_barcodes: Row[];
  branch_inventory: Row[];
  branch_prices: Row[];
  sales: Row[];
  sale_items: Row[];
  payments: Row[];
  stock_transfers: Row[];
  transfer_items: Row[];
  expenses: Row[];
  cash_shifts: Row[];
  inventory_movements: Row[];
  suppliers: Row[];
  purchases: Row[];
  audit_logs: Row[];
  financial: Record<string, number> | null;
  user_id: string;
};
export const emptyData: Dataset = {
  businesses: [],
  branches: [],
  memberships: [],
  products: [],
  product_variants: [],
  product_barcodes: [],
  branch_inventory: [],
  branch_prices: [],
  sales: [],
  sale_items: [],
  payments: [],
  stock_transfers: [],
  transfer_items: [],
  expenses: [],
  cash_shifts: [],
  inventory_movements: [],
  suppliers: [],
  purchases: [],
  audit_logs: [],
  financial: null,
  user_id: "",
};
export function variants(
  data: Dataset,
  business: string,
  branch: string,
): Variant[] {
  return data.product_variants
    .filter((v) => v.business_id === business)
    .map((v) => {
      const p = data.products.find((p) => p.id === v.product_id);
      return {
        id: v.id,
        product_id: String(v.product_id),
        name: String(p?.name ?? "") + (v.name ? " · " + v.name : ""),
        sku: String(v.sku),
        barcode: String(
          data.product_barcodes.find((b) => b.variant_id === v.id)?.barcode ??
            "",
        ),
        price: Number(
          data.branch_prices.find(
            (p) => p.branch_id === branch && p.variant_id === v.id,
          )?.price ?? v.price,
        ),
        min_stock: Number(v.min_stock),
        category: String(p?.category ?? ""),
        image_url: String(p?.image_url ?? ""),
        active: Boolean(p?.active),
      };
    });
}
