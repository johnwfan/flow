// Landing-page copy, ported from the design prototype ("Design Pages/Flow.dc.html").
//
// Several lines from the prototype leaned on a "no upload, no sync, local
// only" framing that predates the real architecture: session data now
// persists to Tiger Cloud (a managed remote database) and the dashboard is
// a public URL, not a device-local view. What's still true — and the only
// claim these leaned on — is that raw camera frames/video are processed
// locally and never leave the machine; only derived numbers (pulse,
// breathing rate, etc.) and small bits of text (app titles, states) sync
// out. The lines below are corrected to say that instead of overstating
// "local only." The claim-discipline language ("not a medical device...
// diagnoses nothing") is untouched — that one's accurate as written.

export const heroStats = [
  { value: "~34 min", label: "median focus window" },
  { value: "82%", label: "agreement with self-report" },
  { value: "0 bytes", label: "of video leaves your machine" },
];

export const features = [
  {
    tag: "01 · sensing",
    title: "Pulse and breathing, no wearable",
    body: "A plain webcam is enough. Flow reads heart rate, breathing, blink rate and gaze, and shows you the raw waveform — not a score out of ten.",
  },
  {
    tag: "02 · the hard part",
    title: "The state nothing else measures",
    body: "Timers see an open document. Flow sees your pulse fall, blinks collapse and gaze freeze — eyes on the page, brain gone — and names it.",
  },
  {
    tag: "03 · in the moment",
    title: "It intervenes, once, and softly",
    body: "A chime and a card after ninety seconds of drift. Voice-guided breathing when you are spiralling. Every offer is refusable in one click.",
  },
  {
    tag: "04 · afterwards",
    title: "A written account, not a scoreboard",
    body: "Each session ends in a narrative written from your own signal, a timeline you can read, and an honest record of where the classifier was wrong.",
  },
];

export const principles = [
  {
    title: "Observed, never diagnosed",
    body: "Flow says your pulse fell and your blinks collapsed. It does not say you were tired, distracted or failing. The reading is the claim; the meaning is yours.",
  },
  {
    title: "Offers, not instructions",
    body: "Every intervention is refusable in one click, and refusing is never counted against you. A coach that is impressed with you every session is not paying attention.",
  },
  {
    title: "Evidence or silence",
    body: "Below 0.55 confidence Flow keeps reading but stops interrupting, missing data is hatched rather than guessed, and a session without enough signal gets its timeline but no narrative.",
  },
  {
    title: "Your camera, your machine",
    body: "No account needed. Flow processes your camera frames locally and never sends the video anywhere — only what it reads off them, numbers and a little text, syncs to your dashboard.",
  },
];

export const tech = [
  {
    name: "rPPG sensing",
    note: "Placeholder — remote photoplethysmography via the Presage SDK, running against the local camera stream.",
  },
  {
    name: "local agent",
    note: "Placeholder — a small background process pairs physiology with the active window and app category, and sends only the derived numbers off-device. Frames and video never leave it.",
  },
  {
    name: "classifier",
    note: "Placeholder — rules plus a light model over rolling physiology and context windows; emits a state and the reasons behind it.",
  },
  {
    name: "narratives",
    note: "Placeholder — Gemini writes the post-session account from the session's own derived figures, never from raw frames.",
  },
  {
    name: "storage",
    note: "Placeholder — session data persists to Tiger Cloud, a managed remote database, keyed to a device id. No account required.",
  },
];

export const faqs = [
  {
    q: "Does anything leave my machine?",
    a: "Your camera frames never leave this machine — a local agent processes them, and only what it reads off them (numbers like pulse and breathing rate, plus small bits of text such as app titles and states) syncs to your dashboard. There's no account or login required.",
  },
  {
    q: "What is it actually reading?",
    a: "Pulse and breathing from tiny colour changes in your face, plus blink rate and gaze direction. That is camera-based physiological sensing — not a medical device, and it diagnoses nothing.",
  },
  {
    q: "Why four minutes of calibration?",
    a: "Your resting pulse and breathing are yours. Flow needs a few minutes of you being normal before a change means anything. Waveforms are live the whole time.",
  },
  {
    q: "What happens if the camera loses me?",
    a: "The plots hatch, the numbers blank, and alerts stop. Nothing is interpolated and no state is guessed from a missing signal.",
  },
  {
    q: "Can I ignore an intervention?",
    a: "Always, in one click. Declining is never recorded as a failure and never affects your figures.",
  },
];
