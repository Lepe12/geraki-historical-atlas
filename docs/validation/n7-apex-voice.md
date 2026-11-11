# N7 APEX voice integration

Scope: isolated `/n7-apex-step5/` preview on the existing branch/PR. No production `/n7-apex/`, backend, authentication policy, model or agent configuration changes. No paid provider, API key or dependency added. Original artwork, camera and humanoid geometry remain unchanged.

## Behavior

Open **Φωνητική συνομιλία** below the figure. The existing N7 password can be entered in the same screen through the existing same-origin `/api/login` endpoint; it is not a new account. Password fields clear on success/failure and no password is persisted by this UI. Existing authenticated cookies are reused automatically. Login can also happen through the existing N7 root page and is rechecked when the window regains focus.

**Μικρόφωνο** requests browser speech recognition in Greek only after a click and enables voice replies. Recognized text is editable and requires explicit **Αποστολή στη φιγούρα** confirmation. The request uses the same conversation, model transport and queue lifecycle as typed chat. **Φωνή ενεργή/ανενεργή** controls automatic reading; **Δοκιμή φωνής**, **Ανάγνωση απάντησης**, a device voice selector and **Διακοπή ήχου** are available. Typing remains available.

Listening follows recognition `onstart`/`onend`, Thinking follows real pending HTTP/queue activity, and Speaking follows synthesis `onstart`/`onend` rather than text arrival. Long responses are chunked, with generation guards preventing cancelled chunks from resuming. Errors and playback-start timeout clear activity. Closing the voice panel, leaving the figure or hiding the page stops microphone/output and disables automatic playback so later queue results do not speak unexpectedly. Conversation state and queued requests remain mounted. Loading existing history never starts reading it. Queue polling does not repeat an already handled answer.

The voice composer is portalled into the figure dialog while its conversation controller stays mounted. It remains within modal keyboard focus and outside the inert background. Mobile composer uses a bounded scroll area; the figure resizes rather than being covered.

## Verification

- Before-change browser test against the previous build failed because **Φωνητική συνομιλία** was absent.
- Reconstructed static Next build, TypeScript and lint passed.
- `test_voice.cjs` uses explicitly labelled local API and speech-device fixtures to check login success/failure and cleared password, no unsolicited mic/audio, confirmation before sending, accurate activity events, direct and queued replies, cancellation, permission denial, errors, exit and mobile layout. These fixtures are not a real model or audible microphone/speaker test.
- The independent complete-guide rendering suite passed after integration. An initial run hit its strict reopening timing assertion under software-renderer/build contention; an isolated reproduction observed assembly progress 0.0556 after reopening, and the complete suite then passed. The assertion was not weakened.
- Native browser capability probe is separate from fixtures. This headless Chromium exposes recognition and synthesis but reports no installed speech voices. This does not prove audible output; it is recorded explicitly in `native-capabilities.json`.

## Device and authentication limits

Speech uses Web Speech APIs and the voices installed/provided by the user's browser/OS. Recognition availability, microphone permission, service connectivity and Greek voice availability vary by device. Recognition can use the browser vendor's online service, as disclosed next to the microphone control. Missing/denied recognition leaves typing available; playback failure leaves the text and manual reading action available. No camera tracking or assembly sound is added by this voice change.

The automation environment has no authenticated N7 session, physical user microphone or installed Greek speaker voice. Authenticated real-model audio conversation and sound heard on the owner's device must not be reported as verified by the lifecycle fixture. The implementation now provides the in-place login and voice controls needed to use that existing session directly.

API references: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [speechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/Window/speechSynthesis), [SpeechSynthesisUtterance](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance).
