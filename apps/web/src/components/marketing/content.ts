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
    body: "A plain webcam is enough. Flow estimates pulse, breathing, blink rate and gaze, then shows the signal it measured instead of reducing you to a productivity score.",
  },
  {
    tag: "02 · context",
    title: "It notices drift, not just time",
    body: "Flow combines rolling physiology with the active app and window context to distinguish focused work, drifting, spiralling, warmup and missing signal.",
  },
  {
    tag: "03 · in the moment",
    title: "A quiet nudge when it helps",
    body: "When the evidence is strong enough, Flow can offer a short reset or guided breathing. Every intervention is optional and dismissible in one click.",
  },
  {
    tag: "04 · afterwards",
    title: "A session you can understand later",
    body: "Afterward, Flow turns your derived signals and state timeline into a plain-language account, with enough detail to see where its reading may have been wrong.",
  },
];

export const principles = [
  {
    title: "Observed, never diagnosed",
    body: "Flow says your pulse fell and your blinks collapsed. It does not say you were tired, distracted or failing. The reading is the claim; the meaning is yours.",
  },
  {
    title: "A coach, not a scorekeeper",
    body: "Flow helps you notice patterns in your own work. It does not rank your day, punish a refusal, or turn attention into a number to optimize.",
  },
  {
    title: "Evidence or silence",
    body: "Below 0.55 confidence Flow keeps reading but stops interrupting, missing data is hatched rather than guessed, and a session without enough signal gets its timeline but no narrative.",
  },
  {
    title: "Raw video stays local",
    body: "The agent processes camera frames on your machine and never uploads the video. Derived measurements and small context fields can sync to the dashboard so sessions are available afterward.",
  },
];

export const tech = [
  {
    name: "rPPG sensing",
    note: "The local agent uses remote photoplethysmography through the Presage SDK to estimate pulse, breathing and related signal from the camera stream.",
  },
  {
    name: "local agent",
    note: "A small background process pairs those measurements with the active window and app category. It sends derived values and context, never camera frames or video.",
  },
  {
    name: "classifier",
    note: "Rules over rolling physiology and context windows emit states such as focused, zoned out, spiralling, warmup and no signal, along with their evidence.",
  },
  {
    name: "narratives",
    note: "Gemini writes the post-session account from that session's derived figures, events and timeline, never from raw camera frames.",
  },
  {
    name: "storage",
    note: "Session data is stored in Tiger Cloud, a managed remote database, and appears in the dashboard without requiring an account or login.",
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
