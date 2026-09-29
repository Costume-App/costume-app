export interface InventoryRow {
  id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
  /** Signed URL of the item's first photo; null/absent when it has none. */
  photoUrl?: string | null;
}

export interface CategoryGroup {
  /** Normalized key used for collapse state; "" for uncategorized. */
  key: string;
  /** Display label: first-seen casing of the category, or "Uncategorized". */
  label: string;
  items: InventoryRow[];
}

/**
 * Holds one item at the category and name it had when its editor opened, so
 * editing either field doesn't move (and remount) the open editor mid-edit.
 */
export interface GroupPin {
  id: string;
  category: string | null;
  name: string;
}

const UNCATEGORIZED_KEY = "";
const UNCATEGORIZED_LABEL = "Uncategorized";


const normalizeCategory = (category: string | null): string =>
  (category ?? "").trim().toLowerCase();

export function filterItemsByName(items: InventoryRow[], query: string): InventoryRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}

export function groupItemsByCategory(items: InventoryRow[], pin?: GroupPin | null): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();
  const sortName = (item: InventoryRow) => (pin && item.id === pin.id ? pin.name : item.name);
  for (const item of items) {
    const category = pin && item.id === pin.id ? pin.category : item.category;
    const key = normalizeCategory(category);
    let group = groups.get(key);
    if (!group) {
      const label = key === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : (category ?? "").trim();
      group = { key, label, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  const byNameCI = (a: InventoryRow, b: InventoryRow) =>
    sortName(a).localeCompare(sortName(b), undefined, { sensitivity: "base" });
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.key === UNCATEGORIZED_KEY) return 1;
    if (b.key === UNCATEGORIZED_KEY) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
  for (const group of ordered) group.items.sort(byNameCI);
  return ordered;
}

export function uniqueCategories(items: InventoryRow[]): string[] {
  const seen = new Map<string, string>(); // normalized -> first-seen display
  for (const item of items) {
    const display = (item.category ?? "").trim();
    const key = normalizeCategory(item.category);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, display);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

// Attach each item's first-photo signed URL. The caller batches the lookups
// (one firstImagePaths + one signImageUrls call for the whole list).
export function attachInventoryPhotoUrls(
  items: InventoryRow[],
  pathsById: Record<string, string>,
  urlsByPath: Record<string, string>,
): InventoryRow[] {
  return items.map((item) => {
    const path = pathsById[item.id];
    return { ...item, photoUrl: (path && urlsByPath[path]) || null };
  });
}
