// Sortieren & Filtern der 2do-Liste – gemeinsam für Web-Dashboard und Desktop.

export const defaultFilters = { statuses: [], prios: [], categories: [], showArchived: false, wiedervorlageFilter: "", onlyFavorites: false };

export const todoTags = (t) => t.tags || (t.category ? [t.category] : []);

export const toDate = (v) => {
  if (!v) return null;
  const d = v.toDate ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export function sortTodos(todos, sortBy) {
  const [field, dir] = sortBy.split("_");
  const asc = dir === "asc";
  return [...todos].sort((a, b) => {
    let va, vb;
    if (field === "title") { va = (a.title || "").toLowerCase(); vb = (b.title || "").toLowerCase(); }
    else if (field === "prio") { const order = { A: 0, B: 1, C: 2 }; va = order[a.prio] ?? 1; vb = order[b.prio] ?? 1; }
    else if (field === "status") { va = a.status || ""; vb = b.status || ""; }
    else {
      const toMs = (v) => v ? (v.toDate ? v.toDate().getTime() : new Date(v).getTime()) : (asc ? Infinity : -Infinity);
      va = toMs(a[field]); vb = toMs(b[field]);
    }
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });
}

export function applyWiedervorlageFilter(todos, wFilter) {
  if (!wFilter) return todos;
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  return todos.filter((t) => {
    if (!t.wiedervorlage) return true; // no wiedervorlage → always show
    const d = t.wiedervorlage.toDate ? t.wiedervorlage.toDate() : new Date(t.wiedervorlage);
    if (wFilter === "hide_future") return d <= todayEnd; // nur heute oder vergangen anzeigen
    if (wFilter === "only_today") { const dd = new Date(d); dd.setHours(0,0,0,0); return dd.getTime() === todayStart.getTime(); }
    if (wFilter === "only_past") return d < todayStart;
    return true;
  });
}

// Filter + Suche + Sortierung. searchAll: bei aktiver Suche alle Filter
// ignorieren und auch Archiviertes durchsuchen.
export function filterTodos(todos, { filters = defaultFilters, search = "", searchAll = false, sortBy = "createdAt_desc" } = {}) {
  let result = todos;
  if (search.trim() && searchAll) {
    // keine Filter – alles durchsuchen
  } else {
    if (!filters.showArchived) result = result.filter((t) => !t.archived);
    else result = result.filter((t) => t.archived);
    if (filters.onlyFavorites) result = result.filter((t) => t.favorite);
    if (filters.statuses?.length) result = result.filter((t) => filters.statuses.includes(t.status));
    if (filters.prios?.length) result = result.filter((t) => filters.prios.includes(t.prio));
    if (filters.categories?.length) result = result.filter((t) => {
      const tags = todoTags(t);
      return filters.categories.some((fc) =>
        fc === "__no_tag__" ? tags.length === 0 : tags.includes(fc)
      );
    });
    result = applyWiedervorlageFilter(result, filters.wiedervorlageFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter((t) =>
      t.title?.toLowerCase().includes(q) ||
      (t.manualStatus || "").toLowerCase().includes(q) ||
      (t.description || "").replace(/<[^>]+>/g, "").toLowerCase().includes(q));
  }
  return sortTodos(result, sortBy);
}
