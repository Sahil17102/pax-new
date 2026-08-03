export const metadata = {
  title: "Rate Calculator — Pax Logistics",
  description: "Calculate an indicative Pax Logistics shipping rate.",
};

const rateFactors = [
  ["01", "Route", "Pickup and delivery PIN codes help identify the shipment lane and approximate distance."],
  ["02", "Chargeable weight", "The greater of actual and volumetric weight may be used for the final shipping calculation."],
  ["03", "Service speed", "Express movement usually costs more than a standard service on the same route."],
];

export default function EstimatePage() {
  return (
    <main id="main" className="tool-page">
      <section className="tool-page-hero rate-tool-hero">
        <div className="shell tool-hero-grid">
          <div className="tool-hero-copy">
            <p className="eyebrow">Rate calculator</p>
            <h1>Price the journey before you send.</h1>
            <p>Enter route, weight and service details to see a useful indicative shipping range.</p>
            <div className="tool-hero-points">
              <span><i>01</i> Route based</span>
              <span><i>02</i> Weight aware</span>
              <span><i>03</i> Easy to confirm</span>
            </div>
          </div>
          <div className="tool-hero-visual rate-hero-visual" aria-hidden="true">
            <div className="rate-map-grid"></div>
            <div className="tool-window rate-estimate-window">
              <div className="tool-window-head">
                <span>ESTIMATE PREVIEW</span>
                <b>INDICATIVE</b>
              </div>
              <div className="rate-route-preview">
                <div><small>PICKUP PIN</small><strong>500029</strong><span>Hyderabad</span></div>
                <i>→</i>
                <div><small>DELIVERY PIN</small><strong>400001</strong><span>Mumbai</span></div>
              </div>
              <div className="rate-preview-meta">
                <span>2 kg parcel</span>
                <span>Standard service</span>
                <span>Domestic</span>
              </div>
              <div className="rate-cost-breakdown">
                <span><small>Route &amp; handling</small><b>Included</b></span>
                <span><small>Weight slab</small><b>Up to 2 kg</b></span>
              </div>
              <div className="rate-preview-total">
                <small>INDICATIVE SHIPPING RANGE</small>
                <strong>₹210–₹270</strong>
              </div>
              <p className="rate-preview-note">Final price depends on serviceability, dimensions and shipment contents.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="tool-workspace-section">
        <div className="shell form-layout tool-form-layout">
          <form className="form-card tool-form-card" id="rate-form" noValidate>
            <div className="form-card-tag">Route details</div>
            <h2>Build your estimate.</h2>
            <p className="tool-form-intro">Start with the basic shipment details. You can confirm dimensions and exact serviceability with the team later.</p>
            <div className="field-row">
              <label>Pickup PIN code<input id="pickup-pin" inputMode="numeric" maxLength="6" placeholder="500029" required /></label>
              <label>Delivery PIN code<input id="delivery-pin" inputMode="numeric" maxLength="6" placeholder="400001" required /></label>
            </div>
            <div className="field-row">
              <label>Approx. weight<select id="weight" defaultValue="0.5"><option value="0.5">Up to 0.5 kg</option><option value="1">Up to 1 kg</option><option value="2">Up to 2 kg</option><option value="5">Up to 5 kg</option><option value="10">Up to 10 kg</option></select></label>
              <label>Service preference<select id="speed" defaultValue="standard"><option value="standard">Standard</option><option value="express">Express</option></select></label>
            </div>
            <p className="form-error" id="rate-error" role="alert"></p>
            <button className="button button-dark full-button" type="submit">Calculate indicative range <span>→</span></button>
            <div className="rate-result" id="rate-result" aria-live="polite">
              <div><small>Indicative shipment range</small><strong id="rate-value">₹—</strong><span id="rate-route"></span></div>
              <a id="rate-whatsapp" href="#" target="_blank" rel="noreferrer">Confirm with the team →</a>
            </div>
          </form>
          <aside className="form-aside tool-aside estimate-aside">
            <span className="aside-number">₹</span>
            <p className="mini-label">Before you confirm</p>
            <h2>This is an estimate, not a final quote.</h2>
            <p>Final pricing can vary based on dimensions, exact serviceability, shipment contents and pickup requirements.</p>
            <div className="tool-aside-list">
              <span>Measure the packed parcel</span>
              <span>Share accurate PIN codes</span>
              <span>Mention fragile or special contents</span>
            </div>
            <a className="text-link" href="tel:+919494338206">Call +91 94943 38206</a>
          </aside>
        </div>
      </section>

      <section className="tool-detail-section">
        <div className="shell">
          <div className="tool-section-heading">
            <p className="eyebrow">What shapes the estimate</p>
            <h2>Three details make the biggest difference.</h2>
            <p>A useful starting range depends on where the parcel is going, the space it uses and how quickly it needs to move.</p>
          </div>
          <div className="tool-info-grid">
            {rateFactors.map(([number, title, copy]) => (
              <article className="tool-info-card" key={number}>
                <span>{number}</span>
                <div className="tool-info-icon" aria-hidden="true">{title.slice(0, 2).toUpperCase()}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tool-compare-section">
        <div className="shell tool-compare-grid">
          <div className="tool-compare-copy">
            <p className="eyebrow light">Choose the pace</p>
            <h2>Standard when value matters. Express when time matters.</h2>
            <p>The final service depends on route availability and parcel type. Use these options to set the right starting expectation.</p>
          </div>
          <div className="service-choice-list">
            <div><span>STANDARD</span><strong>Balanced movement</strong><p>Practical for routine documents and parcels without an urgent deadline.</p></div>
            <div><span>EXPRESS</span><strong>Priority movement</strong><p>For time-sensitive shipments that need the faster available route.</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
