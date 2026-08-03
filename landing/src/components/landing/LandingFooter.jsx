import EastRoundedIcon from "@mui/icons-material/EastRounded";
import { Box, Button, Container, Divider, Typography } from "@mui/material";
import {
  launchDestinations,
  openAdminPortal,
  openAuthPortal,
  openClientApp,
} from "../../utils/appLinks";
import { MotionCard } from "./LandingPrimitives";

export default function LandingFooter({ footerGroups, footerMeta }) {
  const currentYear = new Date().getFullYear();
  const footerActions = {
    "Client App": openClientApp,
    "Merchant Login": openAuthPortal,
    "Admin Panel": openAdminPortal,
  };

  return (
    <Box component="footer" className="pb-10 pt-4">
      <Container maxWidth="xl">
        <div className="hero-panel rounded-[34px] p-6 sm:p-8">
          <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="flex items-center gap-3">
                <Box
                  component="img"
                  src="/assets/pax-logo.png"
                  alt="Pax Logistics"
                  sx={{ width: { xs: 148, sm: 176 }, height: "auto" }}
                />
                <div>
                  <Typography variant="h6" className="brand-heading text-xl">
                    Pax Logistics
                  </Typography>
                  <Typography className="text-sm" sx={{ color: "#6d6157" }}>
                    Har parcel tezi se manzil tak
                  </Typography>
                </div>
              </div>

              <Typography
                className="mt-6 max-w-md text-sm leading-8 sm:text-base"
                sx={{ color: "#625b63" }}
              >
                Pax Logistics turns one public brand link into a polished entry point for merchants,
                clients, and admins. Share the landing page widely, then launch the right product
                surface in a fresh tab when the user is ready.
              </Typography>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={openAuthPortal}
                  variant="contained"
                  endIcon={<EastRoundedIcon />}
                  sx={{
                    alignSelf: "flex-start",
                    borderRadius: "999px",
                    px: 3,
                    py: 1.25,
                    backgroundColor: "#061A33",
                    "&:hover": { backgroundColor: "#123763" },
                  }}
                >
                  Open Merchant Login
                </Button>
                <Button
                  onClick={openClientApp}
                  variant="outlined"
                  sx={{
                    alignSelf: "flex-start",
                    borderRadius: "999px",
                    px: 3,
                    py: 1.25,
                    borderColor: "rgba(217, 121, 67, 0.32)",
                    color: "#061A33",
                  }}
                >
                  Open Client App
                </Button>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] border border-[#ead8de] bg-[#fff7f8] p-4">
                  <Typography
                    className="text-xs font-semibold uppercase tracking-[0.2em]"
                    sx={{ color: "#ED1C24" }}
                  >
                    Head Office
                  </Typography>
                  <Typography className="mt-3 text-sm leading-7" sx={{ color: "#554d54" }}>
                    {footerMeta.address}
                  </Typography>
                </div>
                <div className="rounded-[24px] border border-[#ead8de] bg-[#fffaf4] p-4">
                  <Typography
                    className="text-xs font-semibold uppercase tracking-[0.2em]"
                    sx={{ color: "#ED1C24" }}
                  >
                    Support
                  </Typography>
                  <Typography className="mt-3 text-sm leading-7" sx={{ color: "#554d54" }}>
                    {footerMeta.supportHours}
                    <br />
                    {footerMeta.contactNumber}
                  </Typography>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
              {launchDestinations.map((item, index) => (
                <MotionCard key={item.label} delay={index * 0.06} className="launcher-tile p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Typography
                        className="text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
                        sx={{ color: "#ED1C24" }}
                      >
                        {item.label}
                      </Typography>
                      <Typography variant="h6" className="mt-3 text-xl">
                        Open in a new tab
                      </Typography>
                      <Typography className="mt-3 text-sm leading-7" sx={{ color: "#625b63" }}>
                        {item.description}
                      </Typography>
                    </div>
                    <Button
                      onClick={footerActions[item.label]}
                      variant="text"
                      sx={{
                        minWidth: "auto",
                        borderRadius: "999px",
                        color: "#061A33",
                        px: 1,
                      }}
                    >
                      <EastRoundedIcon />
                    </Button>
                  </div>
                  <Typography className="mt-4 text-sm font-medium" sx={{ color: "#6b6068" }}>
                    {item.url.replace("https://", "")}
                  </Typography>
                </MotionCard>
              ))}
            </div>
          </div>

          <Divider sx={{ my: 4, borderColor: "rgba(186, 170, 177, 0.74)" }} />

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <Typography variant="h6" className="text-base">
                  {group.title}
                </Typography>
                <div className="mt-4 grid gap-3">
                  {group.links.map((link) => {
                    const openInNewTab = link.external && link.href.startsWith("http");

                    return (
                      <a
                        key={link.label}
                        href={link.href}
                        target={openInNewTab ? "_blank" : undefined}
                        rel={openInNewTab ? "noreferrer" : undefined}
                        className="footer-link text-sm leading-7"
                      >
                        {link.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <Divider sx={{ my: 4, borderColor: "rgba(186, 170, 177, 0.74)" }} />

          <div className="flex flex-col gap-3 text-sm text-[#6b6068] sm:flex-row sm:items-center sm:justify-between">
            <Typography className="text-sm text-[#6b6068]">
              Pax Logistics (c) {currentYear}. All rights reserved.
            </Typography>
            <Typography className="text-sm text-[#6b6068]">
              Built for ecommerce teams who want faster shipping decisions and clearer delivery
              visibility.
            </Typography>
          </div>
        </div>
      </Container>
    </Box>
  );
}
