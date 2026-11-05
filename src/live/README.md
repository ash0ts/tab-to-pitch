# Live guitar input

`LiveInputController` owns one input session: permission, device/channel selection, capture, cancellation and disposal. The UI is [LiveGuitarPanel](../ui/LiveGuitarPanel.tsx), mounted in the shared progression/homework workspace. The teacher can select an eligible task but cannot open a device or start a response. Those actions require the learner's click.

## Use it

In Chrome on a Mac, connect a guitar to the instrument input of a USB interface. Use wired headphones and the interface's direct monitor or separate amp software. Select the hardware input and guitar channel, then **Connect guitar**. Do not select a loopback or computer-audio mix. The app does not monitor the guitar to its output.

**Explore sound** displays experimental pitch/chord hypotheses and cents from the nearest note. **Make an attempt** hides detection labels until **Finish response**. Original notes, exact-pitch targets, arpeggiated homework fragments, descending F→E connections, confirmed chord sequences and a previously constructed phrase share this workflow. For C–F–G–C, open the original study in Fretboard homework, then choose Play with my guitar. A strummed task requires a fully confirmed progression in the initial detector vocabulary.

The output picker controls alphaTab accompaniment. Browser support and operating-system routing determine whether output selection is available. The visible recording provider may have its own output route. Stop listening closes capture without stopping accompaniment.

## Audio and evidence

The capture worklet selects one channel and outputs silence. It transfers a fixed pool of 512-sample buffers to the analysis worker after a readiness handshake. The worker returns buffers for reuse. Pool exhaustion or a missing channel stops the input; dropped audio cannot become a grading result. There is no SharedArrayBuffer, cross-origin isolation, server DSP or raw-audio persistence.

Audio is processed at the AudioContext's actual sample rate, including any browser resampling. Requested echo cancellation, noise suppression and automatic gain control are false; the UI reports when settings do not confirm that. Backgrounding, disconnection, permission cancellation and a suspended audio context stop the session. Reconnection is explicit. Preferences can persist, but reload never opens a device.

`GuitarDetector` uses Pitchy 4.1.0 for monophonic pitch and application-owned FFT peak analysis for chord pitch-class sets. Signal gates, stable candidates and attack identities precede assessment. Pitchy clarity and spectral scores are not calibrated correctness probabilities. The chord detector has alternatives independent of the requested answer. C6/Am7 remains ambiguous; minor-seventh and rootless material can be practiced one note at a time. Missing evidence is not evidence that a string was silent.

`MidiTracker` accepts Web MIDI note events from an optional converter. It retains provider provenance. Pitch bends, sustain and unknown pitch-range configuration are unsupported. Channels do not identify strings. No Jam Origin installation or converter accuracy is assumed, and its newer WebSocket API is not implemented.

The [versioned contracts](../shared/live-guitar.ts) keep audio hypotheses separate from coordinate answers, self-report and screen recall. `assessPerformance` freezes the first stable event for each attack. It accepts pitch class across octaves unless exact pitch is requested; the F→E connection additionally requires one descending semitone. Clipping, interrupted input and insufficient observations are unassessed. Unsupported MIDI controls or a sustained ambiguous/weak segment also make the response unassessed, even if other notes matched. The 250 ms uncertainty threshold permits brief attack/decay transitions; it is an unqualified engineering default. Timing, fret positions, CAGED family, clean technique and comfort are never verified.

`useLiveGuitar` commits immutable lesson events and a resumable bookmark through the existing IndexedDB/memory storage layer. Each new attempt freezes the input session configuration, including sample rate, channel, detector observations and the currently unknown calibration reference, without a device name. A pending response reserves its attempt index before listening. Reload records interruption; another try cannot replace the first response. Support is recorded before a cue or teacher help becomes visible. Source/constraint/task changes invalidate active attempts and pending teacher actions. Older lesson backups remain accepted.

`PlaybackClockBridge` records traversal epochs and descriptive score positions. It resets on seeks, loops, playback/speed changes and output changes. Callback arrival times are not calibrated physical timing. No precise early/late grade is enabled. Hardware input/output alignment remains future qualification work.

## Teaching and cloud boundary

The additive `teacher-live-v1` capability uses the existing `/api/teacher/next` endpoint. `inspect_live_input` returns availability and at most eight completed attempt summaries. `live_activity` selects an eligible task. The same actor/critic call caps, quotas, consent, cancellation and stale-state validation apply. The reviewer must reject claims that detection established a grip, clean strings, timing or mastery.

Cloud requests can contain the learner's typed question and bounded symbolic summaries after consent. They contain no recordings, device names or continuous observations. Production Agent Lens spans retain the existing metadata allowlist. A factual-review failure withholds model prose and keeps the local fallback available.

All detector capabilities remain experimental. The [evaluation protocol and limitations](../../research/live-guitar-v1/README.md) distinguish synthetic engineering checks from real guitar, hardware and hosted-teacher qualification. A native wrapper is not implemented because no browser hardware failure has established the need for one.

## Demonstration

Open the original C–F–G–C study from Fretboard homework. Choose a C-family fragment, pause the screen assignment, then open **Play with my guitar** and select **Pick the homework fragment**. Audio assesses the displayed note sequence; it does not complete the coordinate question. Continue with the confirmed progression, isolate an uncertain chord, then select **Seventh to third** for F→E. Ask the teacher what the latest response supports.

`scripts/capture-live-demo.mjs` captures this workflow in an isolated Chrome browser against a running production preview. Its visible banner discloses generated audio. The recording is a UI/pipeline demonstration, not an audible hardware test or evidence of detector accuracy on guitar.
