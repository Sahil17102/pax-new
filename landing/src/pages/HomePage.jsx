import { Fragment } from "react";

const services = [
  {
    tone: "card-coral",
    icon: "↗",
    title: "City courier",
    image: "/assets/pax-local-vans-v2.jpg",
    imageAlt: "Pax local delivery vans at a Hyderabad dispatch hub",
    tag: "Hyderabad pickup",
    description: "Documents and parcels across the city, coordinated through one local desk.",
    link: "/contact",
    linkText: "Plan a pickup",
    visual: "photo",
  },
  {
    tone: "card-yellow",
    icon: "□",
    title: "Live journey",
    description: "Follow the shipment stage with a simple reference and a clear status view.",
    link: "/track",
    linkText: "Track a shipment",
    visual: "tracking",
  },
  {
    tone: "card-green",
    icon: "₹",
    title: "Clear estimate",
    description: "Start with route, weight and speed before confirming the final service.",
    link: "/rate-calculator",
    linkText: "Check an estimate",
    visual: "estimate",
  },
  {
    tone: "card-purple",
    icon: "+",
    title: "Business dispatch",
    description: "Recurring pickup assistance for sellers, offices and growing teams.",
    link: "/contact",
    linkText: "Discuss your volume",
    visual: "dashboard",
  },
];

const values = [
  ["value-pink", "01", "person", "Talk to a person", "Call or email a Hyderabad-based contact when the shipment needs attention."],
  ["value-blue", "02", "estimate", "Start with clarity", "See a useful indicative range before you confirm the final service."],
  ["value-mint", "03", "tracking", "Know the stage", "A simple tracking journey keeps each major handoff understandable."],
  ["value-orange", "04", "growth", "Scale the support", "Move from one parcel to recurring business dispatch assistance."],
];

const platformCapabilities = [
  {
    label: "Convert",
    title: "Turn enquiries into confident bookings",
    copy: "Show useful service choices, delivery speeds and an indicative price before the sender commits. Clear information makes the next step easier.",
    link: "/rate-calculator",
    linkText: "Explore delivery estimates",
    visual: "options",
    tone: "platform-lilac",
  },
  {
    label: "Deliver",
    title: "Move parcels with less friction",
    copy: "Coordinate pickup, service selection and dispatch through one practical workflow built for documents, parcels and recurring business shipments.",
    link: "/services",
    linkText: "Discover delivery services",
    visual: "dispatch",
    tone: "platform-mint",
  },
  {
    label: "Track",
    title: "Cut queries, keep senders informed",
    copy: "Give every shipment a clear reference and an understandable journey. Useful milestone updates reduce uncertainty from pickup to delivery.",
    link: "/track",
    linkText: "Open shipment tracking",
    visual: "tracking",
    tone: "platform-sky",
  },
  {
    label: "Return",
    title: "Make the reverse journey simple",
    copy: "Plan returns with the same clarity as outbound shipping. Capture the reason, confirm the handover and keep the shipment reference connected.",
    link: "/contact",
    linkText: "Plan a return",
    visual: "returns",
    tone: "platform-peach",
  },
  {
    label: "Analyse",
    title: "Turn movement into useful decisions",
    copy: "Review shipment mix, route activity and delivery stages in one readable view. Use the pattern to plan future dispatches with more confidence.",
    link: "/contact",
    linkText: "Discuss business shipping",
    visual: "insights",
    tone: "platform-yellow",
  },
];

const faqs = [
  ["How do I get a final shipping price?", "Use the indicative estimator, then share parcel dimensions and exact route with our team for confirmation."],
  ["Can Pax help with recurring business pickups?", "Yes. Share your usual shipment count, routes and pickup schedule so the team can suggest a workable dispatch flow."],
  ["What do I need for tracking?", "A Pax shipment reference. The website includes a demo flow; live status requires the operations data connection."],
  ["Where is the Pax Logistics desk?", "House No. 3-6-105, Flat No. 105, Himayat Nagar, Hyderabad, Telangana 500029."],
];

