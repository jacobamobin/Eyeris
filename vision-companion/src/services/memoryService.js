import { get, set, del, keys } from 'idb-keyval';

const MEMORY_KEY = 'vc_memories';
const CONV_PREFIX = 'vc_conv_';
const PREF_PREFIX = 'vc_pref_';

// ---- Memory (localStorage) ----

export function saveMemory(content, category, importance, tags = []) {
  const memories = getMemories();
  const memory = {
    id: Date.now().toString(),
    content,
    category,
    importance,
    tags,
    createdAt: Date.now(),
  };
  memories.push(memory);
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
  pruneOldMemories();
  return memory;
}

export function getMemories() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getRelevantMemories(query, limit = 5) {
  const memories = getMemories();
  if (!memories.length) return [];

  const queryWords = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const scored = memories.map(m => {
    const contentLower = m.content.toLowerCase();
    const tagMatch = (m.tags || []).some(t => queryWords.includes(t.toLowerCase()));
    const wordMatches = queryWords.filter(w => contentLower.includes(w)).length;
    const relevanceScore = (wordMatches / Math.max(queryWords.length, 1)) + (tagMatch ? 0.3 : 0);
    const ageDays = (now - m.createdAt) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - ageDays / 30);
    const finalScore = m.importance * 0.6 + recencyScore * 0.4 + relevanceScore * 0.5;
    return { ...m, _score: finalScore };
  });

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...m }) => m);
}

export function pruneOldMemories() {
  const memories = getMemories();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const pruned = memories.filter(m => {
    const age = now - m.createdAt;
    return !(m.importance < 0.2 && age > thirtyDays);
  });
  localStorage.setItem(MEMORY_KEY, JSON.stringify(pruned));
}

// ---- Conversation (IndexedDB via idb-keyval) ----

export async function saveConversation(turn) {
  const key = CONV_PREFIX + Date.now();
  await set(key, { ...turn, timestamp: Date.now() });
}

export async function getRecentConversation(limit = 10) {
  const allKeys = await keys();
  const convKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(CONV_PREFIX));
  convKeys.sort().reverse();
  const recent = convKeys.slice(0, limit);
  const turns = await Promise.all(recent.map(k => get(k)));
  return turns.filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
}

// ---- Preferences (localStorage) ----

export function savePreference(key, value) {
  localStorage.setItem(PREF_PREFIX + key, JSON.stringify(value));
}

export function getPreference(key, defaultValue = null) {
  try {
    const val = localStorage.getItem(PREF_PREFIX + key);
    return val !== null ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

// ---- Clear All ----

export async function clearAllData() {
  const allKeys = await keys();
  const convKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(CONV_PREFIX));
  await Promise.all(convKeys.map(k => del(k)));
  localStorage.removeItem(MEMORY_KEY);
  // Clear preferences
  const prefKeys = Object.keys(localStorage).filter(k => k.startsWith(PREF_PREFIX));
  prefKeys.forEach(k => localStorage.removeItem(k));
}
