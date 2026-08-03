export const metadata = {
  title: "Track a Shipment — Pax Logistics",
  description: "Track a Pax Logistics shipment reference.",
};

const trackingStages = [
  ["01", "Booked", "The shipment reference has been created and the basic details are recorded."],
  ["02", "Picked up", "The parcel has been handed over or collected for movement."],
  ["03", "In transit", "The shipment is moving through the courier network toward its destination."],
  ["04", "Delivered", "The final handover has been completed and the journey is closed."],
];

export default function TrackPage() {
  return (
    <main id="main" className="tool-page">
      <section className="tool-page-hero track-tool-hero">
        <div className="shell tool-hero-grid">
          <div className="tool-hero-copy">
            <p className="eyebrow">Track shipment</p>
            <h1>One number. A clearer journey.</h1>
            <p>Enter your Pax reference to view the latest shipment stage and understand the next handoff.</p>
            <form className="tracking-form tool-tracking-form" id="tracking-form" noValidate>
              <label className="sr-only" htmlFor="tracking-id">Tracking reference</label>
              <input id="tracking-id" placeholder="Enter Pax shipment reference" autoComplete="off" />
              <button className="button button-dark" type="submit">Track now</button>
            </form>
            <p className="form-error track-error" id="tracking-error" role="alert"></p>
          </div>
          <div className="tool-hero-visual track-hero-visual" aria-hidden="true">
            <div className="track-hero-card">
              <div><small>PAX / LIVE JOURNEY</small><b>In transit</b></div>
              <span>LIVE STATUS</span>
              <strong>Moving to delivery hub</strong>
              <div className="track-hero-route"><i className="done">✓</i><span></span><i className="done">✓</i><span></span><i className="active"></i><span></span><i></i></div>
              <div className="track-hero-labels"><small>Booked</small><small>Pickup</small><small>Transit</small><small>Delivery</small></div>
            </div>
          </div>
        </div>
      </section>

      <section className="tool-workspace-section tracking-section">
        <div className="shell tracking-card tool-tracking-card" id="tracking-panel">
          <div className="tracking-head">
            <div><small>Shipment reference</small><strong id="shown-tracking-id">Enter a reference above</strong></div>
            <span className="status-badge" id="tracking-status">Not loaded</span>
          </div>
          <div className="current-update">
            <span className="simple-box">□</span>
            <div><small>Current update</small><strong id="tracking-current-update">Waiting for live lookup</strong></div>
          </div>
          <ol className="tracking-steps">
            <li className="done"><i>✓</i><div><strong>Booked</strong><small>Reference created</small></div></li>
            <li className="done"><i>✓</i><div><strong>Picked up</strong><small>Parcel received</small></div></li>
            <li className="active"><i></i><div><strong>In transit</strong><small>Moving through network</small></div></li>
            <li><i></i><div><strong>Delivered</strong><small>Final delivery</small></div></li>
          </ol>
          <p className="panel-note" id="tracking-note">Shipment details are loaded from the Pax API.</p>
        </div>
      </section>

      <section className="tool-detail-section tracking-stage-section">
        <div className="shell">
          <div className="tool-section-heading">
            <p className="eyebrow">Understand the status</p>
            <h2>Four clear stages from booking to handover.</h2>
            <p>Each milestone explains the latest major movement. Timing between stages depends on route, service and operating conditions.</p>
          </div>
          <div className="tracking-stage-grid">
            {trackingStages.map(([number, title, copy]) => (
              <article key={number}>
                <span>{number}</span>
                <div className="tracking-stage-icon" aria-hidden="true">{number === "04" ? "✓" : "□"}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tracking-help-section">
        <div className="shell tracking-help-grid">
          <div>
            <p className="eyebrow light">Need shipment help?</p>
            <h2>Keep the reference ready when you contact the team.</h2>
            <p>Share the Pax reference, sender or receiver phone number, and the latest visible status so the local desk can understand the shipment quickly.</p>
          </div>
          <div className="tracking-help-card">
            <span>01 <strong>Shipment reference</strong></span>
            <span>02 <strong>Contact phone number</strong></span>
            <span>03 <strong>Latest visible update</strong></span>
            <a className="button button-white" href="tel:+919494338206">Call +91 94943 38206</a>
          </div>
        </div>
      </section>
    </main>
  );
}
