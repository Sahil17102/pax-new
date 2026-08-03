import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useMotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import trackingDashboardImage from "../../assets/tracking-dashboard-image-hd.webp";
import volumetricCalculatorImage from "../../assets/volumetric-calculator-hd.webp";
import heroWarehouseVisual from "../../assets/express-magic-warehouse-hero.webp";
import { AUTH_APP_URL } from "../../utils/appLinks";
import Icon from "./Icons";
import { companyProfile } from "./siteData";
import { Reveal } from "./primitives";

const MotionArticle = motion.article;
const MotionAnchor = motion.a;
const MotionButton = motion.button;
const MotionDiv = motion.div;
const MotionSpan = motion.span;

const primaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-4 rounded-lg bg-[#062A5B] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(6,42,91,0.18)] transition hover:-translate-y-0.5 hover:bg-[#123763] sm:w-auto";

const heroProofItems = [
  { label: "Live routing", value: "27+ carriers", icon: "route" },
  { label: "Dispatch ready", value: "labels + manifests", icon: "package" },
  { label: "Ops support", value: "onboarding help", icon: "headset" },
];

const heroFeatureCards = [
  {
    title: "Smart Dispatch",
    description: "Automate courier choice and reduce manual effort.",
    icon: "package",
    shell: "bg-[#FDE7EA] text-[#ED1C24]",
  },
  {
    title: "Real-time Tracking",
    description: "Track every shipment with live movement clarity.",
    icon: "mapPin",
    shell: "bg-[#E7F1FF] text-[#2563EB]",
  },
  {
    title: "Exception Management",
    description: "Spot issues early and resolve them faster.",
    icon: "shield",
    shell: "bg-[#E5FAF3] text-[#0F9F73]",
  },
  {
    title: "Performance Analytics",
    description: "See courier, cost, and delivery performance at a glance.",
    icon: "barChart",
    shell: "bg-[#F1E7FF] text-[#7C3AED]",
  },
];

const shippingTools = [
  {
    label: "01 / TRACK",
    title: "Shipment tracking",
    description: "See live courier scans, delivery milestones, and exceptions from one clean timeline.",
    href: "/tracking",
    action: "Track a shipment",
    icon: "mapPin",
    image: trackingDashboardImage,
    imageAlt: "Pax Logistics live shipment tracking dashboard",
  },
  {
    label: "02 / MEASURE",
    title: "Weight calculator",
    description: "Calculate volumetric weight before booking and prevent avoidable billing adjustments.",
    href: "/volumetric-weight-calculator",
    action: "Calculate weight",
    icon: "calculator",
    image: volumetricCalculatorImage,
    imageAlt: "Pax Logistics volumetric weight calculator",
  },
  {
    label: "03 / COMPARE",
    title: "Shipping rate calculator",
    description: "Compare price, service mode, and delivery confidence before every dispatch.",
    href: "/rate-calculator",
    action: "Compare rates",
    icon: "wallet",
  },
];

const scaleStats = [
  {
    value: "25M+",
    label: "Shipments Delivered",
    icon: "package",
    tone: "text-[#2563EB]",
    shell: "bg-[#E7F1FF]",
  },
  {
    value: "98.6%",
    label: "On-time Delivery",
    icon: "pieChart",
    tone: "text-[#10B981]",
    shell: "bg-[#E6FAF2]",
  },
  {
    value: "27K+",
    label: "Happy Clients",
    icon: "users",
    tone: "text-[#F97316]",
    shell: "bg-[#FFF0E4]",
  },
];

const whyChooseCards = [
  {
    title: "Multiple Couriers",
    description: "Access top courier partners worldwide from a single platform.",
    icon: "users",
    tone: "teal",
  },
  {
    title: "Easy Integration",
    description: "Integrate once and connect with all supported couriers seamlessly.",
    icon: "gear",
    tone: "orange",
  },
  {
    title: "Real-time Tracking",
    description: "Track shipments in real-time and keep your customers informed.",
    icon: "barChart",
    tone: "teal",
  },
  {
    title: "Save Time & Money",
    description: "Automate shipping processes and get the best rates effortlessly.",
    icon: "pieChart",
    tone: "orange",
  },
];

const featureShowcaseItems = [
  {
    title: "Unified Dashboard",
    tabDescription: "All your shipping data, in one place.",
    icon: "barChart",
    number: "01",
    description: "Manage all shipments, carriers, and performance metrics from a single, intuitive dashboard.",
    bullets: [
      "View all shipments and statuses in real-time",
      "Monitor delivery performance and KPIs",
      "Centralize operations across all locations",
      "Custom filters, saved views, and exports",
    ],
    metrics: [
      {
        label: "Total Shipments",
        value: "2,458",
        change: "+12.5%",
        icon: "package",
        tone: "teal",
      },
      {
        label: "In Transit",
        value: "1,245",
        change: "+8.7%",
        icon: "truck",
        tone: "teal",
      },
      {
        label: "Delivered",
        value: "1,150",
        change: "+15.2%",
        icon: "checkCircle",
        tone: "teal",
      },
      {
        label: "Exceptions",
        value: "63",
        change: "-4.3%",
        icon: "alertTriangle",
        tone: "orange",
      },
    ],
    lineA: "M8 126 L54 102 L96 102 L140 54 L184 86 L228 74 L272 78 L316 58 L360 68 L404 34 L448 54 L492 36",
    lineB: "M8 142 L54 126 L96 114 L140 88 L184 108 L228 94 L272 88 L316 96 L360 94 L404 78 L448 90 L492 72",
    status: [
      { label: "Delivered", value: "46%", color: "#062A5B" },
      { label: "In Transit", value: "30%", color: "#0f9aa4" },
      { label: "Pending", value: "10%", color: "#ED1C24" },
      { label: "Exception", value: "14%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Multiple Carrier Access",
    tabDescription: "Connect with top global carriers instantly.",
    icon: "truck",
    number: "02",
    description: "Compare and ship through trusted courier partners without switching between separate portals.",
    bullets: [
      "Connect Delhivery, Blue Dart, DTDC, XpressBees and more",
      "Compare serviceability, speed, and rates before dispatch",
      "Assign carriers by lane, weight, COD, and delivery priority",
      "Scale carrier coverage as your order volume grows",
    ],
    metrics: [
      {
        label: "Courier Partners",
        value: "27+",
        change: "+6 live",
        icon: "truck",
        tone: "teal",
      },
      {
        label: "Pin Codes",
        value: "29K+",
        change: "+18%",
        icon: "mapPin",
        tone: "teal",
      },
      {
        label: "Best Match",
        value: "94%",
        change: "+11.8%",
        icon: "checkCircle",
        tone: "teal",
      },
      {
        label: "Manual Checks",
        value: "0",
        change: "-100%",
        icon: "refresh",
        tone: "orange",
      },
    ],
    lineA: "M8 116 L54 96 L96 84 L140 78 L184 60 L228 54 L272 48 L316 42 L360 36 L404 30 L448 28 L492 24",
    lineB: "M8 136 L54 130 L96 116 L140 104 L184 96 L228 82 L272 74 L316 70 L360 62 L404 52 L448 48 L492 42",
    status: [
      { label: "Express", value: "38%", color: "#062A5B" },
      { label: "Standard", value: "34%", color: "#0f9aa4" },
      { label: "Economy", value: "18%", color: "#ED1C24" },
      { label: "Special", value: "10%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Real-time Tracking",
    tabDescription: "Track every shipment in real-time.",
    icon: "mapPin",
    number: "03",
    description: "Track courier movement, milestone updates, and delivery exceptions from one live timeline.",
    bullets: [
      "Sync shipment milestones from booking to delivery",
      "Share customer-ready tracking updates automatically",
      "Spot stuck shipments and exceptions earlier",
      "Give support teams one clear status source",
    ],
    metrics: [
      {
        label: "Live Updates",
        value: "24/7",
        change: "always on",
        icon: "clock",
        tone: "teal",
      },
      {
        label: "In Transit",
        value: "1,082",
        change: "+9.1%",
        icon: "truck",
        tone: "teal",
      },
      {
        label: "Delivered",
        value: "934",
        change: "+13.4%",
        icon: "checkCircle",
        tone: "teal",
      },
      {
        label: "Attention",
        value: "41",
        change: "-5.8%",
        icon: "alertTriangle",
        tone: "orange",
      },
    ],
    lineA: "M8 132 L54 120 L96 94 L140 102 L184 70 L228 72 L272 56 L316 64 L360 48 L404 42 L448 44 L492 28",
    lineB: "M8 144 L54 132 L96 126 L140 112 L184 104 L228 96 L272 90 L316 82 L360 78 L404 70 L448 64 L492 56",
    status: [
      { label: "Delivered", value: "51%", color: "#062A5B" },
      { label: "Moving", value: "29%", color: "#0f9aa4" },
      { label: "Pending", value: "12%", color: "#ED1C24" },
      { label: "NDR", value: "8%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Automated Workflows",
    tabDescription: "Save time with smart automation.",
    icon: "gear",
    number: "04",
    description: "Automate repetitive shipping tasks so teams can process orders faster with fewer errors.",
    bullets: [
      "Auto-generate labels, manifests, and AWB updates",
      "Trigger courier rules based on business preferences",
      "Reduce manual task load during peak order cycles",
      "Keep customers notified without repetitive follow-up",
    ],
    metrics: [
      {
        label: "Labels Created",
        value: "8,420",
        change: "+21.5%",
        icon: "package",
        tone: "teal",
      },
      {
        label: "Rules Active",
        value: "36",
        change: "+12",
        icon: "gear",
        tone: "teal",
      },
      {
        label: "Hours Saved",
        value: "128",
        change: "+18.2%",
        icon: "clock",
        tone: "teal",
      },
      {
        label: "Manual Errors",
        value: "9",
        change: "-42%",
        icon: "alertTriangle",
        tone: "orange",
      },
    ],
    lineA: "M8 118 L54 100 L96 92 L140 76 L184 82 L228 62 L272 58 L316 44 L360 42 L404 32 L448 30 L492 22",
    lineB: "M8 142 L54 132 L96 120 L140 112 L184 104 L228 92 L272 86 L316 78 L360 70 L404 64 L448 58 L492 50",
    status: [
      { label: "Auto Labels", value: "42%", color: "#062A5B" },
      { label: "Rules", value: "28%", color: "#0f9aa4" },
      { label: "Alerts", value: "18%", color: "#ED1C24" },
      { label: "Manual", value: "12%", color: "#ef4b3f" },
    ],
  },
  {
    title: "Smart Analytics",
    tabDescription: "Make data-driven decisions with insights that matter.",
    icon: "pieChart",
    number: "05",
    description: "Understand cost, delivery performance, and courier reliability with clean operational insights.",
    bullets: [
      "Review courier cost trends and lane performance",
      "Track COD, RTO, and exception patterns",
      "Identify the best courier mix by business goal",
      "Export insights for leadership and operations reviews",
    ],
    metrics: [
      {
        label: "Cost Savings",
        value: "18%",
        change: "+7.2%",
        icon: "coins",
        tone: "teal",
      },
      {
        label: "Reports",
        value: "42",
        change: "+8",
        icon: "barChart",
        tone: "teal",
      },
      {
        label: "Best Lanes",
        value: "214",
        change: "+15%",
        icon: "route",
        tone: "teal",
      },
      {
        label: "RTO Risk",
        value: "6.8%",
        change: "-3.1%",
        icon: "alertTriangle",
        tone: "orange",
      },
    ],
    lineA: "M8 134 L54 112 L96 118 L140 82 L184 74 L228 90 L272 62 L316 66 L360 44 L404 50 L448 36 L492 24",
    lineB: "M8 146 L54 138 L96 126 L140 116 L184 108 L228 98 L272 92 L316 86 L360 76 L404 72 L448 66 L492 58",
    status: [
      { label: "Profitable", value: "44%", color: "#062A5B" },
      { label: "Stable", value: "31%", color: "#0f9aa4" },
      { label: "Watch", value: "15%", color: "#ED1C24" },
      { label: "Risk", value: "10%", color: "#ef4b3f" },
    ],
  },
];

const featureSupportItems = [
  {
    title: "Secure & Reliable",
    description: "Enterprise-grade security to keep your data safe.",
    icon: "shield",
  },
  {
    title: "Scalable Platform",
    description: "Built to grow with your business, anywhere.",
    icon: "layers",
  },
  {
    title: "Global Reach",
    description: "Ship to 220+ countries with local expertise.",
    icon: "globe",
  },
  {
    title: "Expert Support",
    description: "Get help from real people, whenever you need it.",
    icon: "headset",
  },
];

const testimonialSlides = [
  [
    {
      quote:
        "Pax Logistics has completely transformed our shipping operations. One integration, multiple carriers, and real-time tracking - everything just works.",
      name: "James Carter",
      role: "Operations Manager, TrendyMart",
      brand: "TrendyMart",
      brandIcon: "shoppingBag",
      avatar: "https://i.pravatar.cc/96?img=12",
    },
    {
      quote:
        "The platform is easy to use, reliable, and the support team is outstanding. It has helped us reduce shipping costs and deliver a better experience to our customers.",
      name: "Sarah Lee",
      role: "CEO, LuxeHome",
      brand: "LuxeHome",
      brandIcon: "store",
      avatar: "https://i.pravatar.cc/96?img=47",
    },
    {
      quote: "From API integration to everyday shipments, Pax Logistics makes global shipping simple and scalable. Highly recommended!",
      name: "Michael Brown",
      role: "Co-founder, GearUp",
      brand: "GearUp",
      brandIcon: "spark",
      avatar: "https://i.pravatar.cc/96?img=68",
    },
  ],
  [
    {
      quote:
        "Our team now manages courier allocation, tracking, and exceptions from one clean dashboard. It saves hours every week and keeps customers informed.",
      name: "Aisha Mehta",
      role: "Logistics Lead, UrbanNest",
      brand: "UrbanNest",
      brandIcon: "store",
      avatar: "https://i.pravatar.cc/96?img=32",
    },
    {
      quote:
        "Pax Logistics helped us bring order volume, carrier performance, and cost visibility into one place. The workflow feels built for scaling brands.",
      name: "Ravi Kapoor",
      role: "Founder, QuickCart",
      brand: "QuickCart",
      brandIcon: "shoppingBag",
      avatar: "https://i.pravatar.cc/96?img=15",
    },
    {
      quote:
        "The real-time shipment updates and automated workflows have improved our delivery experience. Our support tickets are down and dispatch is smoother.",
      name: "Priya Nair",
      role: "Customer Experience Head, Glowly",
      brand: "Glowly",
      brandIcon: "star",
      avatar: "https://i.pravatar.cc/96?img=44",
    },
  ],
  [
    {
      quote:
        "We needed a shipping platform that could grow with us. Pax Logistics gave us carrier access, tracking visibility, and a reliable operating rhythm.",
      name: "Daniel Evans",
      role: "COO, CraftLane",
      brand: "CraftLane",
      brandIcon: "package",
      avatar: "https://i.pravatar.cc/96?img=11",
    },
    {
      quote:
        "The dashboard is practical, fast, and easy for our team to learn. We can compare courier options and move orders forward with much less friction.",
      name: "Neha Shah",
      role: "Director, FreshBox",
      brand: "FreshBox",
      brandIcon: "layers",
      avatar: "https://i.pravatar.cc/96?img=49",
    },
    {
      quote:
        "Pax Logistics makes shipping decisions clearer. The analytics helped us understand which lanes, couriers, and service levels work best.",
      name: "Omar Khan",
      role: "Growth Manager, ModeHaus",
      brand: "ModeHaus",
      brandIcon: "barChart",
      avatar: "https://i.pravatar.cc/96?img=59",
    },
  ],
];

const testimonialStats = [
  {
    value: "10,000+",
    label: "Businesses Trust Us",
    icon: "users",
  },
  {
    value: "2M+",
    label: "Shipments Delivered",
    icon: "package",
  },
  {
    value: "220+",
    label: "Countries Reached",
    icon: "globe",
  },
  {
    value: "99.8%",
    label: "Customer Satisfaction",
    icon: "star",
  },
];

const faqItems = [
  {
    question: "What is Pax Logistics?",
    answer:
      "Pax Logistics is an all-in-one shipping platform that connects you with multiple courier partners through a single integration. It helps businesses simplify shipping, save time and money, and deliver a better customer experience.",
  },
  {
    question: "Which couriers are integrated with Pax Logistics?",
    answer:
      "Pax Logistics supports leading courier partners including Delhivery, Blue Dart, DTDC, XpressBees, Ecom Express, Shadowfax, and other trusted networks for domestic and international delivery.",
  },
  {
    question: "How does the pricing work?",
    answer:
      "Pricing depends on shipment weight, dimensions, origin, destination, service level, and courier partner. The platform helps compare available options so teams can choose the best rate for every order.",
  },
  {
    question: "Is there a setup or monthly fee?",
    answer:
      "Plans can be tailored based on shipment volume and integration needs. The goal is to keep onboarding simple, transparent, and aligned with how your business ships.",
  },
  {
    question: "How secure is my data with Pax Logistics?",
    answer:
      "Pax Logistics is built with secure access patterns and operational safeguards so shipment, customer, and business data remain protected across the workflow.",
  },
  {
    question: "Can I integrate Pax Logistics with my existing platform?",
    answer:
      "Yes. Pax Logistics can connect with ecommerce stores, marketplaces, internal tools, and custom systems using API-ready shipping workflows.",
  },
  {
    question: "What kind of support do you provide?",
    answer:
      "Support is available for onboarding, courier setup, integration questions, shipment workflows, and day-to-day operational guidance.",
  },
];

const valueCards = [
  {
    title: "Multi-Channel Integration",
    description: "Connect Shopify, WooCommerce, Amazon, Flipkart and more so every selling channel lives in one place.",
    icon: "globe",
    shell: "bg-[linear-gradient(135deg,rgba(217,230,247,0.5),rgba(255,255,255,0.95))]",
  },
  {
    title: "27+ Courier Partners",
    description: "Work with Blue Dart, Delhivery, XpressBees, FedEx and more from one shipping workspace.",
    icon: "truck",
    shell: "bg-[linear-gradient(135deg,rgba(253,231,234,0.42),rgba(255,255,255,0.95))]",
  },
  {
    title: "Auto Order Sync",
    description: "Orders from all channels flow into the dashboard automatically so your team can ship faster.",
    icon: "refresh",
    shell: "bg-[linear-gradient(135deg,rgba(217,230,247,0.58),rgba(255,255,255,0.95))]",
  },
  {
    title: "Automated Label Generation",
    description: "Labels are prepared using your preferred courier logic so operators spend less time repeating manual tasks.",
    icon: "package",
    shell: "bg-[linear-gradient(135deg,rgba(217,230,247,0.46),rgba(255,255,255,0.95))]",
  },
  {
    title: "Unified Dashboard",
    description: "Manage orders, shipments, analytics, and delivery updates from a single operational view.",
    icon: "chart",
    shell: "bg-[linear-gradient(135deg,rgba(253,231,234,0.34),rgba(255,255,255,0.95))]",
  },
];

const insightCards = [
  {
    title: "Delivery Performance",
    description: "Track delivery metrics and courier performance in real-time.",
    icon: "chart",
  },
  {
    title: "Financial Analytics",
    description: "Monitor courier costs, COD collection, and RTO trends.",
    icon: "coins",
  },
  {
    title: "Customer Metrics",
    description: "Access detailed reports on customer satisfaction and order trends.",
    icon: "checkCircle",
  },
];

const ecommerceCards = [
  {
    title: "Automatic Order Sync",
    description: "Orders from all connected channels are automatically synced to your dashboard.",
    icon: "refresh",
  },
  {
    title: "AWB Number Update",
    description: "AWB numbers are automatically updated back to your store or marketplace.",
    icon: "package",
  },
  {
    title: "Real-time Tracking Updates",
    description: "Shipment tracking updates are synced in real-time to keep customers informed.",
    icon: "bell",
  },
];

const dashboardBars = [
  "h-16 bg-[#8FD8FF]",
  "h-24 bg-[#FFD8A8]",
  "h-20 bg-[#BEEBFF]",
  "h-32 bg-[#9BCBFF]",
  "h-[5.4rem] bg-[#FDE7C5]",
  "h-28 bg-[#CFEFFF]",
  "h-[6.5rem] bg-[#FFCFA0]",
];

const rateCards = [
  {
    title: "Live Rate Comparison",
    description: "Compare courier pricing, delivery speed, and serviceability before every booking.",
    icon: "calculator",
    metric: "27+",
    label: "courier options",
  },
  {
    title: "Cost Control",
    description: "Spot high-cost lanes, COD impact, RTO risk, and avoidable surcharges earlier.",
    icon: "wallet",
    metric: "18%",
    label: "average savings",
  },
  {
    title: "No Guesswork",
    description: "Choose the right carrier with clear delivery promises and operational signals.",
    icon: "checkCircle",
    metric: "94%",
    label: "best-fit match",
  },
];

const rateRows = [
  {
    courier: "Delhivery",
    lane: "Surface",
    price: "Rs 64",
    eta: "2-4 days",
    fit: "Best value",
    width: "w-[88%]",
  },
  {
    courier: "Blue Dart",
    lane: "Air",
    price: "Rs 112",
    eta: "1-2 days",
    fit: "Fastest",
    width: "w-[74%]",
  },
  {
    courier: "XpressBees",
    lane: "Standard",
    price: "Rs 72",
    eta: "3-5 days",
    fit: "COD ready",
    width: "w-[81%]",
  },
];

const launchSteps = [
  {
    title: "Connect Channels",
    description: "Map stores, marketplaces, pickup points, and courier preferences.",
    icon: "api",
  },
  {
    title: "Configure Rules",
    description: "Set lane logic, COD rules, service priorities, and shipment automation.",
    icon: "gear",
  },
  {
    title: "Go Live",
    description: "Start shipping with labels, tracking, reports, and expert support ready.",
    icon: "rocket",
  },
];

const supportCards = [
  {
    title: "Onboarding Support",
    description: "A guided setup path for teams moving from spreadsheets or multiple courier portals.",
    icon: "headset",
  },
  {
    title: "Operational Playbooks",
    description: "Practical workflows for NDR, RTO, courier allocation, and customer updates.",
    icon: "layers",
  },
  {
    title: "Scale Reviews",
    description: "Review delivery performance and courier mix as shipment volume grows.",
    icon: "barChart",
  },
];

const stackCards = [
  {
    title: "Order capture",
    description: "Bring store, marketplace, and manual orders into one dispatch-ready queue.",
    icon: "inbox",
  },
  {
    title: "Courier decisioning",
    description: "Compare rate, lane, COD, serviceability, and delivery promise before booking.",
    icon: "route",
  },
  {
    title: "Customer updates",
    description: "Keep buyers informed with AWB, tracking, exception, and delivery notifications.",
    icon: "bell",
  },
  {
    title: "Recovery workflow",
    description: "Give teams clear NDR and RTO actions so fewer shipments drift unresolved.",
    icon: "refresh",
  },
];

const stackMetrics = [
  { label: "Connected channels", value: "6+" },
  { label: "Courier partners", value: "27+" },
  { label: "Pin code reach", value: "29K+" },
];

const stackRows = [
  ["Shopify", "Orders synced", "Live"],
  ["WooCommerce", "AWB writeback", "Ready"],
  ["Marketplace", "Bulk labels", "Queued"],
  ["Manual", "Pickup manifest", "Ready"],
];

const operationsModes = [
  {
    id: "allocation",
    label: "Courier allocation",
    icon: "route",
    kicker: "Dispatch rules active",
    title: "Best-fit courier selected before the label prints.",
    description: "Serviceability, promised delivery date, cost, and RTO history are checked in one decision view.",
    metrics: [
      ["Orders ready", "184"],
      ["Auto assigned", "171"],
      ["Manual review", "13"],
      ["Avg. decision", "0.8 sec"],
    ],
    rows: [
      ["EM-28491", "Surat to Mumbai", "Delhivery Air", "Ready"],
      ["EM-28490", "Delhi to Jaipur", "XpressBees", "Ready"],
      ["EM-28489", "Pune to Bengaluru", "Blue Dart", "Review"],
    ],
    decision: ["Delivery promise", "Tomorrow by 9 PM"],
    signal: "92% lane reliability",
  },
  {
    id: "tracking",
    label: "Live tracking",
    icon: "mapPin",
    kicker: "Network view online",
    title: "Every shipment milestone in one live operating view.",
    description: "Courier scans are normalized into a single timeline, with delayed movement highlighted for the team.",
    metrics: [
      ["In transit", "1,082"],
      ["Out for delivery", "246"],
      ["Delivered today", "934"],
      ["Scan coverage", "98.6%"],
    ],
    rows: [
      ["EM-28476", "Mumbai hub", "Out for delivery", "Live"],
      ["EM-28462", "Jaipur gateway", "Linehaul received", "Live"],
      ["EM-28431", "Bengaluru hub", "Scan delayed", "Review"],
    ],
    decision: ["Next milestone", "Delivery attempt"],
    signal: "Updated 38 seconds ago",
  },
  {
    id: "exceptions",
    label: "Exception desk",
    icon: "shield",
    kicker: "Recovery queue prioritized",
    title: "NDR and delivery risks reach the right operator faster.",
    description: "Failed attempts, address issues, and stuck shipments are grouped by urgency with the next action visible.",
    metrics: [
      ["Open cases", "41"],
      ["Due today", "18"],
      ["Recovered", "73%"],
      ["Avg. response", "12 min"],
    ],
    rows: [
      ["EM-28398", "Buyer unavailable", "Call customer", "Urgent"],
      ["EM-28372", "Address incomplete", "Verify address", "Review"],
      ["EM-28344", "Hub delay", "Courier follow-up", "Open"],
    ],
    decision: ["Recommended action", "Verify by phone"],
    signal: "18 cases due before 4 PM",
  },
];

const operatingFlow = [
  ["01", "Order sync", "Stores and marketplaces"],
  ["02", "Courier decision", "Rate, SLA, and risk"],
  ["03", "Dispatch", "AWB, label, and manifest"],
  ["04", "Delivery control", "Tracking and recovery"],
];

function ActionAnchor({ href, children, className, style }) {
  return (
    <a className={className} href={href} style={style}>
      {children}
    </a>
  );
}

function MagneticLink({ href, children, className, style }) {
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const x = useSpring(offsetX, { stiffness: 260, damping: 22, mass: 0.35 });
  const y = useSpring(offsetY, { stiffness: 260, damping: 22, mass: 0.35 });

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    offsetX.set((event.clientX - bounds.left - bounds.width / 2) * 0.12);
    offsetY.set((event.clientY - bounds.top - bounds.height / 2) * 0.16);
  };

  const resetPosition = () => {
    offsetX.set(0);
    offsetY.set(0);
  };

  return (
    <MotionAnchor
      href={href}
      className={className}
      style={{ ...style, x, y }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPosition}
      onPointerCancel={resetPosition}
    >
      {children}
    </MotionAnchor>
  );
}

function HeroCommandDashboard() {
  const timeline = ["Booked", "In transit", "Out for delivery", "Delivered"];

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 34, rotateX: 5 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.85, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="hero-command-dashboard relative mx-auto w-full max-w-[42rem] overflow-hidden rounded-lg border border-white/15 bg-[#081a34]/78 text-white shadow-[0_36px_100px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[#82B8FF]">
            <Icon name="route" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Network command</p>
            <p className="mt-1 text-xs text-white/48">Tuesday, 14 July</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[0.68rem] font-semibold text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
          Live
        </span>
      </div>

      <div className="grid grid-cols-3 border-b border-white/10">
        {[
          ["2,458", "Shipments", "+12.5%"],
          ["98.6%", "On-time", "+3.8%"],
          ["41", "Exceptions", "-18%"],
        ].map(([value, label, change], index) => (
          <div key={label} className={`min-w-0 px-3 py-4 sm:px-5 sm:py-5 ${index ? "border-l border-white/10" : ""}`}>
            <p className="text-lg font-semibold sm:text-2xl">{value}</p>
            <div className="mt-1 flex flex-col gap-1 text-[0.64rem] sm:flex-row sm:items-center sm:justify-between sm:text-xs">
              <span className="truncate text-white/46">{label}</span>
              <span className={change.startsWith("-") ? "text-emerald-300" : "text-[#82B8FF]"}>{change}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/42">AWB 7842 0913 6741</p>
            <h2 className="mt-2 text-base font-semibold sm:text-lg">Surat to Bengaluru</h2>
          </div>
          <span className="shrink-0 rounded-lg bg-[#ED1C24] px-3 py-2 text-[0.68rem] font-semibold text-white">Out for delivery</span>
        </div>

        <div className="relative mt-7 grid grid-cols-4 gap-2">
          <span className="absolute left-[7%] right-[7%] top-2 h-px bg-white/12" />
          <MotionSpan
            className="absolute left-[7%] top-2 h-px origin-left bg-[linear-gradient(90deg,#6eaaff,#ed1c24)]"
            initial={{ width: 0 }}
            animate={{ width: "62%" }}
            transition={{ duration: 1.2, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
          {timeline.map((item, index) => (
            <div key={item} className="relative min-w-0 pt-6 text-center">
              <span
                className={`absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-[#0a1c35] ${
                  index < 3 ? "bg-[#7DAFFF]" : "bg-white/18"
                }`}
              />
              <p className={`text-[0.6rem] leading-4 sm:text-[0.68rem] ${index < 3 ? "text-white/78" : "text-white/32"}`}>{item}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 hidden border-t border-white/10 pt-5 sm:block">
          {[
            ["EM-28476", "Mumbai Hub", "Moving", "2 min ago"],
            ["EM-28462", "Jaipur Gateway", "Sorted", "8 min ago"],
            ["EM-28431", "Bengaluru Hub", "Review", "12 min ago"],
          ].map((row, index) => (
            <div
              key={row[0]}
              className={`grid grid-cols-[0.8fr_1fr_0.65fr_0.75fr] gap-3 py-3 text-xs ${index ? "border-t border-white/[0.07]" : ""}`}
            >
              <span className="font-semibold text-white/86">{row[0]}</span>
              <span className="text-white/48">{row[1]}</span>
              <span className={row[2] === "Review" ? "text-amber-300" : "text-emerald-300"}>{row[2]}</span>
              <span className="text-right text-white/36">{row[3]}</span>
            </div>
          ))}
        </div>
      </div>

      <MotionDiv
        animate={{ y: [0, -5, 0] }}
        transition={{
          duration: 4.5,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
        className="absolute bottom-4 right-4 hidden items-center gap-3 rounded-lg border border-white/12 bg-white/10 px-3 py-2 backdrop-blur-xl md:flex"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[#062A5B]">
          <Icon name="package" className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[0.62rem] text-white/44">Next milestone</span>
          <span className="mt-0.5 block text-xs font-semibold">Delivery attempt</span>
        </span>
      </MotionDiv>
    </MotionDiv>
  );
}

function AlignedPanelSection({ children, shellClassName = "", innerClassName = "", sectionNumber }) {
  return (
    <section className="section-transition bg-[#f7f9fb]">
      <div
        className={`relative mx-auto max-w-[1518px] overflow-hidden border-t border-[#E2E8F0] bg-[#f7f9fb] px-5 pb-10 pt-12 sm:px-8 sm:pb-12 sm:pt-14 lg:px-16 ${shellClassName}`}
      >
        <span className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[#D6E1EF]" />
        {sectionNumber ? (
          <span className="pointer-events-none absolute right-6 top-6 hidden font-display text-[4.8rem] font-extrabold leading-none text-[#062A5B]/[0.07] lg:block">
            {sectionNumber}
          </span>
        ) : null}
        <div className={`mx-auto max-w-[1360px] ${innerClassName}`}>{children}</div>
      </div>
    </section>
  );
}

function AlignedSectionHeading({ eyebrow, title, description, className = "" }) {
  return (
    <div className={className}>
      <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#ED1C24]">{eyebrow}</p>
      <h2 className="mt-4 max-w-[44rem] font-display text-[2rem] font-extrabold leading-[1.16] text-[#061A33] sm:text-[2.55rem]">
        {title}
      </h2>
      <p className="mt-5 max-w-[36rem] text-sm font-medium leading-[1.75] text-[#183153] sm:text-base">{description}</p>
    </div>
  );
}

function HeroProofStrip() {
  return (
    <div className="hero-proof-strip">
      {heroProofItems.map((item, index) => (
        <div key={item.label} className="hero-proof-strip__item" style={{ animationDelay: `${0.36 + index * 0.08}s` }}>
          <span className="hero-proof-strip__icon">
            <Icon name={item.icon} className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[0.66rem] font-extrabold uppercase tracking-[0.14em] text-[#ED1C24]">{item.label}</span>
            <span className="mt-1 block text-sm font-semibold leading-snug text-[#061A33]">{item.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function HeroSection() {
  const { scrollYProgress } = useScroll();
  const visualY = useTransform(scrollYProgress, [0, 0.24], [0, -42]);
  const visualScale = useTransform(scrollYProgress, [0, 0.24], [1, 1.035]);

  return (
    <section className="hero-section section-transition relative overflow-hidden bg-[#f7fbff] pt-6 sm:pt-8">
      <MotionDiv className="absolute inset-0 z-0" style={{ y: visualY, scale: visualScale }} aria-hidden="true">
        <img
          src={heroWarehouseVisual}
          alt=""
          decoding="async"
          fetchPriority="high"
          className="h-full w-full object-cover object-[64%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.99)_0%,rgba(255,255,255,0.95)_30%,rgba(255,255,255,0.66)_52%,rgba(255,255,255,0.08)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(180deg,rgba(247,251,255,0),#f7fbff_82%)]" />
      </MotionDiv>

      <div className="relative z-10 mx-auto max-w-[1440px] px-5 pb-0 pt-10 sm:px-8 sm:pt-14 lg:px-16 lg:pt-16">
        <Reveal className="max-w-[43rem]" delay={0.04}>
          <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/82 px-4 py-2 text-[0.68rem] font-extrabold uppercase leading-5 tracking-[0.1em] text-[#1F5C9E] shadow-[0_12px_28px_rgba(6,42,91,0.08)] ring-1 ring-[#D9E6F7] sm:text-[0.76rem] sm:tracking-[0.14em]">
            <Icon name="spark" className="h-4 w-4 text-[#2563EB]" />
            <span className="min-w-0">Mission Control for Modern Commerce</span>
          </span>

          <h1 className="mt-7 max-w-[40rem] font-display text-[3rem] font-extrabold leading-[1.05] text-[#061A33] sm:text-[4.55rem] lg:text-[5rem]">
            <span className="block">From</span>
            <span className="block">warehouse.</span>
            <span className="block text-[#ED1C24]">To every</span>
            <span className="block text-[#ED1C24]">doorstep.</span>
          </h1>

          <p className="mt-7 max-w-[34rem] text-base font-medium leading-[1.85] text-[#334155] sm:text-lg">
            One intelligent logistics network for rates, dispatch, tracking, exceptions, and delivery performance across every carrier.
          </p>

          <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
            <ActionAnchor
              href={AUTH_APP_URL}
              className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-[#ED1C24] px-7 py-4 text-sm font-extrabold text-white shadow-[0_18px_36px_rgba(237,28,36,0.24)] transition hover:-translate-y-0.5 hover:bg-[#c9171e] sm:w-auto"
              style={{ color: "#ffffff" }}
            >
              <span>Launch your shipments</span>
              <Icon name="arrowUpRight" className="h-5 w-5" />
            </ActionAnchor>
            <a
              href="/tracking"
              className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-[#C7D6EA] bg-white/86 px-7 py-4 text-sm font-extrabold text-[#061A33] shadow-[0_14px_30px_rgba(6,42,91,0.08)] transition hover:-translate-y-0.5 hover:bg-white sm:w-auto"
            >
              <Icon name="package" className="h-5 w-5" />
              <span>Track a package</span>
            </a>
          </div>

          <div className="hidden sm:block">
            <HeroProofStrip />
          </div>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="relative z-20 mt-14 grid overflow-hidden rounded-xl border border-white/80 bg-white/92 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-md sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
            {heroFeatureCards.map((card, index) => (
              <MotionArticle
                key={card.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{
                  duration: 0.45,
                  delay: index * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                whileHover={{ y: -5 }}
                className={`min-h-[12.5rem] px-6 py-7 ${
                  index < heroFeatureCards.length - 1 ? "border-b border-[#E7EEF7] sm:border-r lg:border-b-0" : ""
                } ${index === 1 ? "sm:border-r-0 lg:border-r" : ""}`}
              >
                <span className={`grid h-16 w-16 place-items-center rounded-xl ${card.shell}`}>
                  <Icon name={card.icon} className="h-8 w-8" />
                </span>
                <h3 className="mt-5 text-base font-extrabold text-[#061A33]">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#475569]">{card.description}</p>
              </MotionArticle>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PlatformsSection() {
  return (
    <section className="section-transition bg-[#f7fbff]">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 pb-12 pt-16 sm:px-8 lg:grid-cols-[0.45fr_0.55fr] lg:items-center lg:px-16 lg:pb-18 lg:pt-20">
        <Reveal>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#ED1C24]">Built for scale</p>
            <h2 className="mt-5 max-w-[34rem] font-display text-[2.15rem] font-extrabold leading-[1.14] text-[#061A33] sm:text-[3.1rem]">
              Powering logistics that deliver more.
            </h2>
            <p className="mt-6 max-w-[34rem] text-base font-medium leading-[1.85] text-[#475569]">
              Our platform connects you with a wide network of carriers and tools to simplify operations, reduce delivery guesswork, and
              delight your customers.
            </p>

            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {scaleStats.map((stat, index) => (
                <MotionArticle
                  key={stat.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{
                    duration: 0.42,
                    delay: index * 0.06,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="min-w-0"
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-lg ${stat.shell} ${stat.tone}`}>
                    <Icon name={stat.icon} className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-2xl font-extrabold text-[#062A5B]">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-[#64748B]">{stat.label}</p>
                </MotionArticle>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                ["Shipments Delivered", "24.5M", "+12.5%"],
                ["On-time Delivery", "98.6%", "+4.3%"],
              ].map(([label, value, change]) => (
                <MotionArticle
                  key={label}
                  whileHover={{ y: -5 }}
                  className="rounded-xl border border-[#E1EAF5] bg-white p-6 shadow-[0_20px_55px_rgba(15,23,42,0.06)]"
                >
                  <p className="text-sm font-extrabold text-[#061A33]">{label}</p>
                  <div className="mt-5 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[2rem] font-extrabold leading-none text-[#061A33]">{value}</p>
                      <p className="mt-3 text-xs font-medium text-[#64748B]">This month</p>
                    </div>
                    <span className="text-sm font-extrabold text-[#10B981]">{change}</span>
                  </div>
                </MotionArticle>
              ))}
            </div>

            <MotionDiv
              whileHover={{ y: -5 }}
              className="overflow-hidden rounded-xl border border-[#E1EAF5] bg-white p-6 shadow-[0_22px_62px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-extrabold text-[#061A33]">Live Tracking</h3>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1 text-xs font-extrabold text-[#059669]">
                  <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                  Live
                </span>
              </div>
              <div className="relative mt-6 h-[15rem] overflow-hidden rounded-lg bg-[#F3F8FF]">
                <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(30deg,rgba(37,99,235,0.08)_1px,transparent_1px),linear-gradient(120deg,rgba(37,99,235,0.08)_1px,transparent_1px)] [background-size:52px_52px]" />
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 560 240" fill="none" aria-hidden="true">
                  <path
                    d="M46 165 L98 146 L144 162 L214 118 L286 154 L356 96 L432 106 L504 70"
                    stroke="#2563EB"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {[46, 144, 214, 356, 432, 504].map((cx, index) => (
                    <circle
                      key={cx}
                      cx={cx}
                      cy={[165, 162, 118, 96, 106, 70][index]}
                      r="11"
                      fill="#2563EB"
                      stroke="white"
                      strokeWidth="6"
                    />
                  ))}
                </svg>
                <div className="absolute bottom-8 right-7 rounded-lg bg-white px-5 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
                  <p className="text-xs font-extrabold text-[#061A33]">Out for delivery</p>
                  <p className="mt-1 text-xs font-medium text-[#64748B]">Mumbai, MH</p>
                </div>
                <span className="absolute right-24 top-11 grid h-14 w-14 place-items-center rounded-lg bg-[#2563EB] text-white shadow-[0_16px_34px_rgba(37,99,235,0.24)]">
                  <Icon name="truck" className="h-8 w-8" />
                </span>
              </div>
            </MotionDiv>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ShippingToolsSection() {
  return (
    <section id="shipping-tools" className="section-transition bg-white">
      <div className="mx-auto max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-16 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_0.28fr] lg:items-end">
          <Reveal>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#ED1C24]">Shipping toolkit</p>
              <h2 className="mt-4 max-w-[48rem] font-display text-[2.15rem] font-extrabold leading-[1.12] text-[#061A33] sm:text-[3.25rem]">
                Answers before dispatch. Visibility after it.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-[30rem] text-sm font-medium leading-7 text-[#526277] sm:text-base sm:leading-8 lg:ml-auto">
              Three focused tools give teams a faster path from package planning to final delivery.
            </p>
          </Reveal>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {shippingTools.map((tool, index) => (
            <Reveal key={tool.title} delay={index * 0.06}>
              <MotionArticle
                whileHover={{ y: -7 }}
                transition={{ duration: 0.28 }}
                className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#DCE6F1] bg-[#F8FAFD] shadow-[0_18px_48px_rgba(6,26,51,0.07)]"
              >
                <div className="relative aspect-[16/10] overflow-hidden border-b border-[#DCE6F1] bg-[#EAF1FA]">
                  {tool.image ? (
                    <img
                      src={tool.image}
                      alt={tool.imageAlt}
                      loading="lazy"
                      className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.025]"
                    />
                  ) : (
                    <div className="flex h-full flex-col justify-between bg-[#081A34] p-5 text-white sm:p-6">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/48">Rate intelligence</span>
                        <span className="rounded-full bg-emerald-300/10 px-3 py-1 text-[0.65rem] font-semibold text-emerald-200">
                          3 options
                        </span>
                      </div>
                      <div className="grid gap-1">
                        {[
                          ["Express Air", "1-2 days", "Rs 184"],
                          ["Surface Pro", "3-4 days", "Rs 126"],
                          ["Economy", "5-6 days", "Rs 98"],
                        ].map((rate, rateIndex) => (
                          <div
                            key={rate[0]}
                            className={`grid grid-cols-[1fr_0.8fr_auto] items-center gap-2 py-3 text-xs ${
                              rateIndex ? "border-t border-white/10" : ""
                            }`}
                          >
                            <span className="font-semibold">{rate[0]}</span>
                            <span className="text-white/42">{rate[1]}</span>
                            <span className={rateIndex === 1 ? "text-[#8EBBFA]" : "text-white/72"}>{rate[2]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#6A7A90]">{tool.label}</p>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#E8F1FC] text-[#062A5B]">
                      <Icon name={tool.icon} className="h-5 w-5" />
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-extrabold text-[#061A33]">{tool.title}</h3>
                  <p className="mt-3 flex-1 text-sm font-medium leading-7 text-[#526277]">{tool.description}</p>
                  <a
                    href={tool.href}
                    className="mt-6 inline-flex min-h-11 items-center justify-between border-t border-[#DCE6F1] pt-4 text-sm font-bold text-[#062A5B] transition group-hover:text-[#ED1C24]"
                  >
                    <span>{tool.action}</span>
                    <Icon name="arrowUpRight" className="h-5 w-5" />
                  </a>
                </div>
              </MotionArticle>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function OperationsDeckSection() {
  const [activeModeId, setActiveModeId] = useState(operationsModes[0].id);
  const activeMode = operationsModes.find((mode) => mode.id === activeModeId) || operationsModes[0];

  return (
    <section id="operations-deck" className="section-transition overflow-hidden bg-[#041A38] text-white">
      <div className="mx-auto max-w-[1518px] px-5 py-14 sm:px-8 sm:py-18 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-[1360px]">
          <div className="grid gap-8 lg:grid-cols-[0.46fr_0.54fr] lg:items-end">
            <Reveal>
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#FF5A61]">Inside Pax Logistics</p>
                <h2 className="mt-4 max-w-[42rem] font-display text-[2.15rem] font-extrabold leading-[1.12] text-white sm:text-[3rem]">
                  One operating deck for every shipping decision.
                </h2>
              </div>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="max-w-[39rem] text-sm font-medium leading-7 text-white/70 sm:text-base sm:leading-8 lg:ml-auto">
                Built around the work dispatch and support teams do every day. Choose a view to see how orders move from allocation to
                delivery recovery without changing tools.
              </p>
            </Reveal>
          </div>

          <div
            className="mt-9 grid gap-2 rounded-lg border border-white/12 bg-white/[0.06] p-2 sm:grid-cols-3"
            role="tablist"
            aria-label="Operations workspace views"
          >
            {operationsModes.map((mode) => {
              const isActive = mode.id === activeMode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="operations-workspace"
                  onClick={() => setActiveModeId(mode.id)}
                  className={`inline-flex min-h-12 items-center justify-center gap-3 rounded-md px-4 py-3 text-sm font-bold transition ${
                    isActive
                      ? "bg-white text-[#041A38] shadow-[0_12px_28px_rgba(0,0,0,0.2)]"
                      : "text-white/68 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <Icon name={mode.icon} className="h-5 w-5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          <Reveal delay={0.12}>
            <div className="operations-depth-stage mt-8">
              <MotionDiv
                id="operations-workspace"
                role="tabpanel"
                key={activeMode.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                className="operations-workspace overflow-hidden border border-white/18 bg-[#F8FAFD] text-[#061A33]"
              >
                <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#D9E3EF] bg-white px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <img src="/assets/pax-logo.png" alt="Pax Logistics" className="h-9 w-auto shrink-0 object-contain" />
                    <span className="hidden h-5 w-px bg-[#D9E3EF] sm:block" />
                    <p className="truncate text-xs font-extrabold uppercase tracking-[0.1em] text-[#526277] sm:block">Operations control</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#E8F8F1] px-3 py-1.5 text-[0.68rem] font-extrabold text-[#087A55]">
                    <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                    Live
                  </span>
                </div>

                <div className="grid min-w-0 lg:grid-cols-[4.25rem_1fr]">
                  <aside className="hidden border-r border-[#D9E3EF] bg-[#062A5B] py-5 lg:flex lg:flex-col lg:items-center lg:gap-3">
                    {["barChart", "package", "truck", "shield", "gear"].map((icon, index) => (
                      <span
                        key={icon}
                        title={["Overview", "Orders", "Couriers", "Exceptions", "Settings"][index]}
                        className={`grid h-10 w-10 place-items-center rounded-md ${
                          index === 0 ? "bg-white text-[#062A5B]" : "text-white/58"
                        }`}
                      >
                        <Icon name={icon} className="h-5 w-5" />
                      </span>
                    ))}
                  </aside>

                  <div className="min-w-0 p-4 sm:p-6 lg:p-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-[#ED1C24]">{activeMode.kicker}</p>
                        <h3 className="mt-2 max-w-[42rem] text-xl font-extrabold leading-snug text-[#061A33] sm:text-2xl">
                          {activeMode.title}
                        </h3>
                        <p className="mt-2 max-w-[46rem] text-sm leading-6 text-[#526277]">{activeMode.description}</p>
                      </div>
                      <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md border border-[#D6E1EF] bg-white px-3 py-2 text-xs font-bold text-[#062A5B]">
                        <Icon name="refresh" className="h-4 w-4" />
                        Synced now
                      </span>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
                      {activeMode.metrics.map(([label, value]) => (
                        <div key={label} className="min-w-0 border-l-2 border-[#D9E6F7] bg-white px-3 py-3 sm:px-4">
                          <p className="text-lg font-extrabold text-[#061A33] sm:text-xl">{value}</p>
                          <p className="mt-1 text-[0.68rem] font-semibold uppercase leading-5 tracking-[0.06em] text-[#64748B]">{label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[1fr_17rem]">
                      <div className="min-w-0 overflow-hidden border border-[#D9E3EF] bg-white">
                        <div className="grid grid-cols-[0.75fr_1.2fr] gap-3 border-b border-[#D9E3EF] bg-[#EEF4FB] px-3 py-3 text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-[#526277] sm:grid-cols-[0.7fr_1.15fr_1fr_0.55fr] sm:px-4">
                          <span>Order</span>
                          <span>Lane</span>
                          <span className="hidden sm:block">Update</span>
                          <span className="hidden text-right sm:block">State</span>
                        </div>
                        {activeMode.rows.map(([order, lane, update, state]) => (
                          <div
                            key={order}
                            className="grid min-w-0 grid-cols-[0.75fr_1.2fr] gap-3 border-b border-[#E8EEF5] px-3 py-3 last:border-b-0 sm:grid-cols-[0.7fr_1.15fr_1fr_0.55fr] sm:items-center sm:px-4"
                          >
                            <span className="truncate text-xs font-extrabold text-[#061A33] sm:text-sm">{order}</span>
                            <span className="min-w-0 text-xs font-medium leading-5 text-[#526277] sm:text-sm">{lane}</span>
                            <span className="col-span-2 text-xs font-semibold text-[#183153] sm:col-span-1 sm:text-sm">{update}</span>
                            <span
                              className={`w-fit rounded-full px-2.5 py-1 text-[0.66rem] font-extrabold sm:ml-auto ${
                                state === "Ready" || state === "Live"
                                  ? "bg-[#E8F8F1] text-[#087A55]"
                                  : state === "Urgent"
                                  ? "bg-[#FDE7EA] text-[#C9171E]"
                                  : "bg-[#FFF2DE] text-[#A85608]"
                              }`}
                            >
                              {state}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="relative overflow-hidden bg-[#062A5B] p-5 text-white">
                        <div className="absolute inset-x-0 top-0 h-1 bg-[#ED1C24]" />
                        <span className="grid h-10 w-10 place-items-center rounded-md bg-white/10 text-white">
                          <Icon name="checkCircle" className="h-5 w-5" />
                        </span>
                        <p className="mt-5 text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-white/56">
                          {activeMode.decision[0]}
                        </p>
                        <p className="mt-2 text-lg font-extrabold leading-snug text-white">{activeMode.decision[1]}</p>
                        <div className="mt-5 border-t border-white/12 pt-4">
                          <p className="text-xs font-semibold leading-6 text-white/68">{activeMode.signal}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </MotionDiv>

              <div className="operations-float operations-float--left" aria-hidden="true">
                <Icon name="package" className="h-5 w-5 text-[#ED1C24]" />
                <span>
                  <strong>184</strong> orders ready
                </span>
              </div>
              <div className="operations-float operations-float--right" aria-hidden="true">
                <Icon name="truck" className="h-5 w-5 text-[#062A5B]" />
                <span>
                  <strong>27+</strong> carrier services
                </span>
              </div>
            </div>
          </Reveal>

          <div className="mt-8 grid border-y border-white/12 sm:grid-cols-2 lg:grid-cols-4">
            {operatingFlow.map(([number, title, detail], index) => (
              <div key={number} className={`min-w-0 px-1 py-5 sm:px-5 ${index > 0 ? "sm:border-l sm:border-white/12" : ""}`}>
                <p className="text-xs font-extrabold text-[#FF5A61]">{number}</p>
                <p className="mt-2 text-sm font-extrabold text-white">{title}</p>
                <p className="mt-1 text-xs leading-5 text-white/56">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatherMark({ compact = false }) {
  return (
    <img
      src="/assets/pax-logo.png"
      alt=""
      className={`${
        compact ? "h-16" : "h-[5.6rem]"
      } w-auto rounded-xl border border-[#D6E1EF] bg-white object-contain p-1 shadow-[0_14px_34px_rgba(6,26,51,0.08)]`}
      aria-hidden="true"
    />
  );
}

function ConnectorDot({ className = "" }) {
  return (
    <span
      className={`absolute left-1/2 -bottom-[0.62rem] z-20 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-[#062A5B] text-white shadow-[0_6px_14px_rgba(6,42,91,0.2)] ${className}`}
      aria-hidden="true"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </span>
  );
}

function WhyChooseSection() {
  return (
    <section id="services" className="section-transition bg-[#062A5B]">
      <div className="mx-auto max-w-[1518px] rounded-t-[5.5rem] bg-[#F5F8FC] px-5 pb-9 pt-11 sm:px-8 sm:pb-12 sm:pt-12 lg:px-24">
        <div className="grid gap-10 lg:grid-cols-[0.34fr_0.66fr] lg:items-start">
          <Reveal>
            <div className="max-w-[28rem]">
              <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#ED1C24]">Why Choose Pax Logistics?</p>
              <h2 className="mt-4 font-display text-[1.72rem] font-extrabold leading-[1.24] text-[#061A33] sm:text-[2.15rem] lg:text-[2.1rem]">
                Everything You Need,
                <br />
                In One Powerful Platform
              </h2>
              <p className="mt-5 text-base leading-[1.62] text-[#183153] sm:text-[1rem]">
                Pax Logistics simplifies shipping so you can focus on growing your business. One integration. Endless possibilities.
              </p>
              <ActionAnchor
                href={AUTH_APP_URL}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-5 rounded-lg bg-[#062A5B] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(6,42,91,0.18)] transition hover:-translate-y-0.5 hover:bg-[#123763] sm:min-w-[12.4rem]"
                style={{ color: "#ffffff" }}
              >
                <span>Get Started Today</span>
                <Icon name="chevronRight" className="h-5 w-5" />
              </ActionAnchor>
            </div>
          </Reveal>

          <div className="relative pb-16 lg:pb-[5.55rem]">
            <svg
              className="pointer-events-none absolute bottom-5 left-[7%] right-[7%] z-0 hidden h-[5.6rem] w-[86%] overflow-visible lg:block"
              viewBox="0 0 880 110"
              fill="none"
              aria-hidden="true"
            >
              <path d="M92 8 C135 76 240 78 313 58" stroke="#062A5B" strokeDasharray="5 7" strokeLinecap="round" strokeWidth="1.8" />
              <path d="M313 58 L302 52 M313 58 L303 65" stroke="#062A5B" strokeLinecap="round" strokeWidth="1.8" />
              <path d="M526 58 C602 80 692 72 748 8" stroke="#062A5B" strokeDasharray="5 7" strokeLinecap="round" strokeWidth="1.8" />
              <path d="M526 58 L537 52 M526 58 L536 65" stroke="#062A5B" strokeLinecap="round" strokeWidth="1.8" />
              <path d="M748 8 C790 82 842 72 866 8" stroke="#062A5B" strokeDasharray="5 7" strokeLinecap="round" strokeWidth="1.8" />
            </svg>

            <div className="relative z-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {whyChooseCards.map((card, index) => {
                const isOrange = card.tone === "orange";

                return (
                  <MotionArticle
                    key={card.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{
                      duration: 0.52,
                      delay: index * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileHover={{ y: -8, scale: 1.02 }}
                    className="relative h-[15rem] rounded-lg border border-[#e9f3f5] bg-white px-4 pb-7 pt-6 text-center shadow-[0_14px_34px_rgba(7,25,35,0.05)]"
                  >
                    <div
                      className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-white shadow-[0_10px_22px_rgba(4,82,89,0.16)] ${
                        isOrange ? "bg-[#ED1C24]" : "bg-[#062A5B]"
                      }`}
                    >
                      <Icon name={card.icon} className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-[1rem] font-extrabold leading-tight text-[#101820] sm:whitespace-nowrap">{card.title}</h3>
                    <p className="mx-auto mt-3 max-w-[12.5rem] text-[0.82rem] leading-[1.5] text-[#33414b]">{card.description}</p>
                    {index !== 1 ? <ConnectorDot /> : null}
                  </MotionArticle>
                );
              })}
            </div>

            <MotionDiv
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{
                duration: 0.52,
                delay: 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="absolute bottom-0 left-1/2 z-10 hidden -translate-x-1/2 lg:block"
            >
              <FeatherMark />
            </MotionDiv>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureMapBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[14rem] overflow-hidden md:block" aria-hidden="true">
      <div className="absolute left-0 top-8 hidden h-28 w-[29rem] opacity-35 [clip-path:polygon(0_24%,18%_8%,45%_20%,62%_4%,92%_24%,86%_62%,66%_70%,54%_58%,34%_76%,13%_62%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px] md:block" />
      <div className="absolute right-2 top-8 hidden h-28 w-[29rem] opacity-35 [clip-path:polygon(4%_28%,25%_10%,44%_22%,64%_8%,96%_30%,86%_68%,62%_60%,47%_78%,25%_66%,10%_76%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px] md:block" />
      <svg
        className="absolute left-[13%] top-[4.8rem] hidden h-28 w-80 text-[#062A5B] opacity-60 md:block"
        viewBox="0 0 320 112"
        fill="none"
      >
        <path d="M34 40 C90 104 162 18 262 62" stroke="currentColor" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M34 30v30" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <circle cx="34" cy="30" r="11" fill="#062A5B" />
        <circle cx="34" cy="30" r="4" fill="white" />
      </svg>
      <svg className="absolute right-[7%] top-[5rem] hidden h-28 w-80 text-[#ED1C24] opacity-70 md:block" viewBox="0 0 320 112" fill="none">
        <path d="M54 64 C126 112 226 92 278 30" stroke="#062A5B" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M278 21v30" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
        <circle cx="278" cy="21" r="11" fill="#ED1C24" />
        <circle cx="278" cy="21" r="4" fill="white" />
      </svg>
    </div>
  );
}

function getDonutGradient(status) {
  let current = 0;
  const slices = status.map((item) => {
    const value = Number.parseFloat(item.value) || 0;
    const start = current;
    current += value;
    return `${item.color} ${start}% ${current}%`;
  });

  return `conic-gradient(${slices.join(", ")})`;
}

function FeatureTrendChart({ feature }) {
  return (
    <div className="rounded-xl border border-[#e7f0f2] bg-white px-4 pb-3 pt-4">
      <p className="text-[0.76rem] font-bold text-[#061A33]">Shipment Activity</p>
      <div className="mt-3 grid grid-cols-[2.1rem_1fr] gap-2">
        <div className="grid h-36 grid-rows-4 text-right text-[0.64rem] leading-none text-[#5e6b75]">
          <span>1,000</span>
          <span>750</span>
          <span>500</span>
          <span>250</span>
        </div>
        <div>
          <svg className="h-36 w-full overflow-visible" viewBox="0 0 500 160" fill="none" aria-hidden="true">
            {[28, 62, 96, 130].map((y) => (
              <path key={y} d={`M0 ${y}H500`} stroke="#dfe8eb" strokeWidth="1" />
            ))}
            <path d={feature.lineB} stroke="#ED1C24" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d={feature.lineA} stroke="#062A5B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {feature.lineA.match(/\d+ \d+/g)?.map((point) => {
              const [cx, cy] = point.split(" ");
              return <circle key={`${feature.title}-${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#062A5B" stroke="white" strokeWidth="2" />;
            })}
            {feature.lineB.match(/\d+ \d+/g)?.map((point) => {
              const [cx, cy] = point.split(" ");
              return (
                <circle key={`${feature.title}-orange-${cx}-${cy}`} cx={cx} cy={cy} r="3.8" fill="#ED1C24" stroke="white" strokeWidth="2" />
              );
            })}
          </svg>
          <div className="grid grid-cols-7 text-center text-[0.64rem] text-[#5e6b75]">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureStatusDonut({ feature }) {
  return (
    <div className="rounded-xl border border-[#e7f0f2] bg-white p-4">
      <p className="text-[0.76rem] font-bold text-[#061A33]">Shipments by Status</p>
      <div className="mt-5 grid grid-cols-[6.5rem_1fr] items-center gap-4">
        <div
          className="relative h-[6.5rem] w-[6.5rem] rounded-full"
          style={{ background: getDonutGradient(feature.status) }}
          aria-hidden="true"
        >
          <div className="absolute inset-[1.55rem] rounded-full bg-white" />
        </div>
        <div className="grid gap-2.5">
          {feature.status.map((item) => (
            <div key={item.label} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[0.68rem] text-[#33414b]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
              <span className="font-semibold">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureDashboardPreview({ feature }) {
  return (
    <MotionDiv
      key={feature.title}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="h-full rounded-xl border border-[#e8f2f4] bg-white p-4 shadow-[0_16px_42px_rgba(7,25,35,0.04)] sm:p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {feature.metrics.map((metric) => {
          const isOrange = metric.tone === "orange";

          return (
            <div
              key={metric.label}
              className="rounded-xl border border-[#e7f0f2] bg-white px-4 py-4 shadow-[0_8px_22px_rgba(7,25,35,0.025)]"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-lg ${
                    isOrange ? "bg-[#FDE7EA] text-[#ED1C24]" : "bg-[#EEF4FB] text-[#062A5B]"
                  }`}
                >
                  <Icon name={metric.icon} className="h-5 w-5" />
                </span>
                <span className="text-[0.68rem] font-medium text-[#57636d]">{metric.label}</span>
              </div>
              <p className="mt-3 text-xl font-extrabold text-[#061A33]">{metric.value}</p>
              <p className={`mt-1 text-[0.68rem] font-bold ${metric.change.startsWith("-") ? "text-[#e45043]" : "text-[#062A5B]"}`}>
                {metric.change}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.42fr_0.8fr]">
        <FeatureTrendChart feature={feature} />
        <FeatureStatusDonut feature={feature} />
      </div>

      <a
        href={AUTH_APP_URL}
        className="mt-5 inline-flex w-full items-center justify-end gap-3 text-sm font-semibold text-[#062A5B] transition hover:text-[#035f67]"
      >
        <span>View Dashboard</span>
        <Icon name="chevronRight" className="h-5 w-5" />
      </a>
    </MotionDiv>
  );
}

function FeaturesShowcaseSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFeature = featureShowcaseItems[activeIndex];

  return (
    <section id="platform-features" className="section-transition bg-[#062A5B] pt-0">
      <div className="relative mx-auto max-w-[1518px] overflow-hidden rounded-t-[2rem] bg-[#F5F8FC] px-5 pb-10 pt-10 sm:rounded-t-[4.6rem] sm:px-8 sm:pb-12 sm:pt-12 lg:px-16">
        <FeatureMapBackdrop />

        <Reveal className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#ED1C24]">Features</p>
            <h2 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.18] text-[#061A33] sm:text-[2.8rem]">
              Powerful Features.
              <br />
              Built for <span className="text-[#062A5B]">Global Shipping.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm font-medium leading-[1.75] text-[#183153] sm:text-base">
              Everything you need to ship smarter, scale faster, and deliver an exceptional customer experience.
            </p>
          </div>
        </Reveal>

        <div className="relative z-10 mt-8 grid gap-4 lg:grid-cols-[0.28fr_0.29fr_0.43fr] xl:gap-5">
          <Reveal>
            <div className="overflow-hidden rounded-xl border border-[#e5f1f3] bg-white shadow-[0_16px_40px_rgba(7,25,35,0.04)]">
              {featureShowcaseItems.map((item, index) => {
                const isActive = index === activeIndex;

                return (
                  <MotionButton
                    key={item.title}
                    type="button"
                    whileHover={{ x: isActive ? 0 : 4 }}
                    transition={{ duration: 0.2 }}
                    className={`grid w-full grid-cols-[3.8rem_1fr_auto] items-center gap-3 border-b border-[#e8f2f4] px-4 py-4 text-left last:border-b-0 ${
                      isActive
                        ? "border-l-[0.45rem] border-l-[#062A5B] bg-[#eaf8fb]"
                        : "border-l-[0.45rem] border-l-transparent bg-white hover:bg-[#f6fcfe]"
                    }`}
                    onClick={() => setActiveIndex(index)}
                    aria-pressed={isActive}
                  >
                    <span
                      className={`grid h-[3.25rem] w-[3.25rem] place-items-center rounded-xl ${
                        isActive ? "bg-[#062A5B] text-white" : "bg-[#ecfbff] text-[#062A5B]"
                      }`}
                    >
                      <Icon name={item.icon} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-extrabold ${isActive ? "text-[#062A5B]" : "text-[#061A33]"}`}>{item.title}</span>
                      <span className="mt-1 block text-[0.8rem] leading-[1.5] text-[#33414b]">{item.tabDescription}</span>
                    </span>
                    <Icon name="chevronRight" className={`h-5 w-5 ${isActive ? "text-[#062A5B]" : "text-[#80909a]"}`} />
                  </MotionButton>
                );
              })}
            </div>
          </Reveal>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <MotionArticle
                key={activeFeature.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                className="h-full rounded-xl border border-[#e5f1f3] bg-white px-6 py-8 shadow-[0_16px_40px_rgba(7,25,35,0.04)] sm:px-8"
              >
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#062A5B] text-lg font-extrabold text-white">
                    {activeFeature.number}
                  </span>
                  <h3 className="font-display text-[1.32rem] font-extrabold leading-tight text-[#061A33]">{activeFeature.title}</h3>
                </div>
                <p className="mt-7 text-sm leading-[1.7] text-[#25313a]">{activeFeature.description}</p>

                <ul className="mt-8 grid gap-5">
                  {activeFeature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-[0.86rem] leading-[1.55] text-[#183153]">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#062A5B] text-white">
                        <Icon name="checkCircle" className="h-3.5 w-3.5" />
                      </span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <ActionAnchor
                  href={AUTH_APP_URL}
                  className="mt-9 inline-flex min-h-11 items-center justify-center gap-4 rounded-lg bg-[#062A5B] px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(6,42,91,0.16)] transition hover:-translate-y-0.5 hover:bg-[#123763]"
                  style={{ color: "#ffffff" }}
                >
                  <span>Get Started</span>
                  <Icon name="chevronRight" className="h-5 w-5" />
                </ActionAnchor>
              </MotionArticle>
            </AnimatePresence>
          </div>

          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <FeatureDashboardPreview feature={activeFeature} />
            </AnimatePresence>
          </div>
        </div>

        <Reveal className="relative z-10" delay={0.08}>
          <div className="mt-8 grid overflow-hidden rounded-xl border border-[#dfeff2] bg-[#edf9fc] shadow-[0_16px_42px_rgba(7,25,35,0.04)] sm:grid-cols-2 lg:grid-cols-4">
            {featureSupportItems.map((item, index) => {
              const mobileBorder = index < featureSupportItems.length - 1 ? "border-b" : "";
              const tabletBorder = [index % 2 === 0 ? "sm:border-r" : "sm:border-r-0", index < 2 ? "sm:border-b" : "sm:border-b-0"].join(
                " "
              );
              const desktopBorder = index < featureSupportItems.length - 1 ? "lg:border-r lg:border-b-0" : "lg:border-r-0 lg:border-b-0";

              return (
                <div
                  key={item.title}
                  className={`flex items-center gap-5 border-[#d5e6ea] px-6 py-5 ${mobileBorder} ${tabletBorder} ${desktopBorder}`}
                >
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e4f7fb] text-[#062A5B]">
                    <Icon name={item.icon} className="h-9 w-9" />
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold text-[#061A33]">{item.title}</span>
                    <span className="mt-2 block text-[0.82rem] leading-[1.55] text-[#33414b]">{item.description}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TestimonialMapBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[18rem] overflow-hidden md:block" aria-hidden="true">
      <div className="absolute left-12 top-10 h-44 w-[31rem] opacity-30 [clip-path:polygon(0_18%,18%_6%,38%_14%,55%_4%,82%_16%,100%_34%,88%_62%,70%_58%,54%_76%,34%_66%,18%_82%,4%_58%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px]" />
      <div className="absolute right-10 top-10 h-44 w-[32rem] opacity-30 [clip-path:polygon(4%_20%,28%_8%,44%_16%,62%_6%,90%_18%,100%_42%,86%_72%,64%_62%,48%_78%,26%_66%,8%_74%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px]" />
      <svg className="absolute left-[8%] top-[7.5rem] h-36 w-[24rem] text-[#062A5B] opacity-55" viewBox="0 0 380 144" fill="none">
        <path d="M48 118 C12 64 88 34 124 82 C158 126 222 24 320 58" stroke="currentColor" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M124 56v35" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <circle cx="124" cy="56" r="12" fill="#062A5B" />
        <circle cx="124" cy="56" r="4" fill="white" />
      </svg>
      <svg className="absolute right-[7%] top-[7.5rem] h-36 w-[24rem] text-[#ED1C24] opacity-65" viewBox="0 0 380 144" fill="none">
        <path d="M42 90 C96 118 168 122 228 78 C266 50 306 74 332 110" stroke="#062A5B" strokeDasharray="4 7" strokeWidth="1.5" />
        <path d="M306 54v35" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <circle cx="306" cy="54" r="12" fill="#ED1C24" />
        <circle cx="306" cy="54" r="4" fill="white" />
      </svg>
    </div>
  );
}

function TestimonialCard({ testimonial, index }) {
  return (
    <MotionArticle
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
      className="flex min-h-[23.5rem] flex-col overflow-hidden rounded-xl border border-[#e6f1f3] bg-white shadow-[0_20px_50px_rgba(7,25,35,0.06)]"
    >
      <div className="flex flex-1 flex-col px-6 pb-5 pt-6 sm:px-7">
        <span className="text-[3.1rem] font-extrabold leading-none text-[#062A5B]">"</span>
        <p className="mt-3 min-h-[8.6rem] text-[0.96rem] font-medium leading-[1.7] text-[#061A33]">{testimonial.quote}</p>

        <div className="mt-5 flex gap-1 text-[#ED1C24]" aria-label="5 star rating">
          {Array.from({ length: 5 }).map((_, starIndex) => (
            <Icon key={starIndex} name="star" className="h-4 w-4 fill-current" />
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <img
            src={testimonial.avatar}
            alt={testimonial.name}
            loading="lazy"
            decoding="async"
            className="h-12 w-12 rounded-full object-cover shadow-[0_8px_20px_rgba(7,25,35,0.12)]"
          />
          <div>
            <h3 className="text-sm font-extrabold text-[#061A33]">{testimonial.name}</h3>
            <p className="mt-1 text-xs font-medium text-[#6a7780]">{testimonial.role}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-[#eaf2f4] bg-[#f7fbfd] px-6 py-4 text-[#062A5B] sm:px-7">
        <Icon name={testimonial.brandIcon} className="h-6 w-6" />
        <span className="text-sm font-extrabold">{testimonial.brand}</span>
      </div>
    </MotionArticle>
  );
}

function TestimonialsSection() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % testimonialSlides.length);
    }, 10000);

    return () => window.clearInterval(timer);
  }, []);

  const goToSlide = (direction) => {
    setActiveSlide((current) => {
      if (direction === "previous") {
        return (current - 1 + testimonialSlides.length) % testimonialSlides.length;
      }

      return (current + 1) % testimonialSlides.length;
    });
  };

  return (
    <section id="testimonials" className="section-transition bg-[#062A5B]">
      <div className="relative mx-auto max-w-[1518px] overflow-hidden rounded-t-[2rem] bg-[#F5F8FC] px-5 pb-10 pt-12 sm:rounded-t-[4.6rem] sm:px-8 sm:pb-12 sm:pt-14 lg:px-16">
        <TestimonialMapBackdrop />

        <Reveal className="relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#ED1C24]">Testimonials</p>
            <h2 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.18] text-[#061A33] sm:text-[2.8rem]">
              Trusted by Businesses
              <br />
              <span className="text-[#062A5B]">Worldwide.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm font-medium leading-[1.75] text-[#183153] sm:text-base">
              See how businesses of all sizes are simplifying shipping, saving time, and growing with Pax Logistics.
            </p>
          </div>
        </Reveal>

        <div className="relative z-10 mt-8">
          <button
            type="button"
            aria-label="Previous testimonials"
            onClick={() => goToSlide("previous")}
            className="absolute left-2 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#062A5B] shadow-[0_18px_34px_rgba(7,25,35,0.08)] transition hover:-translate-x-0.5 hover:bg-[#F5F8FC] lg:flex"
          >
            <Icon name="chevronLeft" className="h-6 w-6" />
          </button>

          <div className="mx-auto max-w-[1050px] lg:px-8">
            <AnimatePresence mode="wait">
              <MotionDiv
                key={activeSlide}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.38, ease: "easeOut" }}
                className="grid gap-6 md:grid-cols-3"
              >
                {testimonialSlides[activeSlide].map((testimonial, index) => (
                  <TestimonialCard key={testimonial.name} testimonial={testimonial} index={index} />
                ))}
              </MotionDiv>
            </AnimatePresence>
          </div>

          <button
            type="button"
            aria-label="Next testimonials"
            onClick={() => goToSlide("next")}
            className="absolute right-2 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#062A5B] shadow-[0_18px_34px_rgba(7,25,35,0.08)] transition hover:translate-x-0.5 hover:bg-[#F5F8FC] lg:flex"
          >
            <Icon name="chevronRight" className="h-6 w-6" />
          </button>

          <div className="mt-8 flex items-center justify-center gap-4 lg:hidden">
            <button
              type="button"
              aria-label="Previous testimonials"
              onClick={() => goToSlide("previous")}
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#062A5B] shadow-[0_14px_26px_rgba(7,25,35,0.08)]"
            >
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next testimonials"
              onClick={() => goToSlide("next")}
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#062A5B] shadow-[0_14px_26px_rgba(7,25,35,0.08)]"
            >
              <Icon name="chevronRight" className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            {testimonialSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Show testimonial set ${index + 1}`}
                onClick={() => setActiveSlide(index)}
                className={`h-3 w-3 rounded-full transition ${index === activeSlide ? "bg-[#062A5B]" : "bg-[#d8e7eb] hover:bg-[#b7d5dc]"}`}
              />
            ))}
          </div>
        </div>

        <Reveal className="relative z-10" delay={0.1}>
          <div className="mx-auto mt-10 grid max-w-[1260px] overflow-hidden rounded-xl border border-[#dfeff2] bg-white/70 shadow-[0_16px_42px_rgba(7,25,35,0.04)] sm:grid-cols-2 lg:grid-cols-4">
            {testimonialStats.map((stat, index) => {
              const mobileBorder = index < testimonialStats.length - 1 ? "border-b" : "";
              const tabletBorder = [index % 2 === 0 ? "sm:border-r" : "sm:border-r-0", index < 2 ? "sm:border-b" : "sm:border-b-0"].join(
                " "
              );
              const desktopBorder = index < testimonialStats.length - 1 ? "lg:border-r lg:border-b-0" : "lg:border-r-0 lg:border-b-0";

              return (
                <div
                  key={stat.label}
                  className={`flex items-center gap-6 border-[#d5e6ea] px-7 py-7 ${mobileBorder} ${tabletBorder} ${desktopBorder}`}
                >
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e4f7fb] text-[#062A5B]">
                    <Icon name={stat.icon} className="h-9 w-9" />
                  </span>
                  <span>
                    <span className="block text-[1.75rem] font-extrabold leading-tight text-[#062A5B]">{stat.value}</span>
                    <span className="mt-2 block text-[0.82rem] leading-[1.55] text-[#33414b]">{stat.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function WhatYouGetSection() {
  return (
    <AlignedPanelSection sectionNumber="07">
      <div className="grid gap-10 xl:grid-cols-[0.36fr_0.64fr] xl:items-start">
        <Reveal>
          <div className="relative z-10">
            <AlignedSectionHeading
              eyebrow="What You Get"
              title="Everything you need to streamline your shipping operations in one powerful platform."
              description="The platform is designed to keep operations simple, connected, and easier to scale as order volume grows."
            />
            <ActionAnchor href={`mailto:${companyProfile.email}`} className={`${primaryButtonClass} mt-8`}>
              Get Started
            </ActionAnchor>
          </div>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-2">
          {valueCards.map((item, index) => (
            <Reveal key={item.title} delay={0.05 * index}>
              <MotionArticle
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ duration: 0.25 }}
                className={`h-full rounded-xl border border-[#e5f1f3] p-5 shadow-[0_16px_40px_rgba(7,25,35,0.04)] sm:p-7 ${item.shell} ${
                  index === valueCards.length - 1 ? "md:col-span-2" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-[#062A5B] shadow-sm">
                    <Icon name={item.icon} />
                  </span>
                  <div>
                    <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#061A33]">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#33414b]">{item.description}</p>
                  </div>
                </div>
              </MotionArticle>
            </Reveal>
          ))}
        </div>
      </div>
    </AlignedPanelSection>
  );
}

function FaqRouteMap() {
  return (
    <div className="relative mt-9 h-40 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-x-0 top-4 h-32 opacity-30 [clip-path:polygon(0_20%,16%_8%,34%_22%,48%_4%,70%_16%,98%_25%,92%_72%,70%_62%,52%_78%,33%_68%,15%_82%,4%_62%)] [background-image:radial-gradient(circle,#80c5ce_1.35px,transparent_1.6px)] [background-size:8px_8px]" />
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 440 180" fill="none">
        <path
          d="M124 88 C156 138 210 134 252 108 C294 82 338 76 382 84"
          stroke="#062A5B"
          strokeDasharray="5 8"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
        <path d="M124 78v34" stroke="#062A5B" strokeLinecap="round" strokeWidth="8" />
        <circle cx="124" cy="78" r="13" fill="#062A5B" />
        <circle cx="124" cy="78" r="4" fill="white" />
        <path d="M382 72v36" stroke="#ED1C24" strokeLinecap="round" strokeWidth="8" />
        <circle cx="382" cy="72" r="13" fill="#ED1C24" />
        <circle cx="382" cy="72" r="4" fill="white" />
      </svg>
    </div>
  );
}

function FaqSupportIllustration() {
  return (
    <div className="relative h-36 w-40 shrink-0" aria-hidden="true">
      <div className="absolute left-7 top-1 h-20 w-20 rounded-full bg-[#f6c6a9]" />
      <div className="absolute left-5 top-0 h-24 w-24 rounded-full bg-[#123847] [clip-path:polygon(12%_18%,70%_0,96%_36%,88%_100%,12%_100%,0_42%)]" />
      <div className="absolute left-9 top-5 h-16 w-14 rounded-[45%] bg-[#ffd4b8]" />
      <div className="absolute left-14 top-10 h-1.5 w-1.5 rounded-full bg-[#16323c]" />
      <div className="absolute left-[4.4rem] top-10 h-1.5 w-1.5 rounded-full bg-[#16323c]" />
      <div className="absolute left-[3.55rem] top-[3.35rem] h-4 w-8 rounded-b-full border-b-2 border-[#9d5f4a]" />
      <div className="absolute left-3 top-9 h-10 w-6 rounded-full border-4 border-[#062A5B] bg-white" />
      <div className="absolute left-[5.9rem] top-9 h-10 w-6 rounded-full border-4 border-[#062A5B] bg-white" />
      <div className="absolute left-[5.4rem] top-[4.2rem] h-1.5 w-7 rounded-full bg-[#062A5B]" />
      <div className="absolute bottom-2 left-2 h-20 w-28 rounded-t-[3rem] bg-[#062A5B]" />
      <div className="absolute bottom-0 left-10 h-14 w-28 rounded-lg bg-[#d9f2f6] shadow-[0_8px_18px_rgba(7,25,35,0.08)]">
        <span className="absolute left-12 top-5 text-xs font-bold text-[#062A5B]">FG</span>
      </div>
      <div className="absolute right-0 top-6 rounded-2xl bg-[#062A5B] px-3 py-2 text-white shadow-sm">
        <span className="block h-1.5 w-6 rounded-full bg-white" />
        <span className="mt-1.5 block h-1.5 w-4 rounded-full bg-white/70" />
      </div>
      <div className="absolute right-3 top-[4.9rem] rounded-2xl bg-[#EEF4FB] px-3 py-2">
        <span className="block h-1.5 w-5 rounded-full bg-[#b5dce3]" />
        <span className="mt-1.5 block h-1.5 w-3 rounded-full bg-[#cfe9ee]" />
      </div>
    </div>
  );
}

function FaqPackageIllustration() {
  return (
    <div className="relative hidden h-24 w-28 shrink-0 sm:block" aria-hidden="true">
      <div className="absolute right-3 top-0 h-20 w-20 rounded-full border-2 border-[#062A5B] bg-[#cdeef4]" />
      <svg className="absolute right-4 top-1 h-[4.8rem] w-[4.8rem]" viewBox="0 0 92 92" fill="none">
        <circle cx="46" cy="46" r="41" fill="#cdeef4" stroke="#062A5B" strokeWidth="2" />
        <path d="M18 44h56M46 7c14 15 14 62 0 78M46 7c-14 15-14 62 0 78" stroke="#72b9c4" strokeWidth="2" />
        <path d="M26 20c12 8 28 8 40 0M26 72c12-8 28-8 40 0" stroke="#72b9c4" strokeWidth="2" />
      </svg>
      <div className="absolute bottom-1 left-5 h-9 w-9 rounded-sm bg-[#d99658] shadow-sm" />
      <div className="absolute bottom-1 left-14 h-10 w-10 rounded-sm bg-[#c98747] shadow-sm" />
      <div className="absolute bottom-8 left-10 h-9 w-9 rounded-sm bg-[#e5aa6c] shadow-sm" />
      <div className="absolute left-8 top-6 h-5 w-4 rounded-full border-2 border-[#ED1C24]" />
      <div className="absolute left-10 top-10 h-4 w-1 rounded-full bg-[#ED1C24]" />
      <div className="absolute right-0 top-7 h-5 w-4 rounded-full border-2 border-[#ED1C24]" />
      <div className="absolute right-1 top-11 h-4 w-1 rounded-full bg-[#ED1C24]" />
    </div>
  );
}

function FaqAccordionItem({ item, index, activeIndex, setActiveIndex }) {
  const isOpen = activeIndex === index;

  return (
    <div
      className="border-b border-[#e6eef1] last:border-b-0"
      onMouseEnter={() => setActiveIndex(index)}
      onFocus={() => setActiveIndex(index)}
    >
      <button
        type="button"
        className="grid w-full grid-cols-[2.1rem_1fr_auto] items-center gap-4 px-5 py-5 text-left sm:grid-cols-[2.3rem_1fr_auto] sm:px-8"
        onClick={() => setActiveIndex(isOpen ? null : index)}
        aria-expanded={isOpen}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#062A5B] text-white shadow-[0_8px_18px_rgba(6,42,91,0.16)]">
          <Icon name={isOpen ? "minus" : "plus"} className="h-4 w-4" />
        </span>
        <span className="text-[0.98rem] font-extrabold text-[#061A33] sm:text-[1.05rem]">{item.question}</span>
        <Icon name="chevronDown" className={`h-5 w-5 text-[#062A5B] transition ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <MotionDiv
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-5 px-5 pb-8 pl-[4.55rem] pr-5 sm:grid-cols-[1fr_auto] sm:px-8 sm:pl-[5.55rem]">
              <p className="max-w-[43rem] text-sm font-medium leading-[1.75] text-[#183153]">{item.answer}</p>
              {index === 0 ? <FaqPackageIllustration /> : null}
            </div>
          </MotionDiv>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FaqSection() {
  const [activeFaq, setActiveFaq] = useState(0);

  return (
    <section id="faq" className="section-transition bg-[#062A5B]">
      <div className="relative mx-auto max-w-[1518px] overflow-hidden rounded-t-[2rem] bg-[#F5F8FC] px-5 pb-10 pt-12 sm:rounded-t-[4.6rem] sm:px-8 sm:pb-12 sm:pt-14 lg:px-16">
        <div className="grid gap-10 lg:grid-cols-[0.35fr_0.65fr] lg:items-start">
          <Reveal>
            <div className="relative z-10">
              <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#ED1C24]">FAQ</p>
              <h2 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.16] text-[#061A33] sm:text-[2.55rem]">
                Frequently Asked
                <br />
                <span className="text-[#062A5B]">Questions.</span>
              </h2>
              <p className="mt-5 max-w-[25rem] text-sm font-medium leading-[1.75] text-[#183153] sm:text-base">
                Everything you need to know about Pax Logistics and how it can simplify your shipping operations.
              </p>

              <FaqRouteMap />

              <div className="mt-7 rounded-xl border border-[#e6f1f3] bg-white p-5 shadow-[0_18px_50px_rgba(7,25,35,0.05)] sm:p-6">
                <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
                  <FaqSupportIllustration />
                  <div>
                    <h3 className="text-[1.12rem] font-extrabold leading-tight text-[#061A33]">
                      Still have questions?
                      <br />
                      <span className="text-[#062A5B]">We're here to help!</span>
                    </h3>
                    <p className="mt-4 text-sm font-medium leading-[1.7] text-[#183153]">
                      Our support team is ready to assist you with anything you need.
                    </p>
                    <a
                      href={`mailto:${companyProfile.email}`}
                      className="mt-6 inline-flex min-h-11 items-center justify-center gap-3 rounded-lg bg-[#062A5B] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(6,42,91,0.16)] transition hover:-translate-y-0.5 hover:bg-[#123763]"
                      style={{ color: "#ffffff" }}
                    >
                      <span>Contact Support</span>
                      <Icon name="chevronRight" className="h-5 w-5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div
              className="overflow-hidden rounded-xl border border-[#e6f1f3] bg-white shadow-[0_20px_56px_rgba(7,25,35,0.05)]"
              onMouseLeave={() => setActiveFaq(0)}
            >
              {faqItems.map((item, index) => (
                <FaqAccordionItem key={item.question} item={item} index={index} activeIndex={activeFaq} setActiveIndex={setActiveFaq} />
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <div className="mt-10 grid overflow-hidden rounded-xl border border-[#dfeff2] bg-[#f5fcfe] shadow-[0_16px_42px_rgba(7,25,35,0.04)] lg:grid-cols-[1.25fr_0.8fr_0.8fr_0.8fr]">
            <div className="flex items-center gap-5 border-b border-[#d5e6ea] px-7 py-7 lg:border-b-0 lg:border-r">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e4f7fb] text-[#062A5B]">
                <Icon name="messages" className="h-9 w-9" />
              </span>
              <span>
                <span className="block text-[1.05rem] font-extrabold text-[#061A33]">Can't find what you're looking for?</span>
                <span className="mt-2 block text-sm font-medium text-[#33414b]">Our team is just a message away.</span>
              </span>
            </div>
            {[
              {
                title: "Live Chat",
                detail: "Chat with our experts",
                icon: "messageSquare",
              },
              { title: "Email Us", detail: companyProfile.email, icon: "mail" },
              { title: "Call Us", detail: companyProfile.phone, icon: "phone" },
            ].map((item, index) => (
              <a
                key={item.title}
                href={
                  item.icon === "mail"
                    ? `mailto:${companyProfile.email}`
                    : item.icon === "phone"
                    ? `tel:${companyProfile.mobile}`
                    : AUTH_APP_URL
                }
                className={`flex items-center gap-5 border-b border-[#d5e6ea] px-7 py-7 transition hover:bg-white/70 lg:border-b-0 ${
                  index < 2 ? "lg:border-r" : ""
                }`}
              >
                <Icon name={item.icon} className="h-9 w-9 shrink-0 text-[#062A5B]" />
                <span>
                  <span className="block text-sm font-extrabold text-[#061A33]">{item.title}</span>
                  <span className="mt-1 block text-sm font-medium text-[#33414b]">{item.detail}</span>
                </span>
              </a>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function AnalyticsDashboard() {
  return (
    <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_20px_56px_rgba(7,25,35,0.05)] sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Analytics dashboard</p>
          <h3 className="mt-3 font-display text-3xl text-slate-950">Operational snapshot</h3>
        </div>
        <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm">Live</span>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["92%", "On-time delivery"],
          ["18%", "Lower RTO drift"],
          ["24/7", "Courier visibility"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl border border-[#e7f0f2] bg-[#F5F8FC] p-4 shadow-sm">
            <p className="font-display text-3xl text-slate-950">{value}</p>
            <p className="mt-2 text-sm text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-[#e7f0f2] bg-white p-5">
        <div className="flex items-end gap-3">
          {dashboardBars.map((barClass, index) => (
            <MotionDiv
              key={`${barClass}-${index}`}
              initial={{ scaleY: 0.18, opacity: 0.45 }}
              whileInView={{ scaleY: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{
                duration: 0.7,
                delay: index * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`origin-bottom flex-1 rounded-t-[0.75rem] ${barClass}`}
            />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[#eef8ff] px-4 py-3 text-sm text-slate-600">Delivery performance trends</div>
          <div className="rounded-lg bg-[#FDE7EA] px-4 py-3 text-sm text-slate-600">COD and cost movement</div>
          <div className="rounded-lg bg-[#F5F8FC] px-4 py-3 text-sm text-slate-600">Customer experience signals</div>
        </div>
      </div>
    </div>
  );
}

function InsightsSection() {
  return (
    <AlignedPanelSection sectionNumber="08">
      <div className="grid gap-10 lg:grid-cols-[0.45fr_0.55fr] lg:items-center">
        <Reveal>
          <div>
            <AlignedSectionHeading
              eyebrow="Unlock Actionable Insights"
              title="Make data-driven decisions with real-time shipping intelligence."
              description="Make data-driven decisions with real-time insights on delivery performance, courier costs, COD collection, RTO trends, and customer satisfaction metrics."
            />

            <div className="mt-8 grid gap-4">
              {insightCards.map((card, index) => (
                <Reveal key={card.title} delay={0.05 * index}>
                  <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_16px_40px_rgba(7,25,35,0.04)]">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EEF4FB] text-[#062A5B]">
                        <Icon name={card.icon} />
                      </span>
                      <div>
                        <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#061A33]">{card.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{card.description}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <ActionAnchor href={`mailto:${companyProfile.email}`} className={`${primaryButtonClass} mt-8`}>
              Get Started
            </ActionAnchor>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <AnalyticsDashboard />
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function CommercePanel() {
  return (
    <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_20px_56px_rgba(7,25,35,0.05)] sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#e7f0f2] bg-[#F5F8FC] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Store connections</p>
          <div className="mt-4 grid gap-3">
            {["Shopify", "WooCommerce", "Amazon", "Flipkart"].map((label, index) => (
              <MotionDiv
                key={label}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  duration: 0.48,
                  delay: index * 0.05,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
              >
                <span className="flex items-center gap-2">
                  <Icon
                    name={index === 0 ? "shoppingBag" : index === 1 ? "store" : index === 2 ? "globe" : "package"}
                    className="h-4 w-4"
                  />
                  <span>{label}</span>
                </span>
                <span className="rounded-full bg-[#EEF4FB] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-700">
                  Synced
                </span>
              </MotionDiv>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#e7f0f2] bg-[#FDE7EA] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Shipment updates</p>
          <div className="mt-4 space-y-3">
            {[
              ["AWB linked", "Store order updated"],
              ["Manifest ready", "Courier allocation completed"],
              ["Tracking live", "Customer timeline synced"],
            ].map(([title, detail], index) => (
              <MotionDiv
                key={title}
                initial={{ opacity: 0, x: 14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  duration: 0.48,
                  delay: index * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="rounded-lg bg-white px-4 py-3 shadow-sm"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Icon name={index === 0 ? "package" : index === 1 ? "checkCircle" : "bell"} className="h-4 w-4" />
                  <span>{title}</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">{detail}</p>
              </MotionDiv>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#e7f0f2] bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {["Orders received", "AWB sent back", "Tracking synced"].map((item, index) => (
            <MotionDiv
              key={item}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.45 }}
              transition={{
                duration: 0.45,
                delay: index * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="rounded-lg bg-[#F5F8FC] px-4 py-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Step 0{index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{item}</p>
            </MotionDiv>
          ))}
        </div>
      </div>
    </div>
  );
}

function EcommerceSection() {
  return (
    <AlignedPanelSection sectionNumber="09">
      <div className="grid gap-10 lg:grid-cols-[0.45fr_0.55fr] lg:items-center">
        <Reveal>
          <div>
            <AlignedSectionHeading
              eyebrow="eCommerce Integration"
              title="Connect Your Stores and Marketplaces"
              description="Connect with Shopify, WooCommerce, Magento, BigCommerce, Wix and more. Automatically sync orders, update AWB numbers, and track shipments in real-time."
            />

            <div className="mt-8 grid gap-4">
              {ecommerceCards.map((item, index) => (
                <Reveal key={item.title} delay={0.05 * index}>
                  <div className="rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_16px_40px_rgba(7,25,35,0.04)]">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#FDE7EA] text-[#ED1C24]">
                        <Icon name={item.icon} />
                      </span>
                      <div>
                        <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#061A33]">{item.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{item.description}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <ActionAnchor href={`mailto:${companyProfile.email}`} className={`${primaryButtonClass} mt-8`}>
              Get Started
            </ActionAnchor>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <CommercePanel />
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function RateComparisonPreview() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#e5f1f3] bg-white p-5 shadow-[0_20px_56px_rgba(7,25,35,0.05)] sm:p-7">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ED1C24]">Rate engine</p>
          <h3 className="mt-3 font-display text-3xl font-extrabold text-[#061A33]">Best carrier, visible cost.</h3>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#e4f7fb] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#062A5B]">
          <Icon name="spark" className="h-4 w-4" />
          Smart match
        </span>
      </div>

      <div className="relative mt-7 grid gap-4">
        {rateRows.map((row, index) => (
          <MotionArticle
            key={row.courier}
            initial={{ opacity: 0, x: 28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{
              duration: 0.42,
              delay: index * 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
            whileHover={{ y: -4, scale: 1.01 }}
            className="rounded-xl border border-[#D6E1EF] bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#062A5B] text-sm font-extrabold text-white">
                  {row.courier.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-[#061A33]">{row.courier}</p>
                  <p className="mt-1 text-xs font-semibold text-[#66747e]">
                    {row.lane} - {row.eta}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-extrabold text-[#062A5B]">{row.price}</p>
                <p className="text-xs font-semibold text-[#ED1C24]">{row.fit}</p>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-[#e8f4f6]">
              <div className={`h-full rounded-full bg-[linear-gradient(90deg,#062A5B,#ED1C24)] ${row.width}`} />
            </div>
          </MotionArticle>
        ))}
      </div>

      <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
        {["Rate", "SLA", "Risk"].map((label, index) => (
          <div key={label} className="rounded-lg border border-[#D6E1EF] bg-[#F5F8FC] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66747e]">{label}</p>
            <p className="mt-2 text-sm font-extrabold text-[#061A33]">{index === 0 ? "Compared" : index === 1 ? "Checked" : "Scored"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RateConfidenceSection() {
  return (
    <AlignedPanelSection sectionNumber="10">
      <div className="grid gap-10 lg:grid-cols-[0.46fr_0.54fr] lg:items-center">
        <Reveal>
          <div>
            <AlignedSectionHeading
              eyebrow="Pricing Confidence"
              title="Know the best shipping option before every dispatch."
              description="Give operators a clear view of courier rate, delivery promise, COD readiness, and serviceability so every order moves with the right cost-speed balance."
            />
            <div className="mt-8 grid gap-4">
              {rateCards.map((card, index) => (
                <Reveal key={card.title} delay={index * 0.05}>
                  <MotionArticle
                    whileHover={{ x: 6 }}
                    className="rounded-xl border border-[#D6E1EF] bg-white p-5 shadow-[0_18px_42px_rgba(7,25,35,0.05)]"
                  >
                    <div className="flex items-start gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#062A5B] text-white shadow-[0_12px_24px_rgba(6,42,91,0.18)]">
                        <Icon name={card.icon} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#061A33]">{card.title}</h3>
                          <span className="rounded-full bg-[#FDE7EA] px-3 py-1 text-xs font-extrabold text-[#ED1C24]">
                            {card.metric} {card.label}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{card.description}</p>
                      </div>
                    </div>
                  </MotionArticle>
                </Reveal>
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionAnchor href={AUTH_APP_URL} className={primaryButtonClass}>
                Get Started
              </ActionAnchor>
              <ActionAnchor
                href="/rate-calculator"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-[#062A5B] bg-white px-6 py-3 text-sm font-semibold text-[#062A5B] transition hover:-translate-y-0.5 hover:bg-[#F5F8FC] sm:w-auto"
              >
                Rate Calculator
              </ActionAnchor>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <RateComparisonPreview />
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function StackPreviewPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#D6E1EF] bg-white p-5 shadow-[0_24px_66px_rgba(7,25,35,0.06)] sm:p-7">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#062A5B,#0f9aa4,#ED1C24)]" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ED1C24]">Live workspace</p>
          <h3 className="mt-3 font-display text-3xl font-extrabold leading-tight text-[#061A33]">
            One queue from order sync to delivery action.
          </h3>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#EEF4FB] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#062A5B]">
          <Icon name="bolt" className="h-4 w-4" />
          Active
        </span>
      </div>

      <div className="mt-7 grid gap-3">
        {stackRows.map(([channel, action, status], index) => (
          <MotionArticle
            key={channel}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{
              duration: 0.42,
              delay: index * 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="rounded-lg border border-[#E1ECF4] bg-[#F8FBFE] p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-[#062A5B] shadow-sm">
                  <Icon
                    name={index === 0 ? "shoppingBag" : index === 1 ? "store" : index === 2 ? "globe" : "package"}
                    className="h-5 w-5"
                  />
                </span>
                <div>
                  <p className="text-sm font-extrabold text-[#061A33]">{channel}</p>
                  <p className="mt-1 text-xs font-semibold text-[#66747e]">{action}</p>
                </div>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#062A5B] shadow-sm">{status}</span>
            </div>
          </MotionArticle>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {stackMetrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-[#D6E1EF] bg-white p-4">
            <p className="text-2xl font-extrabold text-[#062A5B]">{metric.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#66747e]">{metric.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShippingStackSection() {
  return (
    <AlignedPanelSection sectionNumber="11">
      <div className="grid gap-10 lg:grid-cols-[0.48fr_0.52fr] lg:items-center">
        <Reveal>
          <div>
            <AlignedSectionHeading
              eyebrow="Complete Landing Flow"
              title="Give sellers a clear path from first order to repeatable delivery control."
              description="The landing page now frames Pax Logistics as a practical operating layer: connect channels, choose couriers with confidence, automate updates, and recover delivery exceptions from one workspace."
            />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {stackCards.map((card, index) => (
                <Reveal key={card.title} delay={index * 0.05}>
                  <MotionArticle
                    whileHover={{ y: -5, scale: 1.01 }}
                    className="h-full rounded-xl border border-[#D6E1EF] bg-white p-5 shadow-[0_18px_42px_rgba(7,25,35,0.05)]"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#FDE7EA] text-[#ED1C24]">
                      <Icon name={card.icon} />
                    </span>
                    <h3 className="mt-4 font-display text-[1.18rem] font-extrabold leading-tight text-[#061A33]">{card.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#33414b]">{card.description}</p>
                  </MotionArticle>
                </Reveal>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionAnchor href={AUTH_APP_URL} className={primaryButtonClass}>
                Start Shipping
              </ActionAnchor>
              <ActionAnchor
                href={`mailto:${companyProfile.email}`}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-[#062A5B] bg-white px-6 py-3 text-sm font-semibold text-[#062A5B] transition hover:-translate-y-0.5 hover:bg-[#F5F8FC] sm:w-auto"
              >
                Talk to Sales
              </ActionAnchor>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.14}>
          <StackPreviewPanel />
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function LaunchTimelineVisual() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/12 bg-[#014b55] p-5 text-white shadow-[0_30px_90px_rgba(0,45,53,0.18)] sm:p-7">
      <div className="absolute inset-x-0 top-0 h-32 opacity-25 [clip-path:polygon(0_20%,16%_8%,34%_22%,48%_4%,70%_16%,98%_25%,92%_72%,70%_62%,52%_78%,33%_68%,15%_82%,4%_62%)] [background-image:radial-gradient(circle,#c8f5fb_1.3px,transparent_1.55px)] [background-size:8px_8px]" />
      <div className="relative">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#ffd8a8]">Launch plan</p>
        <h3 className="mt-3 max-w-md font-display text-3xl font-extrabold leading-tight">
          From first connect to live shipments without the chaos.
        </h3>
      </div>

      <div className="relative mt-9 grid gap-4">
        {launchSteps.map((step, index) => (
          <MotionArticle
            key={step.title}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{
              duration: 0.42,
              delay: index * 0.07,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative rounded-xl border border-white/10 bg-white/[0.08] p-5 backdrop-blur-sm"
          >
            {index < launchSteps.length - 1 ? (
              <span className="absolute left-[2.35rem] top-[4.9rem] h-8 w-px bg-white/18" aria-hidden="true" />
            ) : null}
            <div className="flex gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white text-[#062A5B]">
                <Icon name={step.icon} />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/52">Step 0{index + 1}</p>
                <h4 className="mt-1 text-lg font-extrabold text-white">{step.title}</h4>
                <p className="mt-2 text-sm leading-7 text-white/72">{step.description}</p>
              </div>
            </div>
          </MotionArticle>
        ))}
      </div>

      <div className="relative mt-6 rounded-xl bg-white p-5 text-[#061A33]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#ED1C24]">Dedicated help</p>
            <p className="mt-2 text-lg font-extrabold">Support ready before your first label.</p>
          </div>
          <a
            href={`mailto:${companyProfile.email}`}
            className="inline-flex items-center justify-center rounded-lg bg-[#062A5B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#123763]"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}

function LaunchSupportSection() {
  return (
    <AlignedPanelSection sectionNumber="12" shellClassName="pb-12 sm:pb-14 lg:pb-16">
      <div className="grid gap-10 lg:grid-cols-[0.54fr_0.46fr] lg:items-center">
        <Reveal>
          <LaunchTimelineVisual />
        </Reveal>

        <Reveal delay={0.12}>
          <div>
            <AlignedSectionHeading
              eyebrow="Launch With Confidence"
              title="A shipping platform is only useful when your team can run it daily."
              description="Pax Logistics pairs clean software with practical setup support, so teams can move from fragmented courier workflows into a reliable operating rhythm."
            />
            <div className="mt-8 grid gap-4">
              {supportCards.map((card, index) => (
                <Reveal key={card.title} delay={index * 0.05}>
                  <MotionArticle
                    whileHover={{ y: -5, scale: 1.01 }}
                    className="rounded-xl border border-[#D6E1EF] bg-white p-5 shadow-[0_18px_42px_rgba(7,25,35,0.05)]"
                  >
                    <div className="flex items-start gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#fff1df] text-[#ED1C24]">
                        <Icon name={card.icon} />
                      </span>
                      <div>
                        <h3 className="font-display text-[1.35rem] font-extrabold leading-tight text-[#061A33]">{card.title}</h3>
                        <p className="mt-3 text-sm leading-7 text-[#33414b]">{card.description}</p>
                      </div>
                    </div>
                  </MotionArticle>
                </Reveal>
              ))}
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <a
                href={`tel:${companyProfile.mobile}`}
                className="flex items-center gap-4 rounded-xl border border-[#D6E1EF] bg-[#F5F8FC] p-4 text-sm font-semibold text-[#061A33] transition hover:-translate-y-0.5 hover:bg-white"
              >
                <Icon name="phone" className="h-6 w-6 text-[#062A5B]" />
                <span>{companyProfile.mobile}</span>
              </a>
              <a
                href={`mailto:${companyProfile.email}`}
                className="flex items-center gap-4 rounded-xl border border-[#D6E1EF] bg-[#F5F8FC] p-4 text-sm font-semibold text-[#061A33] transition hover:-translate-y-0.5 hover:bg-white"
              >
                <Icon name="mail" className="h-6 w-6 text-[#062A5B]" />
                <span>{companyProfile.email}</span>
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </AlignedPanelSection>
  );
}

function FeatherLandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <main id="home" className="modern-landing overflow-hidden bg-[#f7f9fb]">
        <HeroSection />
        <PlatformsSection />
        <ShippingToolsSection />
        <EcommerceSection />
        <RateConfidenceSection />
        <InsightsSection />
        <ShippingStackSection />
      </main>
    </MotionConfig>
  );
}

export default FeatherLandingPage;
