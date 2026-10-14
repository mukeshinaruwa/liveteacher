import { z } from 'zod';

export const LangSchema = z.enum(['ne', 'en']);
export const TeachingStyleSchema = z.enum(['formal', 'friendly', 'exam-oriented']);
export const EmotionSchema = z.enum(['neutral', 'warm', 'serious', 'curious', 'encouraging', 'surprised']);
export const GestureSchema = z.enum(['point_board', 'open_palm', 'count_fingers', 'emphasize', 'thinking', 'nod', 'shake_head', 'welcome', 'thumbs_up', 'walk_to_board', 'write_on_board', 'idle']);
export const CameraShotSchema = z.enum(['wide', 'medium', 'close-up', 'board-focus', 'over-shoulder']);
export const AnchorSchema = z.object({
  kind: z.enum(['word', 'action']),
  wordIndex: z.number().int().nonnegative().optional(),
  actionId: z.string().optional(),
  offsetMs: z.number().int().default(0),
});
const base = z.object({ t: z.number().int().nonnegative().optional(), actionId: z.string().optional(), anchor: AnchorSchema.optional() });
export const SpeakActionSchema = base.extend({ type: z.literal('speak'), text: z.string().min(1), style: z.object({ pace: z.number().min(0.5).max(2).optional(), pitch: z.number().min(0).max(2).optional(), emotion: EmotionSchema.optional(), emphasis: z.array(z.string()).optional(), tone: z.string().optional() }).optional() });
export const GestureActionSchema = base.extend({ type: z.literal('gesture'), name: GestureSchema, target: z.string().optional(), durationMs: z.number().positive().optional() });
export const EmotionActionSchema = base.extend({ type: z.literal('emotion'), name: EmotionSchema, intensity: z.number().min(0).max(1).default(0.7) });
export const CameraActionSchema = base.extend({ type: z.literal('camera'), shot: CameraShotSchema, ease: z.enum(['smooth', 'cut']).default('smooth') });
export const BoardActionSchema = base.extend({ type: z.literal('board'), op: z.enum(['write', 'append', 'erase', 'highlight', 'underline', 'strike']), id: z.string(), text: z.string().optional(), color: z.enum(['accent', 'warm', 'danger', 'blue']).optional(), animate: z.enum(['typewriter', 'fade', 'none']).optional() });
export const VisualActionSchema = base.extend({ type: z.literal('visual'), op: z.enum(['show_diagram', 'show_timeline', 'show_comparison', 'show_mind_map', 'show_key_terms', 'show_prop', 'hide']), diagram: z.string().optional(), data: z.record(z.string(), z.unknown()).optional() });
export const PauseActionSchema = base.extend({ type: z.literal('pause'), ms: z.number().int().nonnegative(), reason: z.string().optional() });
export const QuestionActionSchema = base.extend({ type: z.literal('question'), text: z.string(), think_ms: z.number().int().nonnegative().default(3000), rhetorical: z.boolean().default(false) });
export const TransitionActionSchema = base.extend({ type: z.literal('transition'), text: z.string().optional(), toSegmentId: z.string().optional() });
export const RecapActionSchema = base.extend({ type: z.literal('recap'), points: z.array(z.string()).min(1) });
export const SfxActionSchema = base.extend({ type: z.literal('sfx'), name: z.enum(['soft-chime', 'tap', 'success']), volume: z.number().min(0).max(1).default(0.3) });
export const ActionSchema = z.discriminatedUnion('type', [SpeakActionSchema, GestureActionSchema, EmotionActionSchema, CameraActionSchema, BoardActionSchema, VisualActionSchema, PauseActionSchema, QuestionActionSchema, TransitionActionSchema, RecapActionSchema, SfxActionSchema]);
export const ActionTimelineSchema = z.object({ segmentId: z.string().min(1), lang: LangSchema.default('ne'), totalMs: z.number().int().positive(), actions: z.array(ActionSchema).min(1) });

export const LessonSegmentSchema = z.object({ id: z.string(), title: z.string(), text: z.string(), durationMin: z.number().positive().default(2), notes: z.string().default(''), timeline: ActionTimelineSchema.optional() });
export const LessonPlanSchema = z.object({ id: z.string(), title: z.string(), lang: LangSchema.default('ne'), objectives: z.array(z.string()), keyTerms: z.array(z.string()), segments: z.array(LessonSegmentSchema).min(1), durationMin: z.number().positive().default(10), disclaimer: z.string().optional() });
export const PlannerRequestSchema = z.object({ topic: z.string(), notes: z.string(), objectives: z.array(z.string()).default([]), durationMin: z.number().positive(), style: TeachingStyleSchema, lang: LangSchema });
export const DirectorRequestSchema = z.object({ segment: LessonSegmentSchema, plan: LessonPlanSchema, history: z.array(z.string()).default([]), persona: z.string().default('friendly Nepali PSC instructor'), lang: LangSchema });

export const CommentSchema = z.object({ id: z.string(), author: z.string().default('दर्शक'), text: z.string().min(1).max(1000), ts: z.number().default(() => Date.now()), platform: z.enum(['facebook', 'youtube']).default('youtube'), meta: z.record(z.string(), z.unknown()).optional() });
export const CommentDecisionSchema = z.object({ commentId: z.string(), decision: z.enum(['ignore', 'answer_now', 'answer_later', 'answer_at_segment_end', 'add_to_recap', 'clarify_with_board']), reply: z.string().optional(), tone: EmotionSchema.optional(), actions: z.array(ActionSchema).optional() });
export const RespondRequestSchema = z.object({ comments: z.array(CommentSchema), lessonContext: z.string(), currentSegment: LessonSegmentSchema });
export const RespondResponseSchema = z.object({ decisions: z.array(CommentDecisionSchema) });
export const TTSRequestSchema = z.object({ text: z.string().min(1), lang: LangSchema, style: z.object({ pace: z.number().optional(), pitch: z.number().optional(), emotion: EmotionSchema.optional(), emphasis: z.array(z.string()).optional() }).optional() });
export const WordTimingSchema = z.object({ word: z.string(), startMs: z.number().nonnegative(), endMs: z.number().nonnegative() });
export const TTSResponseSchema = z.object({ audioUrl: z.string().optional(), audioBase64: z.string().optional(), mimeType: z.string().optional(), wordTimings: z.array(WordTimingSchema).optional(), durationMs: z.number().positive().optional() });
export const CommentsResponseSchema = z.object({ comments: z.array(CommentSchema), cursor: z.union([z.string(), z.number()]).optional() });
export const ReplyResponseSchema = z.object({ ok: z.boolean() });

export type Lang = z.infer<typeof LangSchema>;
export type TeachingStyle = z.infer<typeof TeachingStyleSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ActionTimeline = z.infer<typeof ActionTimelineSchema>;
export type LessonSegment = z.infer<typeof LessonSegmentSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;
export type Comment = z.infer<typeof CommentSchema>;
export type CommentDecision = z.infer<typeof CommentDecisionSchema>;
export type WordTiming = z.infer<typeof WordTimingSchema>;
export type TTSResponse = z.infer<typeof TTSResponseSchema>;

export function safeTimeline(input: unknown, fallback: ActionTimeline): ActionTimeline {
  const parsed = ActionTimelineSchema.safeParse(input);
  return parsed.success ? parsed.data : fallback;
}