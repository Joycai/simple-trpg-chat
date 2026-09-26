// Unread = freshly received OR edited-since-viewed. `updated` distinguishes the two
// so the backpack can flag a host edit differently from a brand-new hand-off.
const isUnread = (d: { viewed?: boolean | number | null }) => d.viewed === false || d.viewed === 0;
export const isUpdated = (d: { updated?: boolean | number | null }) => d.updated === true || d.updated === 1;
export const isNew = (d: { viewed?: boolean | number | null; updated?: boolean | number | null }) => isUnread(d) && !isUpdated(d);
