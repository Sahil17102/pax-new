import { cp, mkdir, rm } from "node:fs/promises";

await rm("public", { recursive: true, force: true });
await mkdir("public/assets", { recursive: true });
await cp("assets/favicon.svg", "public/assets/favicon.svg");
await cp("assets/pax-logo.png", "public/assets/pax-logo.png");
await cp("assets/pax-real-courier.jpg", "public/assets/pax-real-courier.jpg");
await cp("assets/pax-real-warehouse.jpg", "public/assets/pax-real-warehouse.jpg");
await cp("assets/pax-last-mile-delivery.png", "public/assets/pax-last-mile-delivery.png");
await cp("assets/pax-courier-hero.png", "public/assets/pax-courier-hero.png");
await cp("assets/pax-warehouse-operations.png", "public/assets/pax-warehouse-operations.png");
await cp("assets/pax-local-vans-v2.jpg", "public/assets/pax-local-vans-v2.jpg");
await cp("assets/pax-intercity-truck-v2.jpg", "public/assets/pax-intercity-truck-v2.jpg");
await cp("assets/pax-domestic-sort-v2.jpg", "public/assets/pax-domestic-sort-v2.jpg");
await cp("assets/pax-smart-warehouse-v2.jpg", "public/assets/pax-smart-warehouse-v2.jpg");
