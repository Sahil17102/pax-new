import { cp, mkdir } from "node:fs/promises";

const routes = [
  "services",
  "estimate",
  "rate-calculator",
  "weight-calculator",
  "track",
  "contact",
  "sign-in",
  "dashboard",
];

for (const route of routes) {
  const routeDirectory = `dist/${route}`;
  await mkdir(routeDirectory, { recursive: true });
  await cp("dist/index.html", `${routeDirectory}/index.html`);
}
