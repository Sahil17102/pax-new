export const navigation = [
  { label: "Home", href: "#home" },
  { label: "Flow", href: "#operations" },
  { label: "Modules", href: "#platform-modules" },
  { label: "Features", href: "#why-us" },
  { label: "Tools", href: "#shipping-tools" },
  { label: "FAQ", href: "#faq" },
];

export const heroStats = [
  { value: "1", label: "unified shipping console" },
  { value: "PAN India", label: "serviceability support" },
  { value: "24/7", label: "shipment visibility" },
];

export const operations = [
  {
    title: "Order intake",
    description:
      "Collect marketplace, website, WhatsApp, and manual orders into one organized dispatch queue.",
    icon: "inbox",
    detail: "A single source of truth for every shipment request.",
  },
  {
    title: "Smart allocation",
    description:
      "Route each shipment to the most suitable courier based on pin code, SLA, package profile, and cost.",
    icon: "route",
    detail: "Rules-driven allocation that removes guesswork from courier selection.",
  },
  {
    title: "Dispatch velocity",
    description:
      "Generate labels, organize manifests, and move pickups forward without switching between tools.",
    icon: "rocket",
    detail: "Faster handoff from order confirmation to ready-to-dispatch.",
  },
  {
    title: "Delivery confidence",
    description:
      "Stay ahead of delays with NDR handling, alerts, and clear delivery status tracking.",
    icon: "shield",
    detail: "Better post-dispatch control for customers and operators alike.",
  },
];

export const platformModules = [
  {
    title: "Unified booking desk",
    description:
      "Book, label, and manage shipments from a clean control layer built for daily operations teams.",
    icon: "layers",
    points: ["Central order queue", "Bulk dispatch workflow", "Label and manifest controls"],
    previewTitle: "Booking panel placeholder",
  },
  {
    title: "Courier intelligence layer",
    description:
      "Compare service options quickly and assign shipments with more confidence using rate and lane logic.",
    icon: "spark",
    points: ["Carrier recommendation view", "Rate comparison support", "Pin code and SLA checks"],
    previewTitle: "Allocation panel placeholder",
  },
  {
    title: "Exception recovery console",
    description:
      "Handle delivery exceptions, COD follow-up, and NDR actions from a single operational module.",
    icon: "refresh",
    points: ["NDR action list", "Retry and follow-up workflow", "Customer notification support"],
    previewTitle: "Recovery panel placeholder",
  },
];

export const featureGrid = [
  {
    title: "Lowest Rates",
    description: "Optimize shipping spend with multi-courier comparisons and smarter dispatch decisions.",
    icon: "wallet",
  },
  {
    title: "Instant Booking",
    description: "Move from order to label generation quickly with a workflow designed for speed.",
    icon: "bolt",
  },
  {
    title: "Analytics",
    description: "Track shipment patterns, operating performance, and dispatch trends in one place.",
    icon: "chart",
  },
  {
    title: "NDR Management",
    description: "Respond to delivery exceptions faster with structured follow-ups and status visibility.",
    icon: "shield",
  },
  {
    title: "Insurance",
    description: "Add a safer shipping layer for valuable consignments and fragile product categories.",
    icon: "lock",
  },
  {
    title: "PAN India Coverage",
    description: "Support wider serviceability with courier partners that help you ship across India.",
    icon: "globe",
  },
  {
    title: "COD",
    description: "Support cash-on-delivery flows while keeping order and remittance movement visible.",
    icon: "coins",
  },
  {
    title: "Notifications",
    description: "Keep customers and teams informed with timely booking, transit, and delivery updates.",
    icon: "bell",
  },
  {
    title: "API Integration",
    description: "Connect storefronts, ERPs, and internal systems with integration-ready shipping workflows.",
    icon: "api",
  },
];

export const snapshotStats = [
  { value: "1", label: "central dashboard", note: "One home for booking, monitoring, and exceptions." },
  { value: "4", label: "core workflow stages", note: "From intake to successful delivery follow-through." },
  { value: "9", label: "built-in capabilities", note: "Operational features shaped around shipping teams." },
  { value: "2", label: "estimation tools", note: "Quick helpers for volumetric and rate checks." },
];

export const analyticsCards = [
  {
    title: "Performance watchtower",
    description:
      "Track dispatch cadence, service consistency, and shipment volume patterns with clearer visibility.",
    icon: "chart",
    metrics: ["Daily dispatch pulse", "SLA trend markers", "Courier mix overview"],
  },
  {
    title: "NDR action insights",
    description:
      "See which delivery exceptions need attention first and focus teams on the highest priority recoveries.",
    icon: "refresh",
    metrics: ["Actionable exception list", "Retry status signals", "Customer follow-up cues"],
  },
  {
    title: "Cost intelligence",
    description:
      "Understand how weight, service level, and region affect estimated shipping cost before booking.",
    icon: "wallet",
    metrics: ["Zone-sensitive estimates", "Weight-based pricing logic", "Service mode comparison"],
  },
];

export const faqs = [
  {
    question: "What does a shipping aggregator help us manage?",
    answer:
      "It brings booking, courier selection, dispatch, and shipment tracking into one operational workflow so your team spends less time juggling separate tools.",
  },
  {
    question: "Can Pax Logistics support COD and delivery exception handling?",
    answer:
      "Yes. The home page highlights COD readiness and NDR-focused workflows so teams can stay on top of high-friction orders after dispatch.",
  },
  {
    question: "Is the platform suitable for both marketplaces and direct orders?",
    answer:
      "Yes. The intake flow is designed to accommodate website orders, marketplace demand, phone orders, and other manual channels in one queue.",
  },
  {
    question: "Do you provide coverage outside major cities?",
    answer:
      "The solution is positioned around PAN India coverage support, helping businesses serve wider pin-code networks through courier partners.",
  },
  {
    question: "Can this setup grow into a larger multi-page website later?",
    answer:
      "Yes. This home page is structured with reusable sections and shared content patterns so inner pages can be added cleanly in the next phase.",
  },
];

export const footerLinks = [
  { label: "Home", href: "#home" },
  { label: "Operations Flow", href: "#operations" },
  { label: "Platform Modules", href: "#platform-modules" },
  { label: "Why Choose Us", href: "#why-us" },
  { label: "Shipping Tools", href: "#shipping-tools" },
  { label: "FAQ", href: "#faq" },
];

export const rateZones = {
  local: 1,
  regional: 1.18,
  metro: 1.32,
  national: 1.54,
};

export const serviceModes = {
  standard: 1,
  express: 1.2,
  priority: 1.38,
};
