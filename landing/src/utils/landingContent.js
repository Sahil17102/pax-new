import { ADMIN_AUTH_URL, AUTH_APP_URL, CLIENT_APP_URL } from "./appLinks";

export const navigationLinks = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "Courier Network", href: "#network" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Tools", href: "#tools" },
  { label: "FAQ", href: "#faq" },
];

export const heroContent = {
  eyebrow: "Pax Logistics",
  headline: "Ship Smarter. Move Faster on Every Order.",
  subheading:
    "Turn the public Pax Logistics link into a polished front door for merchants, operations teams, and admins. From one landing experience, people can jump into the client app, merchant auth flow, or admin workspace in a clean new tab.",
  primaryCta: "Open Merchant Login",
  secondaryCta: "Open Client App",
  tertiaryCta: "Open Admin Panel",
  trustLine:
    "Built for fast-moving ecommerce teams that want a warm first impression and a frictionless path into the real product.",
};

export const heroQuickTools = [
  {
    icon: "calculator",
    title: "Shipping Cost Calculator",
    description: "Check the spend before your team books the shipment.",
    metric: "Live quote",
  },
  {
    icon: "comparison",
    title: "Courier Comparison",
    description: "Compare rate, speed, and coverage in one clean decision view.",
    metric: "6 partners",
  },
  {
    icon: "pincode",
    title: "Pincode Serviceability Check",
    description: "Validate a lane before the order moves into dispatch.",
    metric: "Instant check",
  },
];

export const heroHighlights = [
  { value: "6+", label: "Courier partners", visualTitle: "Courier Rate Comparison" },
  { value: "24/7", label: "Tracking visibility", visualTitle: "Real-Time Shipment Tracking" },
  { value: "3", label: "Launch paths", visualTitle: "Shipment Overview" },
];

export const courierPartners = [
  {
    name: "Delhivery",
    mark: "D",
    brandColor: "#0f172a",
    markAccent: "#e21b2d",
    accent: "#FFE9ED",
  },
  {
    name: "Blue Dart",
    mark: "BD",
    brandColor: "#1e6ab3",
    markAccent: "#f6c343",
    accent: "#FFF1D7",
  },
  {
    name: "DTDC",
    mark: "DT",
    brandColor: "#1d7f4f",
    markAccent: "#f5c84c",
    accent: "#EAF1FF",
  },
  {
    name: "Xpressbees",
    mark: "XB",
    brandColor: "#111827",
    markAccent: "#f59e0b",
    accent: "#FFF3E6",
  },
  {
    name: "Ecom Express",
    mark: "EX",
    brandColor: "#ffffff",
    markAccent: "#ef4444",
    accent: "#ECFFF1",
  },
  {
    name: "Shadowfax",
    mark: "SF",
    brandColor: "#07966f",
    markAccent: "#f7c948",
    accent: "#F0EDFF",
  },
];

export const problemPoints = [
  {
    title: "Too Many Courier Platforms",
    description: "Managing separate dashboards for each courier wastes valuable time.",
  },
  {
    title: "Unclear Shipping Costs",
    description:
      "Comparing courier prices manually makes it difficult to find the most cost-effective option.",
  },
  {
    title: "Limited Visibility on Deliveries",
    description:
      "Tracking shipments across different platforms leads to confusion and missed updates.",
  },
  {
    title: "No Data for Better Decisions",
    description:
      "Without proper analytics, it's hard to know which courier performs best for your business.",
  },
];

export const featureList = [
  {
    title: "Courier Rate Comparison",
    description:
      "Instantly compare shipping prices from multiple courier partners and choose the most cost-effective option.",
  },
  {
    title: "Automated Shipping Labels",
    description: "Generate shipping labels and schedule pickups in seconds without manual work.",
  },
  {
    title: "Real-Time Shipment Tracking",
    description:
      "Track every shipment from one dashboard and keep customers informed about delivery progress.",
  },
  {
    title: "Smart Courier Selection",
    description:
      "Automatically choose the best courier based on delivery speed, serviceability, and cost.",
  },
  {
    title: "Bulk Order Processing",
    description:
      "Upload and process multiple orders at once to save time during peak sales periods.",
  },
  {
    title: "COD Management",
    description:
      "Track cash-on-delivery payments and manage remittances with complete transparency.",
  },
];

export const workflowSteps = [
  {
    step: "Step 1",
    title: "Add Your Orders",
    description:
      "Import orders from your ecommerce store or upload them directly to the platform.",
  },
  {
    step: "Step 2",
    title: "Compare Courier Options",
    description:
      "View shipping rates, delivery timelines, and courier availability for each order.",
  },
  {
    step: "Step 3",
    title: "Generate Shipping Label",
    description: "Select the courier that works best and create your shipping label instantly.",
  },
  {
    step: "Step 4",
    title: "Track and Manage Deliveries",
    description:
      "Monitor shipment progress and delivery performance through a unified dashboard.",
  },
];

