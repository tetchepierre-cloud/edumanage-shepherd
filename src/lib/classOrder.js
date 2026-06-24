export const CLASS_ORDER = [
  'Creche',
  'Nursery 1', 'Nursery 2',
  'KG 1', 'KG 2',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JHS 1', 'JHS 2', 'JHS 3'
];

export function sortClasses(classes) {
  return [...classes].sort((a, b) => {
    const idxA = CLASS_ORDER.indexOf(a.name);
    const idxB = CLASS_ORDER.indexOf(b.name);
    if (idxA === -1 && idxB === -1) return a.name.localeCompare(b.name);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });
}