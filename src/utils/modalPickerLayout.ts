import type { Category, CategoryType } from '@/types/models';

const MODAL_TOP_INSET_GAP = 16;
const MODAL_MIN_TOP_RESERVE = 24;

export interface DisplayCategoryItem {
  category: Category;
  parentName?: string;
  isSubcategory: boolean;
}

export function computeModalCardMaxHeight(params: {
  windowHeight: number;
  topInset: number;
  keyboardHeight: number;
  variant: 'sheet' | 'center';
}): number {
  const topReserve = Math.max(
    params.topInset + MODAL_TOP_INSET_GAP,
    MODAL_MIN_TOP_RESERVE,
  );
  const available = Math.max(
    220,
    params.windowHeight - topReserve - Math.max(0, params.keyboardHeight),
  );
  const ratio = params.variant === 'center' ? 0.88 : 0.86;
  return Math.max(200, Math.floor(available * ratio));
}

export function buildCategoryPickerItems(params: {
  categories: readonly Category[];
  type: CategoryType;
  selectedId: string | null;
  search: string;
}): DisplayCategoryItem[] {
  const { categories, type, selectedId, search } = params;
  const activeForType = categories.filter(
    (cat) => cat.type === type && (!cat.isArchived || cat.id === selectedId),
  );
  const parentMap = new Map(activeForType.map((c) => [c.id, c]));
  const term = search.trim().toLowerCase();

  if (term.length > 0) {
    return activeForType
      .filter((cat) => {
        const parentName = cat.parentId ? parentMap.get(cat.parentId)?.name ?? '' : '';
        return (
          cat.name.toLowerCase().includes(term) ||
          parentName.toLowerCase().includes(term)
        );
      })
      .map((cat) => ({
        category: cat,
        parentName: cat.parentId ? parentMap.get(cat.parentId)?.name : undefined,
        isSubcategory: Boolean(cat.parentId),
      }));
  }

  const roots = activeForType
    .filter((c) => !c.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const ordered: DisplayCategoryItem[] = [];

  for (const root of roots) {
    ordered.push({ category: root, isSubcategory: false });
    const children = activeForType
      .filter((c) => c.parentId === root.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      ordered.push({
        category: child,
        parentName: root.name,
        isSubcategory: true,
      });
    }
  }

  // Include orphan subcategories whose parent was archived
  const includedIds = new Set(ordered.map((o) => o.category.id));
  for (const cat of activeForType) {
    if (!includedIds.has(cat.id)) {
      ordered.push({
        category: cat,
        parentName: cat.parentId ? parentMap.get(cat.parentId)?.name : undefined,
        isSubcategory: Boolean(cat.parentId),
      });
    }
  }

  return ordered;
}
