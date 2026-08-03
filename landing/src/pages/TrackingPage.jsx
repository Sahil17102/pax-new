import { Link } from "react-router-dom";
import trackingDashboardAnimation from "../assets/tracking-dashboard-animation.json";
import trackingDashboardImage from "../assets/tracking-dashboard-image-hd.webp";
import { PageHero } from "../components/feather/PageScaffold";
import { TrackingPanel } from "../components/feather/ToolCards";
import { Reveal, SectionHeading } from "../components/feather/primitives";

const stats = [
  { value: "24/7", label: "shipment visibility" },
  { value: "4", label: "tracking milestones" },
  { value: "1", label: "customer lookup flow" },
];

const trackingHeroAnimation = {
  ...trackingDashboardAnimation,
  assets: trackingDashboardAnimation.assets?.map((asset) =>
    asset.p?.endsWith(".webp") ? { ...asset, u: "", p: trackingDashboardImage } : asset
  ),
};

function TrackingPage() {
  return (
    <main className="pb-16">
      <PageHero
        eyebrow="Tracking"
        title="Give customers and internal teams a dedicated page for shipment status visibility."
        description="Check shipment movement, delivery milestones, and final-mile status from one clear Pax Logistics tracking view."
        primaryAction={{ label: "Use Rate Calculator", to: "/rate-calculator" }}
        secondaryAction={{ label: "Check Weight Calculator", to: "/volumetric-weight-calculator" }}
        stats={stats}
        visualTitle="Tracking experience preview"
        visualLabel="Tracking"
        visualAnimationData={trackingHeroAnimation}
      />

      <section className="section-transition mt-20 sm:mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <TrackingPanel />
        </div>
      </section>

      <section className="section-transition mt-20 sm:mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading
              eyebrow="Tracking Benefits"
              title="A separate tracking route helps support teams and customers get answers faster."
              description="Instead of searching through order threads or courier portals, this page gives visitors a direct path to view shipment movement and final-mile progress."
            />
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              "Lower support dependency for simple status checks.",
              "Give customers a clearer self-service experience.",
              "Create a stronger post-dispatch brand touchpoint.",
            ].map((item, index) => (
              <Reveal key={item} delay={0.05 * index}>
                <article className="surface-card rounded-[1.85rem] p-6">
                  <p className="font-display text-2xl text-slate-900">0{index + 1}</p>
                  <p className="mt-4 text-sm leading-7 text-slate-600">{item}</p>
                </article>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/volumetric-weight-calculator"
                className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,#8FD8FF_0%,#FFD8A8_100%)] px-6 py-3.5 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
              >
                Check Weight Calculator
              </Link>
              <Link
                to="/rate-calculator"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-sky-200"
              >
                Use rate calculator
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

export default TrackingPage;
