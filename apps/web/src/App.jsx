import React from 'react';

const appFeatures = [
  'Sale status surface',
  'Remaining stock display',
  'Purchase submission form',
  'Purchase status lookup',
];

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Bookipi Assignment</p>
        <h1>Flash sale frontend bootstrapped with minimal React tooling.</h1>
        <p className="summary">
          This is the starting point for the single-page UI. The app is intentionally
          small so the next tasks can focus on wiring the backend endpoints and user
          flow.
        </p>
        <div className="status-row">
          <span className="status-pill">React</span>
          <span className="status-pill">Vite</span>
          <span className="status-pill">No UI library</span>
        </div>
      </section>

      <section className="checklist-panel" aria-labelledby="next-steps-heading">
        <div>
          <p className="panel-label">Ready for next tasks</p>
          <h2 id="next-steps-heading">Frontend shell in place</h2>
        </div>
        <ul className="feature-list">
          {appFeatures.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
