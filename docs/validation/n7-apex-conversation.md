# Automatic spoken conversation

User requirement: converse with the humanoid without pressing Send for every utterance. The previous dictation-only flow waited for manual confirmation; the new primary action is **Έναρξη συζήτησης**. One initial gesture/permission starts turn taking. At the recognition session's end, final recognized speech is submitted once through the existing guest/private chat transport. Interim text is displayed but never sent. The model reply is spoken completely, then recognition restarts after a 700ms audio-tail gap. No Send action is shown while the conversation is active. Legacy editable dictation remains available as **Υπαγόρευση** and typed chat remains available outside the active voice loop.

This is automatic turn taking: microphone capture stops during the model request and playback, then resumes after the entire reply, avoiding a loop where the assistant recognizes its own output. It does not claim simultaneous listening/interruptions during playback. **Τέλος συζήτησης** stops immediately; saying “τέλος συζήτησης”, “τέλος της συζήτησης” or “σταμάτα τη συζήτηση” while being heard also stops locally without sending that command to the model. Closing the panel/figure or hiding the page stops the loop. Pending model work may still complete and remain visible, but ending the voice session suppresses its later audio and microphone restart.

Empty/interim-only and no-speech sessions restart quietly without model calls. Permission, recognition-network, playback or model/rate-limit failures stop the session with an explicit message and no automatic request retry. Generation and per-event guards reject stale/duplicate recognition or utterance completion callbacks. Every TTS chunk must finish before listening resumes. The existing guest API request limits remain unchanged. Private queued replies remain in Thinking until completion and then resume the same spoken loop. A selected-conversation change ends the previous voice session.

The conversation change does not modify the model, provider, server, API credentials, auth policy, geometry, artwork or camera. Concurrent two-axis head-motion commits on the same branch are retained and will be verified with the integrated release. The password-free public route and private owner endpoints retain their existing scope. This UI-only release uses the existing no-write/no-restart backend check.

## Verification

The preceding live UI failed the new fixture at the missing **Έναρξη συζήτησης** control. (An earlier scratch-server baseline attempt returned an empty HTTP response and is not counted as a behavior result.) The new static build, TypeScript and lint passed. Browser fixtures check:

- multiple turns from a single start, final-only automatic submission and duplicate completion guards;
- no Send action during conversation, no recognition restart while waiting/speaking, all response chunks completed before listening resumes;
- no-speech retry without a model call, spoken stop command, manual stop suppressing a late reply;
- provider/permission failures pausing, hidden page/Exit stopping, mobile figure remaining visible;
- authenticated queued model delivery followed by automatic listening resumption;
- existing manual dictation, explicit read/test, direct/queued responses and cancellation still passing in the legacy voice suite.

`n7-conversation-evidence/local-results.json` and `local-mobile.png` are explicitly controlled API/speech-device fixtures, not physical audio or microphone proof. The owner has reported that existing device voice playback is audible; the new physical microphone/restart behavior on that device is not inferred from fixtures. Browser speech recognition/service permissions and synthesis availability still apply. The initial gesture is required by browser media policies; no new paid speech provider is introduced.

Concurrent branch integration: rebased onto `a800e4e6c5ad42b9524e9e3c46cafe8fa8a0d10d` without discarding its head-pitch changes. Its previous CI run failed because the mobile geometry test sampled the figure before its ResizeObserver fit settled. The test now waits for the same required geometry/visibility bounds, retaining the existing assertions rather than relaxing them.
