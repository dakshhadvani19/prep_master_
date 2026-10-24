/**
 * Shared question uniqueness + schema validation for every Groq generation path.
 * Exact, normalized, and cheap near-duplicate detection — no embeddings.
 */

const STOP = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'what', 'which',
  'when', 'where', 'how', 'why', 'who', 'are', 'is', 'was', 'were',
  'a', 'an', 'of', 'in', 'on', 'to', 'or', 'by', 'as', 'at', 'be',
  'it', 'its', 'into', 'than', 'then', 'their', 'there', 'does', 'do',
]);

export const NEAR_DUP_JACCARD = 0.92;
export const CONTAINMENT_RATIO = 0.85;

export function normalizeQuestionText(text) {
  let s = String(text || '');
  s = s.normalize('NFKC').toLowerCase();
  s = s.replace(/```[\s\S]*?```/g, (block) => block.replace(/\s+/g, ' '));
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function tokenSet(normalized) {
  const out = new Set();
  for (const w of normalized.split(' ')) {
    if (STOP.has(w)) continue;
    if (w.length <= 2 && !/\d/.test(w)) continue;
    out.add(w);
  }
  return out;
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isNearDuplicate(textA, textB) {
  const na = normalizeQuestionText(textA);
  const nb = normalizeQuestionText(textB);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length / longer.length >= CONTAINMENT_RATIO) {
    return true;
  }
  return jaccard(tokenSet(na), tokenSet(nb)) >= NEAR_DUP_JACCARD;
}

function questionText(q) {
  return String(q?.text || q?.question || '').trim();
}

function uniqueOptions(options) {
  const seen = new Set();
  const out = [];
  for (const opt of options) {
    const key = normalizeQuestionText(opt);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(opt).trim());
  }
  return out;
}

export function validateQuestionSchema(q, { isObjective }) {
  const text = questionText(q);
  if (text.length < 8) return { ok: false, reason: 'missing_text' };
  if (!isObjective) return { ok: true, text };
  const rawOpts = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [];
  const opts = uniqueOptions(rawOpts);
  if (opts.length !== 4) return { ok: false, reason: 'invalid_options' };
  let rawAns = q.answer;
  if (typeof rawAns === 'string' && /^[A-Da-d]$/.test(rawAns)) {
    rawAns = rawAns.toUpperCase().charCodeAt(0) - 65;
  } else {
    rawAns = parseInt(rawAns, 10);
  }
  if (Number.isNaN(rawAns) || rawAns < 0 || rawAns > 3) {
    return { ok: false, reason: 'invalid_answer' };
  }
  return { ok: true, text, options: rawOpts.slice(0, 4), answer: rawAns };
}

/**
 * Filter a batch against already-accepted questions (shared exclusion state).
 * Detects exact, case/punct, near-paraphrase, and duplicate IDs.
 */
export function filterUniqueQuestions(incoming, accepted, { isObjective } = {}) {
  const kept = [];
  const rejected = [];
  const idSeen = new Set(
    accepted.map((q) => String(q.id || '')).filter(Boolean)
  );

  for (const raw of incoming || []) {
    const schema = validateQuestionSchema(raw, { isObjective });
    if (!schema.ok) {
      rejected.push({ reason: schema.reason, text: questionText(raw) });
      continue;
    }
    const id = raw.id != null ? String(raw.id) : '';
    if (id && idSeen.has(id)) {
      rejected.push({ reason: 'duplicate_id', text: schema.text });
      continue;
    }
    const pool = accepted.concat(kept);
    const dup = pool.find((q) => isNearDuplicate(q.text, schema.text));
    if (dup) {
      rejected.push({ reason: 'duplicate_text', text: schema.text });
      continue;
    }
    if (id) idSeen.add(id);
    const next = isObjective
      ? { id: id || `tmp_${kept.length}`, text: schema.text, options: schema.options, answer: schema.answer, type: 'mcq' }
      : { id: id || `tmp_${kept.length}`, text: schema.text, type: 'subjective' };
    kept.push(next);
  }
  return { kept, rejected };
}

export function exclusionList(questions, limit = 40) {
  return questions.slice(-limit).map((q, i) => `${i + 1}. ${questionText(q)}`).join('\n');
}
