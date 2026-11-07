// Pure search logic for the command palette: tokenised, word-start matching with one-typo tolerance.
// Entries: { id, label, page, area?, keywords?: string[], roles?: string[], ... }

export const normalize = s => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9%]+/g, " ").trim();
const words = s => normalize(s).split(" ").filter(Boolean);

// 1 insertion/deletion/substitution/transposition (Damerau, one edit) between a query token and a word
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length) return true;
  const rest = (x, y) => x === y;
  return rest(a.slice(i + 1), b.slice(i + 1))                                   // substitution
    || rest(a.slice(i + 1), b.slice(i)) || rest(a.slice(i), b.slice(i + 1))      // deletion / insertion
    || (a[i] === b[i + 1] && a[i + 1] === b[i] && rest(a.slice(i + 2), b.slice(i + 2)));  // transposition
}

// How well one query token matches a bag of words: 3 word starts-with, 2 contains, 1 one typo, 0 none
function tokenScore(tok, ws) {
  let best = 0;
  for (const w of ws) {
    if (w === tok) return 4;
    if (w.startsWith(tok)) best = Math.max(best, 3);
    else if (tok.length >= 3 && w.includes(tok)) best = Math.max(best, 2);
    else if (tok.length >= 4 && w.length >= 4 && withinOneEdit(tok, w.slice(0, tok.length)) ) best = Math.max(best, 1);
    else if (tok.length >= 4 && withinOneEdit(tok, w)) best = Math.max(best, 1);
  }
  return best;
}

// Score one entry for a query; 0 = no match. Every query token must match somewhere.
export function scoreEntry(entry, query) {
  const toks = words(query);
  if (!toks.length) return 0;
  const label = words(entry.label), kw = words((entry.keywords ?? []).join(" ")), area = words(`${entry.area ?? ""} ${entry.page ?? ""}`);
  let total = 0;
  for (const t of toks) {
    const s = Math.max(tokenScore(t, label) * 3, tokenScore(t, kw) * 2, tokenScore(t, area));
    if (!s) return 0;
    total += s;
  }
  if (normalize(entry.label) === normalize(query)) total += 20;
  else if (normalize(entry.label).startsWith(normalize(query))) total += 8;
  return total;
}

export function searchEntries(entries, query, { role, limit = 12 } = {}) {
  return entries
    .filter(e => !role || !e.roles || e.roles.includes(role))
    .map(e => ({ e, s: scoreEntry(e, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.label.localeCompare(b.e.label))
    .slice(0, limit)
    .map(x => x.e);
}
