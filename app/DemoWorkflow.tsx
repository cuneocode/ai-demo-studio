/** A short operator map. Progress reflects actual UI state, never simulated work. */
export default function DemoWorkflow({ steps, active, status }: { steps: string[]; active: number; status: string }) {
  return <section className="demo-workflow" aria-label="Workflow">
    <ol>{steps.map((step, index) => <li key={step} aria-current={index === active ? "step" : undefined}>
      <span>{index + 1}</span><strong>{step}</strong>
    </li>)}</ol>
    <p role="status">{status}</p>
  </section>;
}
