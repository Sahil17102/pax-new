import { Link } from "react-router-dom";
import Icon from "../components/feather/Icons";
import { Reveal } from "../components/feather/primitives";
import { companyProfile } from "../components/feather/siteData";
import { shippingTerms } from "../utils/shippingTerms";

function TermsAndConditionsPage() {
  return (
    <main className="bg-[#F5F8FC] pb-16">
      <section className="bg-[#041A38] px-5 py-14 text-white sm:px-8 sm:py-20 lg:px-16">
        <div className="mx-auto max-w-5xl">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-white/70 transition hover:text-white">
            <Icon name="chevronLeft" className="h-4 w-4" />
            Back to home
          </Link>
          <div className="mt-8 flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#ED1C24] text-white shadow-[0_14px_30px_rgba(237,28,36,0.24)]">
              <Icon name="shield" className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#F36673]">Pax Logistics Shipping Policy</p>
              <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-5xl">Shipping &amp; Courier Terms &amp; Conditions</h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-white/70">
                These conditions explain the basic responsibilities, timelines, charges, and courier policies that apply when using Pax Logistics shipping services.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 lg:px-16 lg:py-16">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-4 md:grid-cols-2">
            {shippingTerms.map((term, index) => (
              <Reveal key={term} delay={(index % 4) * 0.04}>
                <article className="flex h-full gap-4 rounded-xl border border-[#D6E1EF] bg-white p-5 shadow-[0_14px_36px_rgba(6,42,91,0.05)]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#FDE7EA] text-sm font-extrabold text-[#ED1C24]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="pt-1 text-sm font-medium leading-7 text-[#334155]">{term}</p>
                </article>
              </Reveal>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-[#D6E1EF] bg-[#EEF4FB] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[#061A33]">Need clarification before shipping?</h2>
              <p className="mt-2 text-sm leading-6 text-[#64748B]">Contact the Pax Logistics support team for help with a shipment or policy.</p>
            </div>
            <a
              href={`mailto:${companyProfile.email}`}
              className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#062A5B] px-5 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#123763] sm:mt-0"
              style={{ color: "#ffffff" }}
            >
              Contact Support
              <Icon name="chevronRight" className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

export default TermsAndConditionsPage;
