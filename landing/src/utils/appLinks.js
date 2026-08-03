const stripTrailingSlash = (url = "") => String(url).replace(/\/+$/, "");

const isLegacyDeploymentUrl = (url = "") =>
  /(^|\.)up\.railway\.app(?=\/|$)/i.test(
    String(url).replace(/^https?:\/\//i, ""),
  );

const resolveProductionUrl = (configuredUrl, fallbackUrl) => {
  const configured = stripTrailingSlash(configuredUrl);
  return configured && !isLegacyDeploymentUrl(configured)
    ? configured
    : stripTrailingSlash(fallbackUrl);
};

const normalizeAdminAuthUrl = (url) => {
  const normalized = stripTrailingSlash(url);
  return /^https:\/\/express-magic-admin\.onrender\.com\/auth\/signin$/i.test(normalized)
    ? "https://pax-log-admin.onrender.com/#/auth/signin"
    : normalized;
};

const UNIFIED_RENDER_CLIENT_URL = "https://pax-log.onrender.com/app";

const normalizeClientAppUrl = (url) => {
  const normalized = stripTrailingSlash(url);
  if (/^https:\/\/express-magic-client\.onrender\.com(?:\/.*)?$/i.test(normalized)) {
    return UNIFIED_RENDER_CLIENT_URL;
  }
  if (/^https:\/\/express-magic\.onrender\.com$/i.test(normalized)) {
    return UNIFIED_RENDER_CLIENT_URL;
  }
  return normalized;
};

const normalizeClientAuthUrl = (url) => {
  const normalized = stripTrailingSlash(url);
  if (
    /^https:\/\/express-magic-client\.onrender\.com(?:\/login)?$/i.test(normalized) ||
    /^https:\/\/express-magic\.onrender\.com\/login$/i.test(normalized) ||
    normalized.toLowerCase() === UNIFIED_RENDER_CLIENT_URL.toLowerCase() ||
    /^https:\/\/express-magic\.onrender\.com\/app\/login$/i.test(normalized) ||
    /^https:\/\/express-magic\.onrender\.com\/app\/#(?:\/login)?$/i.test(normalized)
  ) {
    return `${UNIFIED_RENDER_CLIENT_URL}/#/login`;
  }
  return normalized;
};

const inferLocalHostUrl = (port) => {
  if (typeof window === "undefined" || !window.location?.hostname) {
    return "";
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    return "";
  }

  return `${window.location.protocol}//${window.location.hostname}:${port}`;
};

const defaultClientAppUrl = import.meta.env.DEV
  ? inferLocalHostUrl(import.meta.env.VITE_CLIENT_APP_PORT || "8089") || UNIFIED_RENDER_CLIENT_URL
  : UNIFIED_RENDER_CLIENT_URL;

const defaultAdminAppUrl = import.meta.env.DEV
  ? inferLocalHostUrl(import.meta.env.VITE_ADMIN_APP_PORT || "8090") || "https://pax-log-admin.onrender.com"
  : "https://pax-log-admin.onrender.com";

const defaultApiBaseUrl = import.meta.env.DEV
  ? `${inferLocalHostUrl(import.meta.env.VITE_API_PORT || "8092") || "https://pax-new.onrender.com"}/api`
  : "https://pax-new.onrender.com/api";

export const CLIENT_APP_URL = normalizeClientAppUrl(
  resolveProductionUrl(import.meta.env.VITE_CLIENT_APP_URL, defaultClientAppUrl),
);

export const AUTH_APP_URL = normalizeClientAuthUrl(
  resolveProductionUrl(
    import.meta.env.VITE_AUTH_APP_URL,
    `${CLIENT_APP_URL}/#/login`,
  ),
);

export const ADMIN_APP_URL = resolveProductionUrl(
  import.meta.env.VITE_ADMIN_APP_URL,
  defaultAdminAppUrl,
);

export const ADMIN_AUTH_URL = normalizeAdminAuthUrl(
  resolveProductionUrl(
    import.meta.env.VITE_ADMIN_AUTH_URL,
    `${ADMIN_APP_URL}/#/auth/signin`,
  ),
);

export const API_BASE_URL = resolveProductionUrl(
  import.meta.env.VITE_API_URL,
  defaultApiBaseUrl,
);

export const CLIENT_RATE_CALCULATOR_URL = `${CLIENT_APP_URL}/#/tools/rate_calculator`;

export const launchDestinations = [
  {
    label: "Client App",
    description: "Merchant dashboard, orders, billing, and shipping tools.",
    url: CLIENT_APP_URL,
  },
  {
    label: "Merchant Login",
    description: "Open the auth flow for merchants, onboarding, and account access.",
    url: AUTH_APP_URL,
  },
  {
    label: "Admin Panel",
    description: "Open the operations control layer and admin workspace.",
    url: ADMIN_AUTH_URL,
  },
];

export function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openClientApp() {
  openExternal(CLIENT_APP_URL);
}

export function openAuthPortal() {
  openExternal(AUTH_APP_URL);
}

export function openAdminPortal() {
  openExternal(ADMIN_AUTH_URL);
}
