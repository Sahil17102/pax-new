import { Link } from "react-router-dom";
import { PageHero } from "../components/feather/PageScaffold";

function NotFoundPage() {
  return (
    <main className="pb-16">
      <PageHero
        eyebrow="404"
        title="This page drifted out of route coverage."
        description="The link you opened does not exist in the current Pax Logistics site map. You can head back to the home page or continue exploring the main sections."
        primaryAction={{ label: "Go home", to: "/" }}
        secondaryAction={{ label: "Track Shipment", to: "/tracking" }}
        stats={[
          { value: "4", label: "active pages" },
          { value: "1", label: "multi-page structure" },
          { value: "0", label: "dead ends intended" },
        ]}
        visualTitle="Route not found"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Link
          to="/tracking"
          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:-translate-y-0.5 hover:border-sky-200"
        >
          Open Tracking Page
        </Link>
      </div>
    </main>
  );
}

export default NotFoundPage;
