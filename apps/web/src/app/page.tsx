import { State } from "@flow/shared";

export default function Home() {
  return (
    <main>
      <h1>Flow</h1>
      <p>Smart Focus Tracking — tryflow.study</p>
      <p>Initial state: {State.Warmup}</p>
    </main>
  );
}