const ecosystemItems = [
  ["SD", "Same-day"],
  ["EX", "Express parcel"],
  ["CC", "City cargo"],
  ["RF", "Road freight"],
  ["WH", "Warehousing"],
  ["LM", "Last mile"],
  ["RT", "Returns"],
  ["TR", "Live tracking"],
  ["COD", "Cash on delivery"],
  ["B2B", "Business shipping"],
  ["D2C", "E-commerce"],
  ["DOC", "Documents"],
  ["BLK", "Bulk dispatch"],
  ["DOM", "Domestic"],
  ["PKG", "Secure packing"],
  ["INS", "Shipment cover"],
  ["RTO", "Return to origin"],
  ["POD", "Proof of delivery"],
  ["WMS", "Warehouse flow"],
  ["OMS", "Order flow"],
  ["GPS", "Route visibility"],
  ["HUB", "Hub movement"],
  ["PU", "Doorstep pickup"],
  ["FRG", "Fragile care"],
  ["HYD", "Hyderabad"],
  ["AIR", "Airport desk"],
  ["ECO", "Economy"],
  ["PRI", "Priority"],
  ["INT", "Intercity"],
  ["SLA", "Timed delivery"],
];

const ecosystemRows = Array.from({ length: 6 }, (_, rowIndex) =>
  Array.from({ length: 12 }, (_, columnIndex) =>
    ecosystemItems[(rowIndex * 7 + columnIndex) % ecosystemItems.length]
  )
);

const ecosystemAccents = ["#dfe8ff", "#cbd8ff", "#b7c9ff", "#a7d8ee", "#d7e3f7", "#8faaf4"];

function ValueIcon({ type }) {
  if (type === "person") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="11" r="5"></circle>
        <path d="M7.5 27c.8-5 3.7-7.5 8.5-7.5s7.7 2.5 8.5 7.5"></path>
        <path d="M25 10.5a9.8 9.8 0 0 1 0 7"></path>
        <path d="M26 17.5h-3"></path>
      </svg>
    );
  }

  if (type === "estimate") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8 5h16v22H8z"></path>
        <path d="M12 11h8M12 16h3M12 21h3"></path>
        <path d="m19 20 2 2 4-5"></path>
      </svg>
    );
  }

  if (type === "tracking") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m7 10 9-5 9 5-9 5z"></path>
        <path d="M7 10v11l9 6 9-6V10M16 15v12"></path>
        <path d="M4 7h4M3 12h3M4 17h2"></path>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 25h20"></path>
      <path d="M8 22v-5h5v5M14 22v-9h5v9M20 22V8h5v14"></path>
      <path d="m8 11 6-5 5 3 7-6"></path>
      <path d="M21 3h5v5"></path>
    </svg>
  );
}

