import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink } from "react-router-dom";
import { AUTH_APP_URL } from "../../utils/appLinks";
import Icon from "./Icons";
import { companyProfile, siteNavigation } from "./siteData";
import { shippingTermsColumns } from "../../utils/shippingTerms";

const MotionNav = motion.nav;
const MotionDiv = motion.div;
const logoImage = "/assets/pax-logo.png";

const productLinks = [
  { label: "Shipment Tracking", to: "/tracking", icon: "mapPin" },
  { label: "Weight Calculator", to: "/volumetric-weight-calculator", icon: "calculator" },
  { label: "Rate Calculator", to: "/rate-calculator", icon: "wallet" },
];

function NetworkStatus({ mobile = false }) {
  return (
    <div
      className={[
        "items-center gap-3 border border-[#CFE0EE] bg-white/90 shadow-[0_10px_24px_rgba(6,42,91,0.08)]",
        mobile ? "flex rounded-lg px-4 py-3" : "hidden rounded-full px-3.5 py-2 xl:flex",
      ].join(" ")}
      aria-label="Pax Logistics shipping network is live with more than 27 carriers"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A37A] opacity-35" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#16A37A] ring-4 ring-[#DDF7EE]" />
      </span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EEF4FB] text-[#062A5B]" aria-hidden="true">
        <Icon name="truck" className="h-4 w-4" />
      </span>
      <span className="min-w-0 leading-none">
        <span className="block text-[0.63rem] font-extrabold uppercase tracking-[0.15em] text-[#16A37A]">
          Network live
        </span>
        <span className="mt-1 block whitespace-nowrap text-xs font-extrabold text-[#061A33]">27+ carriers connected</span>
      </span>
    </div>
  );
}

function DesktopNavLink({ item }) {
  if (item.href) {
    return (
      <a
        href={item.href}
        className="rounded-lg px-3 py-2 text-sm font-semibold text-[#061A33] transition hover:bg-white/82 hover:text-[#062A5B]"
      >
        {item.label}
      </a>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        [
          "rounded-lg px-3 py-2 text-sm font-semibold transition",
          isActive
            ? "bg-white/78 text-[#062A5B] shadow-[0_8px_18px_rgba(6,42,91,0.08)]"
            : "text-[#061A33] hover:bg-white/72 hover:text-[#062A5B]",
        ].join(" ")
      }
    >
      {item.label}
    </NavLink>
  );
}

function MobileNavLink({ item, onClose }) {
  if (item.href) {
    return (
      <a
        href={item.href}
        className="rounded-lg bg-white px-4 py-3 text-sm font-medium text-[#183153] transition hover:bg-[#F5F8FC] hover:text-[#062A5B]"
        onClick={onClose}
      >
        {item.label}
      </a>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        [
          "rounded-lg px-4 py-3 text-sm font-medium transition",
          isActive
            ? "bg-[#EEF4FB] text-[#062A5B]"
            : "bg-white text-[#183153] hover:bg-[#F5F8FC] hover:text-[#062A5B]",
        ].join(" ")
      }
      onClick={onClose}
    >
      {item.label}
    </NavLink>
  );
}

