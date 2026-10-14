import { CommentSchema, type Comment } from '../contracts';

const URL_OR_SPAM = /(https?:\/\/|www\.|\b(?:buy now|crypto giveaway|free prize)\b)/i;
const ABUSE = /\b(?:fuck|shit|bitch|asshole)\b/i;
export function acceptComment(raw: unknown): Comment | null {
  const parsed = CommentSchema.safeParse(raw); if (!parsed.success) return null;
  const c = parsed.data; const text = c.text.trim();
  if (text.length < 2 || text.length > 420 || URL_OR_SPAM.test(text) || ABUSE.test(text)) return null;
  return { ...c, text };
}
export function dedupeComments(comments: Comment[], seen: Set<string>): Comment[] {
  const accepted: Comment[] = [];
  for (const raw of comments) {
    const comment = acceptComment(raw);
    if (!comment || seen.has(comment.id)) continue;
    seen.add(comment.id); accepted.push(comment);
  }
  return accepted;
}
export function prioritiseComments(comments: Comment[]): Comment[] {
  const score = (c: Comment) => {
    let value = 0;
    if (/[?？]|के हो|कसरी|किन|कहिले|कहाँ|व्याख्या/i.test(c.text)) value += 4;
    if (/गलत|सच्याउ|सुधार|मिलेन|तथ्य/i.test(c.text)) value += 3;
    if (/नमस्ते|नमस्कार|hello|धन्यवाद/i.test(c.text)) value += 1;
    return value;
  };
  return comments.slice().sort((a, b) => score(b) - score(a) || a.ts - b.ts);
}
export class CommentBatcher {
  private pending: Comment[] = [];
  constructor(private maxBatch = 12) {}
  add(comments: Comment[]): void { this.pending.push(...comments); if (this.pending.length > 100) this.pending.splice(0, this.pending.length - 100); }
  take(): Comment[] { const batch = prioritiseComments(this.pending).slice(0, this.maxBatch); const ids = new Set(batch.map(c => c.id)); this.pending = this.pending.filter(c => !ids.has(c.id)); return batch; }
  get parked(): readonly Comment[] { return this.pending; }
  get size(): number { return this.pending.length; }
}