const packingTips = [
  ["01", "Use the right-size box", "Extra empty space increases dimensions and may raise volumetric weight."],
  ["02", "Measure the outer edges", "Include bulges, handles and protective wrapping in length, width and height."],
  ["03", "Weigh after packing", "Use the complete packed parcel—not only the product inside—for actual weight."],
];

export default function WeightCalculatorPage() {
  return (
    <main id="main" className="tool-page">
      <section className="tool-page-hero weight-tool-hero">
        <div className="shell tool-hero-grid">
          <div className="tool-hero-copy">
            <p className="eyebrow">Weight calculator</p>
            <h1>Measure the space your parcel uses.</h1>
            <p>Compare actual and volumetric weight to understand which value may be used for shipping.</p>
            <div className="tool-hero-points">
              <span><i>01</i> Measure</span>
              <span><i>02</i> Compare</span>
              <span><i>03</i> Pack smarter</span>
            </div>
          </div>
          <div className="tool-hero-visual weight-hero-visual" aria-hidden="true">
            <div className="parcel-cube">
              <span className="cube-top"></span><span className="cube-side"></span><strong>PAX</strong>
              <i className="measure-length">40 cm</i><i className="measure-width">30 cm</i><i className="measure-height">25 cm</i>
            </div>
            <div className="weight-hero-result"><small>VOLUMETRIC</small><strong>6.00 kg</strong><span>40 × 30 × 25 ÷ 5000</span></div>
          </div>
        </div>
      </section>

      <section className="tool-workspace-section calculator-section">
        <div className="shell form-layout tool-form-layout">
          <form className="form-card tool-form-card" id="weight-form" noValidate>
            <div className="form-card-tag">Parcel measurements</div>
            <h2>Find the chargeable weight.</h2>
            <p className="tool-form-intro">Enter the packed parcel’s actual weight and outer dimensions for a useful comparison.</p>
            <div className="field-row">
              <label>Actual weight (kg)<input id="actual-weight" type="number" min="0.1" step="0.1" placeholder="2.5" required /></label>
              <label>Courier divisor<select id="weight-divisor" defaultValue="5000"><option value="5000">5000 — common air rate</option><option value="6000">6000 — selected services</option></select></label>
            </div>
            <div className="dimension-row">
              <label>Length (cm)<input id="parcel-length" type="number" min="1" step="0.1" placeholder="40" required /></label>
              <span>×</span>
              <label>Width (cm)<input id="parcel-width" type="number" min="1" step="0.1" placeholder="30" required /></label>
              <span>×</span>
              <label>Height (cm)<input id="parcel-height" type="number" min="1" step="0.1" placeholder="25" required /></label>
            </div>
            <p className="form-error" id="weight-error" role="alert"></p>
            <button className="button button-dark full-button" type="submit">Calculate chargeable weight <span>→</span></button>
            <div className="weight-result" id="weight-result" aria-live="polite">
              <div><small>Actual weight</small><strong id="actual-result">—</strong></div>
              <div><small>Volumetric weight</small><strong id="volumetric-result">—</strong></div>
              <div className="chargeable-result"><small>Chargeable weight</small><strong id="chargeable-result">—</strong></div>
            </div>
          </form>

          <aside className="form-aside tool-aside weight-aside">
            <span className="aside-number">kg</span>
            <p className="mini-label">How it works</p>
            <h2>Large, light parcels can cost more space.</h2>
            <p>Volumetric weight is calculated as length × width × height divided by the selected courier divisor.</p>
            <div className="weight-formula"><span>L × W × H</span><i>÷</i><span>DIVISOR</span></div>
            <a className="text-link" href="/rate-calculator">Continue to rate calculator →</a>
          </aside>
        </div>
      </section>

      <section className="tool-detail-section">
        <div className="shell">
          <div className="tool-section-heading">
            <p className="eyebrow">Pack with the calculation in mind</p>
            <h2>Small measuring habits can improve the estimate.</h2>
            <p>Use the finished parcel for every measurement. That gives the most useful view before the team confirms a service.</p>
          </div>
          <div className="tool-info-grid">
            {packingTips.map(([number, title, copy]) => (
              <article className="tool-info-card" key={number}>
                <span>{number}</span>
                <div className="tool-info-icon" aria-hidden="true">{number === "01" ? "□" : number === "02" ? "↔" : "kg"}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="weight-example-section">
        <div className="shell weight-example-grid">
          <div>
            <p className="eyebrow light">Worked example</p>
            <h2>When volume becomes the chargeable weight.</h2>
            <p>A packed box measuring 40 × 30 × 25 cm with an actual weight of 2.5 kg produces a volumetric weight of 6 kg using a 5000 divisor.</p>
          </div>
          <div className="weight-example-card">
            <div><small>ACTUAL</small><strong>2.50 kg</strong></div>
            <span>vs</span>
            <div><small>VOLUMETRIC</small><strong>6.00 kg</strong></div>
            <p><small>CHARGEABLE WEIGHT</small><strong>6.00 kg</strong></p>
          </div>
        </div>
      </section>
    </main>
  );
}