export function SiteHeader({ menuOpen, onToggleMenu, onCloseMenu }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#D6E1EF]/80 bg-white/68 shadow-[0_10px_30px_rgba(6,26,51,0.06)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/62">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-5 py-2.5 sm:gap-6 sm:px-8 lg:px-16">
        <Link to="/" className="shrink-0">
          <img src={logoImage} alt={companyProfile.name} className="h-12 w-auto object-contain sm:h-14" />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-3 lg:flex xl:gap-5">
          {siteNavigation.map((item) => (
            <DesktopNavLink key={item.to || item.href} item={item} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <NetworkStatus />
          <a
            href={AUTH_APP_URL}
            className="hidden min-h-11 items-center gap-3 rounded-lg bg-[#061A33] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(6,26,51,0.18)] transition hover:-translate-y-0.5 hover:bg-[#123763] sm:inline-flex"
            style={{ color: "#ffffff" }}
          >
            <span>Enter platform</span>
            <Icon name="chevronRight" className="h-5 w-5" />
          </a>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D8E4F2] bg-white text-[#062A5B] shadow-[0_12px_26px_rgba(6,42,91,0.08)] transition hover:bg-[#F5F8FC]"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={onToggleMenu}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {menuOpen ? (
          <MotionNav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-[#D6E1EF] bg-[#F5F8FC]"
          >
            <div className="mx-auto grid max-w-7xl gap-3 px-4 py-4 sm:px-6">
              <NetworkStatus mobile />
              {siteNavigation.map((item) => (
                <MobileNavLink key={item.to || item.href} item={item} onClose={onCloseMenu} />
              ))}
              <a
                href={AUTH_APP_URL}
                onClick={onCloseMenu}
                className="inline-flex justify-center rounded-lg bg-[#062A5B] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#123763]"
              >
                Login
              </a>
            </div>
          </MotionNav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer id="site-footer" className="border-t-4 border-[#ED1C24] bg-[#041A38] text-white">
      <div className="mx-auto max-w-[1440px] px-5 py-12 sm:px-8 lg:px-16 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <MotionDiv
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <img
              src={logoImage}
              alt={companyProfile.name}
              className="h-16 w-auto rounded-lg bg-white object-contain p-1"
            />
            <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.16em] text-[#F36673]">
              Your shipping control centre
            </p>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              Track, calculate, and ship from one reliable platform.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/70 sm:text-base">
              Use Pax Logistics tools before dispatch, then enter the platform when you are ready to manage live shipments.
            </p>
            <a
              href={AUTH_APP_URL}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#ED1C24] px-6 py-3 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#B80F1A] sm:w-auto"
              style={{ color: "#ffffff" }}
            >
              Enter platform
              <Icon name="chevronRight" className="h-5 w-5" />
            </a>
          </MotionDiv>

          <div className="grid gap-3 sm:grid-cols-3">
            {productLinks.map((item, index) => (
              <MotionDiv
                key={item.to}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
              >
                <NavLink
                  to={item.to}
                  className="group flex min-h-44 h-full flex-col justify-between rounded-lg border border-white/12 bg-white/[0.06] p-5 transition hover:-translate-y-1 hover:border-[#F36673]/70 hover:bg-white/[0.1]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-white text-[#062A5B]">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <span className="mt-8 flex items-end justify-between gap-3">
                    <span className="text-base font-extrabold text-white">{item.label}</span>
                    <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-[#F36673] transition group-hover:translate-x-1" />
                  </span>
                </NavLink>
              </MotionDiv>
            ))}
          </div>
        </div>

        <MotionDiv
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12 overflow-hidden rounded-xl border border-white/12 bg-white/[0.055] shadow-[0_24px_60px_rgba(0,0,0,0.12)]"
        >
          <div className="h-1 bg-[linear-gradient(90deg,#ED1C24,#F36673,#ED1C24)]" />
          <div className="p-5 sm:p-7 lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ED1C24] text-white shadow-[0_12px_28px_rgba(237,28,36,0.2)]">
                  <Icon name="shield" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-[#F36673]">Before you ship</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold text-white sm:text-2xl">Shipping &amp; Courier Terms &amp; Conditions</h2>
                </div>
              </div>
              <Link
                to="/terms-and-conditions"
                className="group inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-white/20 bg-white px-5 py-3 text-sm font-extrabold text-[#062A5B] transition hover:-translate-y-0.5 hover:border-white sm:w-auto"
              >
                Read Full Terms &amp; Conditions
                <Icon name="chevronRight" className="h-4 w-4 text-[#ED1C24] transition group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="mt-7 grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {shippingTermsColumns.map((column) => (
                <div key={column[0]} className="grid content-start gap-3">
                  {column.map((term) => (
                    <div key={term} className="flex items-start gap-3">
                      <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ED1C24]/15 text-[#F36673]">
                        <Icon name="checkCircle" className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-xs font-medium leading-6 text-white/72 sm:text-sm">{term}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </MotionDiv>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-white/62 md:flex-row md:items-center md:justify-between">
          <p>(c) 2026 {companyProfile.name}. Smart shipping for smarter sellers.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <a href={`mailto:${companyProfile.email}`} className="transition hover:text-white">
              {companyProfile.email}
            </a>
            <a href={`tel:${companyProfile.mobile}`} className="transition hover:text-white">
              {companyProfile.phone}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
