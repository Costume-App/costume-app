import { getAuthContext } from "@/lib/auth-context";
import { listInventoryItems } from "@/lib/data/inventory-items";
import { firstImagePaths } from "@/lib/data/inventory-item-images";
import { signImageUrls } from "@/lib/storage";
import { attachInventoryPhotoUrls } from "@/lib/inventory-grouping";
import { InventoryManager } from "@/components/InventoryManager";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { item: focusItemId } = await searchParams;
  const items = await listInventoryItems(orgId);
  const pathsById = await firstImagePaths(items.map((i) => i.id));
  const urlsByPath = await signImageUrls(Object.values(pathsById));
  const rows = attachInventoryPhotoUrls(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      size: i.size,
      quantity: i.quantity,
      location: i.location,
      notes: i.notes,
    })),
    pathsById,
    urlsByPath,
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">House Inventory</h1>
        <p className="mt-1 text-sm muted">
          Your on-hand costume library. Photograph items here, then add them to a role from the Costume tab.
        </p>
      </div>
      <InventoryManager focusItemId={focusItemId} initialItems={rows} />
    </main>
  );
}