export const quickToolCards = [
  {
    icon: "calculator",
    title: "Shipping Cost Calculator",
    description:
      "Estimate rates using package weight, pickup pincode, and delivery pincode before you book.",
    stat: "Instant estimate",
  },
  {
    icon: "comparison",
    title: "Courier Comparison",
    description:
      "Review shipping prices, expected delivery timelines, and courier availability side by side.",
    stat: "Compare faster",
  },
  {
    icon: "pincode",
    title: "Pincode Serviceability Check",
    description:
      "Check if a courier can service a route before committing a shipment to that delivery partner.",
    stat: "Lane coverage",
  },
];

export const dashboardCapabilities = [
  {
    title: "Shipment Overview",
    description: "View all active and completed shipments in one organized dashboard.",
  },
  {
    title: "Courier Performance Analytics",
    description:
      "Compare delivery success rates and average delivery times across courier partners.",
  },
  {
    title: "Cost Tracking",
    description:
      "Understand how much you're spending on shipping and identify opportunities to reduce costs.",
  },
  {
    title: "Delivery Insights",
    description:
      "Track delivery performance across locations and improve operational efficiency.",
  },
];

export const shippingFields = [
  { key: "packageWeight", label: "Package Weight (kg)", placeholder: "0.5" },
  { key: "pickupPincode", label: "Pickup Pincode", placeholder: "110001" },
  { key: "deliveryPincode", label: "Delivery Pincode", placeholder: "400001" },
];

export const calculatorHighlights = [
  { label: "Estimated Cost", title: "Cost Tracking" },
  { label: "Shipping Zone", title: "Compare Courier Options" },
  { label: "Expected Delivery", title: "Track and Manage Deliveries" },
];

export const trackingStages = [
  {
    title: "Booked",
    description: "Your order has been confirmed and entered into the shipping queue.",
  },
  {
    title: "Pending Pickup",
    description: "Pickup is scheduled and the courier partner is preparing collection.",
  },
  {
    title: "In Transit",
    description: "The shipment is moving through the line-haul and sorting network.",
  },
  {
    title: "Out for Delivery",
    description: "The parcel is with the delivery executive and heading to the customer.",
  },
  {
    title: "Delivered",
    description: "Delivery is complete and the latest shipment status is updated instantly.",
  },
];

export const testimonials = [
  {
    quote:
      "Using this platform helped us reduce shipping costs while improving delivery reliability. Managing orders across couriers is now much easier.",
    author: "Ecommerce Store Owner",
  },
  {
    quote:
      "The courier comparison feature saves us hours every week. We can quickly choose the best delivery partner for every order.",
    author: "D2C Brand Founder",
  },
  {
    quote:
      "Having all shipment tracking in one dashboard has made logistics management far more efficient for our team.",
    author: "Online Marketplace Seller",
  },
];

export const faqItems = [
  {
    question: "Which courier partners are available on the platform?",
    answer:
      "We work with multiple trusted courier providers to give sellers a wide range of shipping options based on price, delivery time, and serviceability.",
  },
  {
    question: "Do I need a website or store integration to use the platform?",
    answer:
      "You can connect your ecommerce store or upload orders manually through the dashboard.",
  },
  {
    question: "How are shipping costs calculated?",
    answer:
      "Shipping rates depend on package weight, pickup and delivery locations, and the courier service selected.",
  },
  {
    question: "Can I track all shipments from one dashboard?",
    answer:
      "Yes. All shipments created through the platform can be tracked in real time from a centralized dashboard.",
  },
  {
    question: "Is there a minimum number of shipments required?",
    answer:
      "The platform is designed to support both small sellers and growing businesses without strict shipment limits.",
  },
];

export const footerGroups = [
  {
    title: "Launch",
    links: [
      { label: "Merchant Login", href: AUTH_APP_URL, external: true },
      { label: "Client App", href: CLIENT_APP_URL, external: true },
      { label: "Admin Panel", href: ADMIN_AUTH_URL, external: true },
      { label: "Shipping Calculator", href: "#calculator" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "Features", href: "#features" },
      { label: "Courier Network", href: "#network" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Useful Tools", href: "#tools" },
      { label: "Tracking Timeline", href: "#tracking" },
      { label: "Get Started", href: "#get-started" },
      { label: "Analytics", href: "#analytics" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "support@expressmagic.in", href: "mailto:support@expressmagic.in" },
      { label: "hello@expressmagic.in", href: "mailto:hello@expressmagic.in" },
      { label: "+91 92175 53934", href: "tel:+919217553934" },
      { label: "Mon-Sat, 9:00 AM to 7:00 PM", href: "#top" },
    ],
  },
];

export const footerMeta = {
  address:
    "A-1/4, Khodiyar Nagar Society near takshashila complex, Khodiyar Nagar road, Varachha, Surat - 395006",
  supportHours: "Mon-Sat, 9:00 AM to 7:00 PM",
  contactNumber: "+91 92175 53934",
};

export const mediaAssets = {
  hero: "https://images.pexels.com/photos/6170405/pexels-photo-6170405.jpeg?auto=compress&cs=tinysrgb&w=1600",
  network: "https://images.pexels.com/photos/6169643/pexels-photo-6169643.jpeg?auto=compress&cs=tinysrgb&w=1400",
  dashboard: "https://images.pexels.com/photos/5025635/pexels-photo-5025635.jpeg?auto=compress&cs=tinysrgb&w=1400",
};
