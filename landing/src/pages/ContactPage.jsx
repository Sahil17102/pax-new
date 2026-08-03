export const metadata = {
  title: "Contact — Pax Logistics",
  description: "Contact Pax Logistics in Himayat Nagar, Hyderabad.",
};

export default function ContactPage() {
  return (
    <main id="main">
      <section className="page-hero contact-page-hero">
        <div className="shell narrow">
          <p className="eyebrow">Contact</p>
          <h1>Talk to a local shipping desk.</h1>
          <p className="lead">Call, email or visit us in Himayat Nagar. We will help you plan the next step.</p>
        </div>
      </section>

      <section className="section page-section contact-section">
        <div className="shell contact-layout">
          <div className="contact-list">
            <a href="tel:+919494338206"><small>Phone</small><strong>+91 94943 38206</strong><span>→</span></a>
            <a href="mailto:Saipratham650@gmail.com"><small>Email</small><strong>Saipratham650@gmail.com</strong><span>→</span></a>
            <a href="https://maps.google.com/?q=House+Number+3-6-105+Flat+Number+105+Himayat+Nagar+Hyderabad+Telangana+500029" target="_blank" rel="noreferrer"><small>Address</small><strong>House No. 3-6-105, Flat No. 105,<br />Himayat Nagar, Hyderabad, Telangana 500029, India</strong><span>↗</span></a>
          </div>
          <form className="form-card contact-form" id="contact-form">
            <div className="form-card-tag">Shipment enquiry</div>
            <h2>Send the basic details.</h2>
            <label>Your name<input id="contact-name" required placeholder="Name" /></label>
            <label>Phone number<input id="contact-phone" inputMode="tel" required placeholder="+91" /></label>
            <label>What do you need to send?<textarea id="contact-message" rows="4" required placeholder="Route, parcel and preferred date"></textarea></label>
            <p className="form-error" id="contact-error" role="alert"></p>
            <button className="button button-dark full-button" type="submit">Send shipment enquiry <span>→</span></button>
          </form>
        </div>
      </section>
    </main>
  );
}
