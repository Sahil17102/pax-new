import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import { Box, Button, Container, IconButton, Typography } from "@mui/material";
import {
  launchDestinations,
  openAdminPortal,
  openAuthPortal,
  openClientApp,
} from "../../utils/appLinks";
import { MotionDiv, fadeUp } from "./LandingPrimitives";

export default function LandingHeader({
  menuOpen,
  navigationLinks,
  onToggleMenu,
  onCloseMenu,
}) {
  return (
    <Box component="header" className="sticky top-0 z-40 pt-3 sm:pt-5">
      <Container maxWidth="xl">
        <MotionDiv {...fadeUp} viewport={{ once: true }} className="nav-shell rounded-[28px] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <a href="#top" className="flex min-w-0 items-center gap-3">
              <Box
                component="img"
                src="/assets/pax-logo.png"
                alt="Pax Logistics"
                sx={{ width: { xs: 142, sm: 172 }, height: "auto", flexShrink: 0 }}
              />
              <div className="hidden min-w-0 sm:block">
                <Typography
                  variant="h6"
                  className="brand-heading text-lg"
                  sx={{ fontFamily: '"Poppins", sans-serif' }}
                >
                  Pax Logistics
                </Typography>
                <Typography className="text-sm" sx={{ color: "#6d6157" }}>
                  One landing front door. Three clean product paths.
                </Typography>
              </div>
            </a>

            <div className="hidden items-center gap-4 lg:flex xl:gap-6">
              {navigationLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-[#4c4148] transition-colors hover:bg-white/70 hover:text-[#ED1C24]"
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <div className="hidden items-center gap-2 xl:flex">
                <Button
                  onClick={openClientApp}
                  variant="outlined"
                  sx={{
                    borderColor: "rgba(217, 121, 67, 0.22)",
                    color: "#061A33",
                    borderRadius: "999px",
                    px: 2.2,
                  }}
                >
                  Client App
                </Button>
                <Button
                  onClick={openAdminPortal}
                  variant="outlined"
                  sx={{
                    borderColor: "rgba(23, 19, 16, 0.12)",
                    color: "#061A33",
                    borderRadius: "999px",
                    px: 2.2,
                  }}
                >
                  Admin
                </Button>
              </div>
              <Button
                onClick={openAuthPortal}
                variant="contained"
                sx={{
                  borderRadius: "999px",
                  px: 2.6,
                  backgroundColor: "#061A33",
                  "&:hover": { backgroundColor: "#123763" },
                }}
              >
                Merchant Login
              </Button>
            </div>

            <IconButton
              className="lg:hidden"
              onClick={onToggleMenu}
              sx={{
                border: "1px solid rgba(217, 121, 67, 0.18)",
                backgroundColor: "rgba(255,255,255,0.7)",
              }}
            >
              <MenuRoundedIcon />
            </IconButton>
          </div>

          {menuOpen ? (
            <div className="mt-4 rounded-[26px] border border-[#dacdc7] bg-white/85 p-4 shadow-[0_18px_36px_rgba(42,26,34,0.08)] lg:hidden">
              <div className="flex flex-col gap-3">
                {navigationLinks.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMenu}
                    className="rounded-2xl px-3 py-2 text-sm font-medium text-[#4c4148] hover:bg-[#f6e7db]"
                  >
                    {item.label}
                  </a>
                ))}
                {launchDestinations.map((item) => (
                  <Button
                    key={item.label}
                    onClick={() => {
                      onCloseMenu();
                      window.open(item.url, "_blank", "noopener,noreferrer");
                    }}
                    variant={item.label === "Merchant Login" ? "contained" : "outlined"}
                    sx={{
                      mt: 1,
                      borderRadius: "999px",
                      backgroundColor:
                        item.label === "Merchant Login" ? "#061A33" : "transparent",
                      color: item.label === "Merchant Login" ? "#ffffff" : "#061A33",
                      borderColor:
                        item.label === "Merchant Login"
                          ? "#061A33"
                          : "rgba(217, 121, 67, 0.22)",
                      "&:hover": {
                        backgroundColor:
                          item.label === "Merchant Login" ? "#123763" : "#f9efe4",
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </MotionDiv>
      </Container>
    </Box>
  );
}
