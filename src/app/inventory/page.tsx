import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { listInventoryItems } from "@/lib/data/inventory-items";
import { InventoryManager } from "@/components/InventoryManager";

export default async function InventoryPage() {
  const { orgId } = await getAuthContext();
  const items = await listInventoryItems(orgId);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6">
        <h1 className="font-display text-3xl font-semibold">Inventory</h1>
        <p className="mt-1 text-sm muted">
          Your on-hand costume library. Photograph items here, then add them to a role from the Costume tab.
        </p>
      </div>
      <InventoryManager
        initialItems={items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          size: i.size,
          quantity: i.quantity,
          location: i.location,
          notes: i.notes,
        }))}
      />
    </main>
  );
}
