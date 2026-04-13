type FocusableSubItem = {
  id: string;
  muted: boolean;
};

type FocusableItem<TSubItem extends FocusableSubItem = FocusableSubItem> = {
  id: string;
  muted: boolean;
  subItems: TSubItem[];
};

function unmuteAll<TItem extends FocusableItem>(items: TItem[]): TItem[] {
  return items.map((item) => ({
    ...item,
    muted: false,
    subItems: item.subItems.map((subItem) => ({
      ...subItem,
      muted: false,
    })),
  })) as TItem[];
}

export function isItemSoloActive<TItem extends FocusableItem>(items: TItem[], itemId: string): boolean {
  if (items.length <= 1) {
    return false;
  }

  let found = false;

  const matches = items.every((item) => {
    if (item.id === itemId) {
      found = true;
      return !item.muted && item.subItems.every((subItem) => !subItem.muted);
    }

    return item.muted && item.subItems.every((subItem) => subItem.muted);
  });

  return found && matches;
}

export function isSubItemSoloActive<TItem extends FocusableItem>(items: TItem[], subItemId: string): boolean {
  const totalSubItems = items.reduce((count, item) => count + item.subItems.length, 0);
  if (totalSubItems <= 1) {
    return false;
  }

  let found = false;

  const matches = items.every((item) => {
    const hasTarget = item.subItems.some((subItem) => subItem.id === subItemId);

    if (hasTarget) {
      found = true;
      return (
        !item.muted &&
        item.subItems.every((subItem) => (subItem.id === subItemId ? !subItem.muted : subItem.muted))
      );
    }

    return item.muted && item.subItems.every((subItem) => subItem.muted);
  });

  return found && matches;
}

export function applyItemSolo<TItem extends FocusableItem>(items: TItem[], itemId: string): TItem[] {
  if (isItemSoloActive(items, itemId)) {
    return unmuteAll(items);
  }

  return items.map((item) => ({
    ...item,
    muted: item.id !== itemId,
    subItems: item.subItems.map((subItem) => ({
      ...subItem,
      muted: item.id !== itemId,
    })),
  })) as TItem[];
}

export function applySubItemSolo<TItem extends FocusableItem>(items: TItem[], subItemId: string): TItem[] {
  if (isSubItemSoloActive(items, subItemId)) {
    return unmuteAll(items);
  }

  return items.map((item) => {
    const hasTarget = item.subItems.some((subItem) => subItem.id === subItemId);

    return {
      ...item,
      muted: !hasTarget,
      subItems: item.subItems.map((subItem) => ({
        ...subItem,
        muted: hasTarget ? subItem.id !== subItemId : true,
      })),
    };
  }) as TItem[];
}
