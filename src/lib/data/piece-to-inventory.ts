import { NotFoundError } from "@/lib/errors";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCastings } from "@/lib/data/castings";
import { listCostumePieces, setPieceInventoryItem } from "@/lib/data/costume-pieces";
import { createInventoryItem, getInventoryItem, type InventoryItem } from "@/lib/data/inventory-items";
import { listCostumeDesignImages } from "@/lib/data/costume-design-images";
import { addInventoryItemImage } from "@/lib/data/inventory-item-images";
import { copyImage } from "@/lib/storage";

// Create a House Inventory item from one performer's costume piece (make/purchase).
// Copies the design's photos and notes; links the piece so it's idempotent.
export async function addPieceToInventory(
  orgId: string,
  productionId: string,
  designId: string,
  castingId: string,
): Promise<{ item: InventoryItem; addedInventoryItemId: string }> {
  const [designs, castings, pieces] = await Promise.all([
    listCostumeDesigns(productionId),
    listCastings(productionId),
    listCostumePieces([designId]),
  ]);

  const design = designs.find((d) => d.id === designId);
  if (!design) throw new NotFoundError("Costume design not found");
  const casting = castings.find((c) => c.id === castingId);
  if (!casting) throw new NotFoundError("Casting not found");

  const piece = pieces.find((p) => p.casting_id === castingId);
  if (piece?.added_inventory_item_id) {
    const item = await getInventoryItem(orgId, piece.added_inventory_item_id);
    return { item, addedInventoryItemId: piece.added_inventory_item_id };
  }

  // The item is named for the garment only (no performer); provenance (which
  // production + role it was made for) is shown in House Inventory via the link.
  const item = await createInventoryItem(orgId, { name: design.name, notes: design.notes, quantity: 1 });

  // Link the piece before copying photos: if a photo copy then fails, the link is
  // already set, so a retry is caught by the idempotency check above (returns this
  // item) rather than creating a duplicate. Worst case is a missing photo, not a dupe.
  await setPieceInventoryItem(designId, castingId, item.id);

  const images = await listCostumeDesignImages(designId);
  for (const img of images) {
    const toPath = `inventory/${item.id}/${crypto.randomUUID()}.jpg`;
    await copyImage(img.storage_path, toPath);
    await addInventoryItemImage(item.id, toPath);
  }

  return { item, addedInventoryItemId: item.id };
}
