import { describe, expect, it } from 'vitest';
import { acceptComment, dedupeComments, prioritiseComments, CommentBatcher } from '../src/orchestrator/comments';
import type { Comment } from '../src/contracts';
const c=(id:string,text:string,ts=1):Comment=>({id,author:'दर्शक',text,ts,platform:'youtube'});
describe('comment pipeline',()=>{
 it('filters links, spam and malformed/very short content',()=>{expect(acceptComment(c('a','यो प्रश्न हो?'))).not.toBeNull();expect(acceptComment(c('b','https://spam.test'))).toBeNull();expect(acceptComment(c('c','x'))).toBeNull();});
 it('deduplicates comment IDs without repeating prior-seen comments',()=>{const seen=new Set<string>();expect(dedupeComments([c('1','पहिलो'),c('1','दोहोरो'),c('2','दोस्रो')],seen).map(x=>x.id)).toEqual(['1','2']);expect(dedupeComments([c('1','फेरि')],seen)).toHaveLength(0);});
 it('prioritises questions and batches queued comments',()=>{const items=[c('a','नमस्कार'),c('b','सुशासन के हो?'),c('c','गलत तथ्य सच्याउनुहोस्')];expect(prioritiseComments(items)[0].id).toBe('b');const batcher=new CommentBatcher(2);batcher.add(items);expect(batcher.take()).toHaveLength(2);expect(batcher.size).toBe(1);});
});