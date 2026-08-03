export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "https://pax-new.onrender.com"
).replace(/\/+$/, "");

const isLocalHost = typeof window !== "undefined"
  && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname.toLowerCase());
const localHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
const defaultClientUrl = isLocalHost ? `http://${localHostname}:5173` : "/app";
const stripTrailingSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

export const CLIENT_APP_URL = stripTrailingSlash(
  import.meta.env.VITE_CLIENT_APP_URL || defaultClientUrl,
);

export const CLIENT_AUTH_URL = stripTrailingSlash(
  import.meta.env.VITE_AUTH_APP_URL || `${CLIENT_APP_URL}/#/login`,
);

export const ADMIN_AUTH_URL = stripTrailingSlash(
  import.meta.env.VITE_ADMIN_AUTH_URL
    || (isLocalHost ? `http://${localHostname}:3000/#/auth/signin` : "/admin/#/auth/signin"),
);
