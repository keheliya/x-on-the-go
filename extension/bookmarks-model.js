export const MAX_BATCH = 20;

export function articleURL(value) {
  try {
    const u = new URL(value);
    if (u.origin !== 'https://x.com' || u.username || u.password) return null;
    const match = u.pathname.match(/^\/(?:[\w]+\/status|i\/article)\/(\d+)\/?$/);
    return match ? {url: `https://x.com${u.pathname.replace(/\/$/, '')}`, id: match[1]} : null;
  } catch { return null; }
}

export function mergeBookmarks(existing, incoming) {
  const merged = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) {
    const source = articleURL(item.url);
    if (!source) continue;
    const target = articleURL(item.articleUrl);
    merged.set(source.id, {...merged.get(source.id), id: source.id, url: source.url,
      articleUrl: target?.url || source.url, title: String(String(item.title || '').trim() || merged.get(source.id)?.title || 'Title unavailable — open on X').slice(0, 500),
      author: String(item.author || '').slice(0, 200)});
  }
  return [...merged.values()];
}

// All browser work is injected, so queue behavior can be tested without Chrome.
export async function runBatch(items, process, onUpdate, signal) {
  if (items.length > MAX_BATCH) throw new Error(`Choose up to ${MAX_BATCH} articles per batch.`);
  const results = [];
  for (const item of items) {
    if (signal?.aborted) break;
    onUpdate(item.id, {state: 'working', message: 'Opening article…'});
    try {
      const detail = await process(item, signal);
      results.push({id: item.id, state: 'done', ...detail});
      onUpdate(item.id, {state: 'done', message: detail.message || 'Downloaded'});
    } catch (error) {
      if (signal?.aborted) {
        onUpdate(item.id, {state: 'cancelled', message: 'Stopped — select to retry'});
        break;
      }
      results.push({id: item.id, state: 'failed', error: error.message});
      onUpdate(item.id, {state: 'failed', message: error.message});
    }
  }
  return results;
}
