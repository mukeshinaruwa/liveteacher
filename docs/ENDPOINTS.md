# HTTP endpoint contracts

All paths are configurable in Settings. Inputs and responses are validated with Zod in `src/contracts/index.ts`. The Express mock server runs with `npm run mock-server`.

## Shared behavior

POST calls send JSON with the optional configured auth header, use a 12-second timeout, and retry once. Comment polling avoids retries to remain responsive. Network errors, non-2xx responses or schema failures are logged and mapped to safe fallback providers. Never bake permanent access tokens into a static site; use a backend proxy or short-lived scoped token.

## POST /plan

Request: `{ topic, notes, objectives, durationMin, style, lang }`.

```json
{"topic":"शासन र सुशासनको अवधारणा","notes":"कक्षा नोट…","objectives":["अवधारणा बुझ्ने"],"durationMin":8,"style":"exam-oriented","lang":"ne"}
```

Response is a LessonPlan containing `id,title,lang,objectives,keyTerms,segments,durationMin,disclaimer`. Each segment has `id,title,text,durationMin,notes` and an optional timeline. Do not fabricate legal articles, dates, amendments or official facts.

## POST /direct

Request contains `segment, plan, history, persona, lang`; response is an ActionTimeline with positive `totalMs` and timestamped actions. Timestamps are milliseconds. Optional anchors: `{ "kind":"word", "wordIndex":4, "offsetMs":100 }` (zero-based word index) or `{ "kind":"action", "actionId":"speech-start", "offsetMs":1800 }`. Missing timings are estimated; out-of-range times are clamped and actions sorted.

```json
{"t":0,"type":"speak","text":"छोटो, बोल्न मिल्ने वाक्य।","style":{"pace":0.95,"pitch":1,"tone":"explaining","emphasis":["संविधान"]}}
{"t":1500,"type":"gesture","name":"point_board","durationMs":900}
{"t":2000,"type":"camera","shot":"board-focus","ease":"smooth"}
{"t":2400,"type":"board","op":"write","id":"line.1","text":"मुख्य अवधारणा","animate":"typewriter"}
{"t":4500,"type":"board","op":"highlight","id":"line.1","color":"accent"}
{"t":6000,"type":"visual","op":"show_diagram","diagram":"three-tier-govt"}
{"t":8000,"type":"pause","ms":700,"reason":"concept pause"}
{"t":9000,"type":"question","text":"यो अवधारणाको उदाहरण के हुन सक्छ?","think_ms":3000}
{"t":13000,"type":"recap","points":["परिभाषा","उदाहरण","निष्कर्ष"]}
```

Supported actions: speak, gesture, emotion, camera, board, visual, pause, question, transition, recap, sfx. The enum values are listed in the Zod schemas. An invalid timeline is replaced by a safe default timeline.

## POST /tts

Request `{ text, lang, style }`. Response may contain `audioUrl` or `audioBase64`, optional `mimeType`, `durationMs`, and `wordTimings:[{word,startMs,endMs}]`. Missing timings use a character-rate estimate. The mock server returns timing-only silence, not voiced audio.

## POST /respond

Request `{ comments, lessonContext, currentSegment }`. Response `{ decisions:[{commentId,decision,reply?,tone?,actions?}] }`. Supported decisions: ignore, answer_now, answer_later, answer_at_segment_end, add_to_recap, clarify_with_board. Replies stay in the current lesson, avoid unsupported claims and personal data, and should resume the lesson briefly.

## GET /comments?since=<cursor>

Response `{ comments:[{id,author,text,ts,platform,meta?}], cursor }`. Use stable IDs and an advancing cursor. Default polling interval is 3 seconds. A replacement SSE/WebSocket adapter should preserve equivalent poll/reply behavior.

## POST /comments/reply

Request `{commentId,text}`; response `{ok:true}`. The mock stores replies in memory and exposes `/debug/replies`. Real Facebook/YouTube posting belongs on the backend and must follow official API permissions.

Run `npm run mock-server`; check `http://localhost:8787/health`.