import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Lottie from "lottie-react";
import { Link, useNavigate } from "react-router-dom";
import deliveryAnimationUrl from "../../assets/delivery-animation.json?url";
import { operations, platformModules } from "./content";
import Icon from "./Icons";
import { ModulePreview, Reveal, SectionHeading } from "./primitives";

const MotionArticle = motion.article;
const MotionDiv = motion.div;
const MotionForm = motion.form;

function HeroTrackingCard() {
  const [mode, setMode] = useState("container");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    navigate("/tracking", {
      state: {
        query: query || "SRX-2048127",
        mode,
      },
    });
  };

  return (
    <MotionForm
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="hero-track-card max-w-[29rem] rounded-[1.75rem] p-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-sm">
          <Icon name="package" className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-base font-semibold text-slate-900">Track Shipment</p>
          <p className="text-sm text-slate-500">Get a quick status view without leaving the page.</p>
        </div>
      </div>

      <div className="mt-5 flex gap-5 border-t border-stone-200 pt-4 text-sm">
        {[
          { id: "container", label: "Container" },
          { id: "booking", label: "Booking Number" },
        ].map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-2 text-slate-700">
            <input
              type="radio"
              name="trackingMode"
              className="h-4 w-4 accent-slate-900"
              checked={mode === option.id}
              onChange={() => setMode(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter container/billing number"
          className="h-14 rounded-2xl border border-stone-200 bg-[#fcfbf6] px-4 text-sm text-slate-800 outline-none transition focus:border-[#f1d77b] focus:ring-4 focus:ring-[#f8edbf]"
        />
        <button
          type="submit"
          className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f3d971] text-slate-900 shadow-[0_14px_26px_rgba(215,188,77,0.28)] transition hover:-translate-y-0.5 hover:bg-[#efcf54]"
          aria-label="Search tracking number"
        >
          <Icon name="search" className="h-5 w-5" />
        </button>
      </div>
    </MotionForm>
  );
}

export function HeroSection() {
  const [animationData, setAnimationData] = useState(null);
  const [animationError, setAnimationError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadAnimation() {
      try {
        const response = await fetch(deliveryAnimationUrl);

        if (!response.ok) {
          throw new Error("Failed to load animation");
        }

        const data = await response.json();

        if (isMounted) {
          setAnimationData(data);
          setAnimationError(false);
        }
      } catch {
        if (isMounted) {
          setAnimationError(true);
        }
      }
    }

    loadAnimation();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="section-transition pt-6 sm:pt-8 lg:pt-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="hero-stage-shell rounded-[2.6rem] px-6 py-8 shadow-[0_30px_70px_rgba(82,66,28,0.08)] sm:px-8 sm:py-10 lg:px-12 lg:py-12">
          <div className="grid gap-12 lg:grid-cols-[0.92fr_0.88fr] lg:items-center">
            <Reveal delay={0.04}>
              <div className="max-w-2xl">
                <h1 className="max-w-3xl font-display text-4xl leading-[1.03] text-slate-900 sm:text-5xl lg:text-[4.35rem]">
                  Unlock the full potential of your shipping operations.
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                  Pax Logistics connects courier operations, pricing visibility, shipment tracking, and delivery follow-up into one cleaner logistics experience from booking to doorstep.
                </p>

                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    to="/rate-calculator"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#f3d971] px-6 py-4 text-sm font-semibold text-slate-900 shadow-[0_18px_34px_rgba(215,188,77,0.28)] transition hover:-translate-y-0.5 hover:bg-[#efcf54]"
                  >
                    <span>Check Rate Calculator</span>
                    <Icon name="arrowUpRight" className="h-4 w-4" />
                  </Link>
                  <Link
                    to="/tracking"
                    className="inline-flex items-center gap-3 text-sm font-semibold text-slate-900 transition hover:text-slate-700"
                  >
                    <span className="border-b border-slate-900 pb-0.5">Track Shipment</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-300 bg-white">
                      <Icon name="search" className="h-4 w-4" />
                    </span>
                  </Link>
                </div>

                <HeroTrackingCard />
              </div>
            </Reveal>

            <Reveal delay={0.14}>
              <MotionDiv
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <MotionDiv
                  animate={{ y: [0, -12, 0] }}
                  transition={{ duration: 6.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                  className="hero-animation-panel relative overflow-hidden rounded-[2.35rem] p-4 sm:p-5"
                >
                  <div className="hero-animation-glow absolute inset-x-10 top-8 h-20 rounded-full" />
                  <div className="relative rounded-[2rem] bg-[linear-gradient(180deg,#dbe8f3_0%,#f4efe4_46%,#fff8eb_100%)] p-4 sm:p-6">
                  <div className="absolute left-5 top-5 rounded-full border border-white/90 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Delivery animation
                  </div>
                    {animationData ? (
                      <Lottie
                        animationData={animationData}
                        loop
                        autoplay
                        rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
                        className="mx-auto aspect-square h-[20rem] w-full max-w-[30rem] sm:h-[24rem] lg:h-[31rem]"
                      />
                    ) : (
                      <div className="flex aspect-square h-[20rem] w-full max-w-[30rem] items-center justify-center rounded-[1.65rem] border border-white/80 bg-white/55 text-center sm:h-[24rem] lg:h-[31rem]">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                            {animationError ? "Animation unavailable" : "Loading animation"}
                          </p>
                          <p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">
                            {animationError
                              ? "The delivery motion panel could not be loaded just now."
                              : "Preparing the delivery visual for the hero section."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </MotionDiv>
              </MotionDiv>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

export function OperationsSection() {
  return (
    <section id="operations" className="section-transition mt-20 sm:mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Operations Flow"
            title="A cleaner dispatch rhythm from first order to final delivery."
            description="The operating model is built to reduce switching, improve shipping decisions, and keep delivery confidence high through every stage."
          />
        </Reveal>

        <div className="mt-10 rounded-[2.5rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(217,230,247,0.24))] p-5 shadow-[0_24px_70px_rgba(15,44,67,0.08)] sm:p-8">
          <div className="mb-6 hidden h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent lg:block" />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {operations.map((stage, index) => (
              <Reveal key={stage.title} delay={0.08 * index}>
                <MotionArticle
                  whileHover={{ y: -6, scale: 1.01 }}
                  transition={{ duration: 0.25 }}
                  className="surface-card rounded-[2rem] p-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                      <Icon name={stage.icon} />
                    </span>
                    <span className="text-sm font-semibold text-slate-400">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 font-display text-2xl text-slate-900">{stage.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{stage.description}</p>
                  <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    {stage.detail}
                  </p>
                </MotionArticle>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ModulesSection() {
  return (
    <section id="platform-modules" className="section-transition mt-20 sm:mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SectionHeading
            eyebrow="Platform Modules"
            title="Core modules shaped around shipping teams, not generic dashboards."
            description="Each part of the interface is designed to help operators move quickly, reduce errors, and stay in control as shipment volume grows."
          />
        </Reveal>

        <div className="mt-10 grid gap-5 xl:grid-cols-3">
          {platformModules.map((module, index) => (
            <Reveal key={module.title} delay={0.08 * index}>
              <MotionArticle
                whileHover={{ y: -6, scale: 1.01 }}
                transition={{ duration: 0.25 }}
                className="surface-card rounded-[2rem] p-6"
              >
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <Icon name={module.icon} />
                  </span>
                  <h3 className="font-display text-2xl text-slate-900">{module.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{module.description}</p>
                <ul className="mt-5 grid gap-3">
                  {module.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-sm text-slate-600">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-gradient-to-r from-sky-300 to-amber-200" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <ModulePreview title={module.previewTitle} />
                </div>
              </MotionArticle>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
