# Speech, timing and stream audio

## Provider strategy

- `BrowserTTS`: `speechSynthesis`; tries an explicitly selected voice, a `ne-NP` voice, a `hi-IN` fallback, then an available English voice. The Settings page warns if no Nepali voice exists.
- `HttpTTS`: calls `POST /tts` with `{ text, lang, style }`. Accepts `audioUrl` or `audioBase64`, `mimeType`, optional `durationMs`, and optional word timings.
- `MockTTS`: creates word timings without audio. Useful for offline automation and verifying timeline behavior.

`prepare()` is called before a segment to allow caching/prefetching. `play()` reports word/timing progress where possible. `cancel()` stops the active utterance/audio. The HTTP response can be cached by text + language + style at the backend; this prototype intentionally does not persist generated audio in localStorage.

## Timing rules

Word timing shape is `{ word, startMs, endMs }`. Indices are zero-based. If TTS does not provide timing, a character-rate estimate is generated with extra pauses after punctuation. Browser `onboundary` events are inconsistent across browser/voice combinations, so estimated timing callbacks are kept as a fallback. Expect some lip-sync/gesture drift; production expressive TTS should supply stable timings or phoneme/viseme events.

## Audio capture routing

When HTTP audio is played, the app attempts to connect the media element through one `AudioContext` and a master gain node. The audio is routed both to speakers and to a `MediaStreamAudioDestinationNode`, exposed to the capture controller as `window.__liveAudioStream`.

Browser `speechSynthesis` is not a `MediaElementAudioSourceNode` and cannot be reliably captured by this graph. A streaming system that needs the teacher's spoken voice in RTMP should use HTTP TTS returning a same-origin/CORS-enabled audio URL or base64 audio payload. Validate that captured video and audio are synchronized before relying on automated broadcast.

Autoplay varies by browser. A headed Studio user should click Start. A headless browser can use `?mode=broadcast&autostart=1`, but the host's browser launch policy still determines whether audible playback is permitted. A blocked audio promise is logged; the visual stage continues instead of freezing.