function PlatformVisual({ type }) {
  if (type === "options") {
    return (
      <div className="platform-ui platform-options-ui" aria-hidden="true">
        <div className="platform-window-head"><span>Delivery options</span><i>500029 → 400001</i></div>
        <div className="platform-option active"><span><b>Express</b><small>Priority movement</small></span><strong>1–2 days</strong></div>
        <div className="platform-option"><span><b>Standard</b><small>Balanced service</small></span><strong>3–5 days</strong></div>
        <div className="platform-option"><span><b>Economy</b><small>Budget first</small></span><strong>5–7 days</strong></div>
        <div className="platform-floating-card">
          <small>INDICATIVE RANGE</small>
          <strong>₹180 – ₹230</strong>
          <span>2 kg · Domestic</span>
        </div>
      </div>
    );
  }

  if (type === "dispatch") {
    return (
      <div className="platform-ui platform-dispatch-ui" aria-hidden="true">
        <div className="platform-window-head"><span>Dispatch board</span><i>Today</i></div>
        <div className="dispatch-summary">
          <div><small>READY</small><strong>08</strong></div>
          <div><small>IN TRANSIT</small><strong>12</strong></div>
          <div><small>DELIVERED</small><strong>26</strong></div>
        </div>
        <div className="dispatch-table">
          <div><span>PAX-260731</span><b>Express</b><i>Ready</i></div>
          <div><span>PAX-260728</span><b>Standard</b><i>Moving</i></div>
          <div><span>PAX-260724</span><b>Business</b><i>Collected</i></div>
        </div>
        <div className="dispatch-rule">✓ Route and weight checked</div>
      </div>
    );
  }

  if (type === "tracking") {
    return (
      <div className="platform-ui platform-tracking-ui" aria-hidden="true">
        <div className="platform-window-head"><span>PAX / TRACK</span><i>Live</i></div>
        <small>SHIPMENT PAX-260729</small>
        <h4>Moving to destination hub</h4>
        <div className="platform-track-line">
          <i className="done">✓</i><span></span><i className="done">✓</i><span></span><i className="active"></i><span></span><i></i>
        </div>
        <div className="platform-track-labels"><span>Booked</span><span>Pickup</span><span>Transit</span><span>Delivery</span></div>
        <div className="tracking-update-card"><small>LATEST UPDATE</small><strong>Shipment scanned at movement hub</strong><span>Today · 6:40 PM</span></div>
      </div>
    );
  }

  if (type === "returns") {
    return (
      <div className="platform-ui platform-returns-ui" aria-hidden="true">
        <div className="platform-window-head"><span>Return request</span><i>PAX-260712</i></div>
        <div className="return-product"><span>PX</span><div><small>PARCEL</small><strong>Business shipment</strong></div><b>2.4 kg</b></div>
        <div className="return-reasons">
          <span className="active">Address update</span><span>Sender recall</span><span>Other reason</span>
        </div>
        <div className="return-confirm">
          <div className="return-qr"><i></i><i></i><i></i><i></i><i></i></div>
          <div><small>RETURN HANDOVER</small><strong>Reference ready</strong><span>Keep this code with the parcel</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="platform-ui platform-insights-ui" aria-hidden="true">
      <div className="platform-window-head"><span>Shipment overview</span><i>30 days</i></div>
      <div className="insight-kpis">
        <div><small>TOTAL</small><strong>148</strong><span>shipments</span></div>
        <div><small>MOVING</small><strong>22</strong><span>in progress</span></div>
      </div>
      <div className="insight-chart">
        {[48, 68, 54, 82, 72, 91, 76, 88].map((height, index) => (
          <i style={{ "--bar-height": `${height}%` }} key={`${height}-${index}`}></i>
        ))}
      </div>
      <div className="insight-legend"><span><i></i>Parcel volume</span><b>Hyderabad dispatch view</b></div>
    </div>
  );
}

function ShippingEcosystemSection() {
  return (
    <section className="shipping-ecosystem" aria-labelledby="ecosystem-title">
      <div className="ecosystem-wall" aria-hidden="true">
        {ecosystemRows.map((row, rowIndex) => (
          <div className="ecosystem-row" key={`ecosystem-row-${rowIndex}`}>
            <div className="ecosystem-row-track">
              {[0, 1].map((setIndex) => (
                <div className="ecosystem-row-set" key={`ecosystem-set-${rowIndex}-${setIndex}`}>
                  {row.map(([code, label], tileIndex) => {
                    const accent = ecosystemAccents[(rowIndex * 3 + tileIndex) % ecosystemAccents.length];
                    const isAccent = (rowIndex + tileIndex) % 9 === 4;
                    return (
                      <div
                        className={`ecosystem-tile${isAccent ? " ecosystem-tile--accent" : ""}`}
                        style={{ "--tile-accent": accent }}
                        key={`${setIndex}-${code}-${tileIndex}`}
                      >
                        <span>{code}</span>
                        <strong>{label}</strong>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ecosystem-shade" aria-hidden="true"></div>
      <div className="shell ecosystem-content">
        <p className="eyebrow light">One coordinated network</p>
        <h2 id="ecosystem-title">
          Your entire shipping journey.
          <span>All in one place.</span>
        </h2>
        <p>
          From booking and doorstep pickup to hub movement, delivery and returns,
          Pax keeps every important stage connected through one local logistics team.
        </p>
        <a className="ecosystem-cta" href="/services">
          <span>Explore shipping services</span>
          <i aria-hidden="true">→</i>
        </a>
      </div>
    </section>
  );
}

function ServiceVisual({ service }) {
  if (service.visual === "photo") {
    return (
      <div className="solution-visual photo-visual">
        <img src={service.image} alt={service.imageAlt} />
        <span className="photo-tag">{service.tag}</span>
      </div>
    );
  }

  if (service.visual === "tracking") {
    return (
      <div className="solution-visual mockup-visual">
        <div className="phone-mockup">
          <div className="phone-top"><i></i><span>PAX SHIPMENT</span><b>•••</b></div>
          <div className="phone-body">
            <span className="tiny-label">REFERENCE</span>
            <strong>PAX-260729</strong>
            <div className="phone-progress">
              <i className="done"></i><span></span><i className="done"></i><span></span><i className="active"></i><span></span><i></i>
            </div>
            <div className="phone-update"><small>Latest update</small><b>Moving to delivery hub</b></div>
          </div>
        </div>
        <span className="float-bubble bubble-one">Picked up ✓</span>
        <span className="float-bubble bubble-two">In transit</span>
      </div>
    );
  }

  if (service.visual === "estimate") {
    return (
      <div className="solution-visual quote-visual">
        <div className="route-chip"><span>500029</span><i>→</i><span>400001</span></div>
        <div className="quote-panel">
          <small>INDICATIVE RANGE</small>
          <strong>₹180 – ₹230</strong>
          <div><span>Standard</span><b>2 kg</b></div>
          <div><span>Pickup</span><b>Himayat Nagar</b></div>
          <button type="button">Review option</button>
        </div>
      </div>
    );
  }

  return (
    <div className="solution-visual dashboard-visual">
      <div className="dash-head"><span>Dispatch board</span><i>July</i></div>
      <div className="dash-chart">
        {["38%", "65%", "48%", "82%", "70%", "92%"].map((height) => (
          <span key={height} style={{ "--h": height }}></span>
        ))}
      </div>
      <div className="dash-rows"><span>Ready for pickup <b>08</b></span><span>In movement <b>12</b></span></div>
    </div>
  );
}

export default function PaxLogisticsHome() {
  return (
    <main id="main">
      <section className="reference-hero">
        <div className="reference-hero-glow reference-glow-left" aria-hidden="true"></div>
        <div className="reference-hero-glow reference-glow-right" aria-hidden="true"></div>
        <div className="reference-route-pattern" aria-hidden="true">
          <svg viewBox="0 0 1440 650" preserveAspectRatio="none">
            <defs>
              <pattern id="hero-dot-grid" width="34" height="34" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.35"></circle>
              </pattern>
            </defs>
            <rect width="1440" height="650" fill="url(#hero-dot-grid)"></rect>
            <g className="reference-route-lines">
              <path d="M-80 490 C150 360 245 540 450 408 S760 245 985 356 1260 500 1510 315"></path>
              <path d="M70 88 C270 210 365 135 535 205 S820 345 1070 198 1310 88 1500 172"></path>
              <path d="M190 670 C280 520 390 515 510 560 S770 670 925 525 1170 418 1485 555"></path>
            </g>
            <g className="reference-route-nodes">
              <circle cx="184" cy="428" r="6"></circle>
              <circle cx="450" cy="408" r="6"></circle>
              <circle cx="742" cy="276" r="6"></circle>
              <circle cx="985" cy="356" r="6"></circle>
              <circle cx="1250" cy="455" r="6"></circle>
              <circle cx="535" cy="205" r="5"></circle>
              <circle cx="1070" cy="198" r="5"></circle>
            </g>
          </svg>
        </div>

        <div className="shell reference-hero-grid">
          <div className="reference-hero-copy">
            <p className="reference-kicker"><span>✦</span> Hyderabad courier network</p>
            <h1>
              Smarter Deliveries.
              <span>Built For India.</span>
            </h1>
            <p>
              Same-day Hyderabad delivery, dependable intercity shipping and clear
              tracking—coordinated through one responsive local team.
            </p>
            <div className="reference-actions">
              <a className="button reference-primary" href="/services">
                Our Solutions <span aria-hidden="true">↗</span>
              </a>
              <a className="button reference-secondary" href="/contact">
                Contact Us <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="reference-proof">
              <span className="reference-proof-icon">✓</span>
              <span><strong>Hyderabad based</strong><small>Local support, nationwide reach</small></span>
            </div>
          </div>

          <div className="reference-collage" aria-label="Pax domestic logistics network across local delivery, road transport, parcel sorting and warehousing">
            <div className="reference-tile reference-tile--warehouse">
              <img src="/assets/pax-domestic-sort-v2.jpg" alt="Automated parcel sorting at a domestic courier hub" />
            </div>
            <div className="reference-tile reference-tile--air">
              <img src="/assets/pax-local-vans-v2.jpg" alt="Local courier vans at a Hyderabad delivery hub" />
            </div>
            <div className="reference-tile reference-tile--courier">
              <img src="/assets/pax-smart-warehouse-v2.jpg" alt="People-free automated warehouse system" />
            </div>
            <div className="reference-tile reference-tile--delivery">
              <img src="/assets/pax-intercity-truck-v2.jpg" alt="Domestic cargo truck on an Indian expressway" />
            </div>
            <div className="reference-tile reference-tile--core" aria-hidden="true">
              <span>PAX</span>
              <small>CONNECTED</small>
            </div>
            <div className="reference-live-pill" aria-hidden="true">
              <span></span> Network active
            </div>
          </div>
        </div>

        <div className="shell reference-feature-strip" aria-label="Pax logistics services">
          <a href="/services">
            <span className="reference-feature-icon">↗</span>
            <span><strong>Same-day Delivery</strong><small>Fast pickups across Hyderabad</small></span>
            <i>›</i>
          </a>
          <a href="/services">
            <span className="reference-feature-icon">▦</span>
            <span><strong>Warehousing</strong><small>Secure, scalable and smart warehouses</small></span>
            <i>›</i>
          </a>
          <a href="/services">
            <span className="reference-feature-icon">✓</span>
            <span><strong>Intercity Shipping</strong><small>Reliable movement across India</small></span>
            <i>›</i>
          </a>
          <a href="/track">
            <span className="reference-feature-icon">⌁</span>
            <span><strong>Live Shipment Tech</strong><small>Clear tracking at every handoff</small></span>
            <i>›</i>
          </a>
        </div>
      </section>

      <section className="section solutions-section">
        <div className="wide-shell">
          <div className="big-heading centre reveal">
            <p className="eyebrow">One logistics desk. Four ways to move.</p>
            <h2>Choose what your shipment needs.</h2>
            <p>Fast when it is urgent. Practical when budget matters. Flexible when your business grows.</p>
          </div>
          <div className="colour-card-rail">
            {services.map((service) => (
              <article className={`solution-card ${service.tone} reveal`} key={service.title}>
                <header><span className="round-glyph">{service.icon}</span><h3>{service.title}</h3></header>
                <ServiceVisual service={service} />
                <div className="solution-copy">
                  <p>{service.description}</p>
                  <a href={service.link}>{service.linkText} <span>→</span></a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section estimate-band">
        <div className="shell estimate-band-grid">
          <div className="band-copy reveal">
            <p className="eyebrow light">Quick estimate</p>
            <h2>Price the route before you book.</h2>
            <p>Enter two PIN codes and a few parcel details. Get an indicative range in under a minute.</p>
          </div>
          <form className="quick-rate-card reveal" id="home-rate-form" noValidate>
            <div className="quick-rate-row">
              <label>Pickup PIN<input id="home-pickup-pin" inputMode="numeric" maxLength="6" placeholder="500029" /></label>
              <span>→</span>
              <label>Delivery PIN<input id="home-delivery-pin" inputMode="numeric" maxLength="6" placeholder="400001" /></label>
            </div>
            <div className="quick-rate-footer">
              <p><small>Need full details?</small><strong>Use our estimate calculator</strong></p>
              <button className="button button-coral" type="submit">Continue <span>→</span></button>
            </div>
            <p className="form-error" id="home-rate-error" role="alert"></p>
          </form>
        </div>
      </section>

      <section className="journey-section section">
        <div className="wide-shell">
          <div className="big-heading centre reveal">
            <p className="eyebrow">A connected shipping journey</p>
            <h2>From “send” to safely received.</h2>
          </div>
          <div className="journey-board reveal">
            <div className="journey-head">
              <div className="active"><span>01</span><strong>Book</strong><small>Shipment details</small></div>
              <div><span>02</span><strong>Pickup</strong><small>Handover planned</small></div>
              <div><span>03</span><strong>Move</strong><small>Route in progress</small></div>
              <div><span>04</span><strong>Deliver</strong><small>Final confirmation</small></div>
            </div>
            <div className="journey-track">
              <div className="track-bar book"><span>Route</span><span>Weight</span><span>Speed</span></div>
              <div className="track-bar pickup"><span>Ready</span><span>Collected</span></div>
              <div className="track-bar movement"><span>Origin hub</span><span>In transit</span><span>Destination hub</span></div>
              <div className="track-bar delivery"><span>Out for delivery</span><span>Received</span></div>
            </div>
            <div className="journey-loop"><span>Clear communication across every handoff</span></div>
          </div>
        </div>
      </section>

      <section className="operations-section section">
        <div className="shell">
          <div className="operations-copy reveal">
            <p className="eyebrow light">Operations & coordination</p>
            <h2>Built around the work behind every parcel.</h2>
            <p>Pickup, scan, sort, route and delivery—connected by a team you can reach.</p>
            <a className="button button-white" href="/services">Explore services <span>→</span></a>
          </div>
          <div className="operations-photo reveal">
            <img src="/assets/pax-smart-warehouse-v2.jpg" alt="Automated parcel handling inside a smart warehouse" />
            <div className="photo-overlay"></div>
            <div className="ops-metrics">
              <div><small>01</small><strong>One local desk</strong><span>Direct support</span></div>
              <div><small>02</small><strong>Four movement types</strong><span>Matched to the job</span></div>
              <div><small>03</small><strong>Clear handoffs</strong><span>Useful updates</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="delivery-platform-section">
        <div className="shell platform-intro reveal">
          <p className="eyebrow">Pax delivery coordination</p>
          <h2>One connected workflow for every parcel decision.</h2>
          <p>
            Bring estimates, pickup planning, movement updates, returns and shipment insight
            into one clear experience—so each delivery decision is faster and easier to understand.
          </p>
          <a className="button platform-primary-button" href="/services">Explore the platform <span>→</span></a>
        </div>

        <div className="platform-audience">
          <div className="shell">
            <p>Designed for the teams that keep Hyderabad moving</p>
            <div className="platform-audience-list" aria-label="Teams served by Pax Logistics">
              {["Local sellers", "E-commerce teams", "Retail stores", "Growing offices", "D2C businesses", "Marketplace dispatch"].map((item, index) => (
                <span key={item}><i>{String(index + 1).padStart(2, "0")}</i>{item}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="shell platform-section-heading reveal">
          <p className="eyebrow">Connected courier capabilities</p>
          <h2>Elevate every stage of the delivery experience.</h2>
          <p>
            Use clear choices, coordinated workflows and practical shipment views to improve
            every touchpoint—from the first estimate to the final handover.
          </p>
        </div>

        <div className="platform-capability-list">
          {platformCapabilities.slice(0, 3).map((capability, index) => (
            <Fragment key={capability.label}>
              <article className={`platform-capability ${capability.tone}${index % 2 ? " platform-capability-reverse platform-capability-alt" : ""}`}>
                <div className="shell platform-capability-grid">
                  <div className="platform-capability-copy reveal">
                    <p className="platform-label">{capability.label}</p>
                    <h3>{capability.title}</h3>
                    <p>{capability.copy}</p>
                    <a href={capability.link}>{capability.linkText} <span>→</span></a>
                  </div>
                  <div className="platform-visual-shell reveal">
                    <PlatformVisual type={capability.visual} />
                  </div>
                </div>
              </article>
              {index === 2 ? <ShippingEcosystemSection /> : null}
            </Fragment>
          ))}
        </div>

      </section>

      <section className="section value-section">
        <div className="shell value-grid">
          <div className="value-heading reveal">
            <p className="eyebrow">Why Pax</p>
            <h2>Logistics without the runaround.</h2>
            <p>Useful choices, direct contact and no unnecessary complexity.</p>
          </div>
          <div className="value-cards">
            {values.map(([tone, number, icon, title, copy]) => (
              <article className={`value-card ${tone} reveal`} key={number}>
                <div className="value-card-top">
                  <span>{number}</span>
                  <div className="value-card-icon"><ValueIcon type={icon} /></div>
                </div>
                <div className="value-card-copy">
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="shell faq-grid">
          <div className="faq-heading reveal">
            <p className="eyebrow">Common questions</p>
            <h2>A few things worth knowing.</h2>
            <p>Need something more specific? Call the team directly.</p>
            <a className="text-link" href="tel:+919494338206">+91 94943 38206</a>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <article className="faq-item reveal" key={question}>
                <button type="button" aria-expanded="false"><span>{question}</span><i>+</i></button>
                <div><p>{answer}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}
