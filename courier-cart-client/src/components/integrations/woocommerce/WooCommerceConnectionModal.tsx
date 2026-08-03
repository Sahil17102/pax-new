import {
  Alert,
  Grid,
  Typography,
  Stack,
  Card,
  Box,
  List,
  ListItem,
  ListItemText,
} from "@mui/material";
import { FaConnectdevelop } from "react-icons/fa6";
import { RiDeleteBin2Fill } from "react-icons/ri";
import { type Dispatch, type SetStateAction } from "react";
import CustomDialog from "../../UI/modal/CustomModal";
import CustomIconLoadingButton from "../../UI/button/CustomLoadingButton";
import CustomInput from "../../UI/inputs/CustomInput";
import CustomSwitch from "../../UI/inputs/CustomSwitch";
import type { WooCommerceForm } from "./WooCommerceIntegration";

interface IWooCommerceConnectionModalProps {
  openModal: boolean;
  onSetOpen: () => void;
  handleConnect: () => void;
  isEditing?: boolean;
  integrating?: boolean;
  wooDetails: WooCommerceForm;
  setWooDetails: Dispatch<SetStateAction<WooCommerceForm>>;
  inputErrors?: Partial<WooCommerceForm>;
  forOnboarding?: boolean;
  handleDelete?: () => void;
  deleting?: boolean;
}

const WooCommerceConnectionModal = ({
  openModal,
  onSetOpen,
  handleConnect,
  integrating,
  wooDetails,
  setWooDetails,
  isEditing = false,
  inputErrors,
  forOnboarding = false,
  handleDelete,
  deleting = false,
}: IWooCommerceConnectionModalProps) => {
  return (
    <CustomDialog
      fullScreen={!forOnboarding && isEditing}
      width="100%"
      maxWidth={forOnboarding ? "lg" : "xl"}
      open={openModal}
      onClose={onSetOpen}
      title={
        <Stack direction="row" alignItems="center" gap={2}>
          <FaConnectdevelop />
          Connect your WooCommerce store
        </Stack>
      }
      footer={
        <Stack direction="row" spacing={2}>
          {isEditing && !forOnboarding ? (
            <CustomIconLoadingButton
              onClick={() => handleDelete?.()}
              disabled={integrating}
              icon={<RiDeleteBin2Fill />}
              text="Remove"
              loading={deleting}
              loadingText="Removing..."
            />
          ) : null}
          <CustomIconLoadingButton
            text={isEditing && !forOnboarding ? "Update" : "Connect"}
            loadingText={isEditing && !forOnboarding ? "Saving..." : "Connecting..."}
            loading={integrating}
            onClick={handleConnect}
          />
        </Stack>
      }
    >
      <Grid container spacing={4}>
        <Grid size={{ md: 5, xs: 12 }}>
          <Box
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" gutterBottom>
              How to get WooCommerce API credentials
            </Typography>
            <Alert severity="info" sx={{ mb: 1.5 }}>
              Use the public store URL, for example https://yourstore.com. Do not paste
              the wp-admin URL.
            </Alert>
            <List dense>
              {[
                { primary: "1. Sign in to your WordPress admin panel" },
                { primary: "2. Open WooCommerce > Settings > Advanced > REST API" },
                { primary: "3. Click Create an API key or Add Key" },
                { primary: "4. Set Description to Pax Logistics and select the store admin user" },
                {
                  primary:
                    "5. Set Permission to Read/Write so orders, notes, and webhooks can sync",
                },
                { primary: "6. Click Generate API Key" },
                {
                  primary: "7. Copy the ck_ Consumer Key and cs_ Consumer Secret immediately",
                },
              ].map((step, i) => (
                <ListItem key={i}>
                  <ListItemText primary={step.primary} />
                </ListItem>
              ))}
            </List>
          </Box>
        </Grid>

        <Grid size={{ md: 7, xs: 12 }}>
          <Card
            variant="outlined"
            sx={{
              p: 3,
              borderRadius: 2,
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              Enter WooCommerce Credentials
            </Typography>
            <Stack spacing={2}>
              <CustomInput
                required
                label="Store URL"
                placeholder="https://yourstore.com"
                value={wooDetails.storeUrl}
                onChange={(e) =>
                  setWooDetails((prev) => ({
                    ...prev,
                    storeUrl: e.target.value,
                  }))
                }
                error={!!inputErrors?.storeUrl}
                helperText={inputErrors?.storeUrl}
                autoComplete="url"
              />
              <CustomInput
                required
                label="Consumer Key"
                placeholder="ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={wooDetails.consumerKey}
                onChange={(e) =>
                  setWooDetails((prev) => ({
                    ...prev,
                    consumerKey: e.target.value,
                  }))
                }
                error={!!inputErrors?.consumerKey}
                helperText={inputErrors?.consumerKey || "Starts with ck_"}
                autoComplete="off"
              />
              <CustomInput
                required
                label="Consumer Secret"
                type="password"
                placeholder="cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={wooDetails.consumerSecret}
                onChange={(e) =>
                  setWooDetails((prev) => ({
                    ...prev,
                    consumerSecret: e.target.value,
                  }))
                }
                error={!!inputErrors?.consumerSecret}
                helperText={inputErrors?.consumerSecret || "Shown only once in WooCommerce"}
                autoComplete="new-password"
              />
              {isEditing && !forOnboarding ? (
                <>
                  <CustomSwitch
                    label="Auto-update order status"
                    checked={!!wooDetails?.settings?.autoUpdateStatus}
                    onChange={(e) =>
                      setWooDetails((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          autoUpdateStatus: e.target.checked,
                          autoUpdateShipmentStatus: e.target.checked,
                        },
                      }))
                    }
                  />
                  <CustomSwitch
                    label="Mark COD orders as paid on delivery"
                    checked={!!wooDetails?.settings?.markCodPaid}
                    onChange={(e) =>
                      setWooDetails((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          markCodPaid: e.target.checked,
                        },
                      }))
                    }
                  />
                </>
              ) : null}
            </Stack>
          </Card>
        </Grid>
      </Grid>
    </CustomDialog>
  );
};

export default WooCommerceConnectionModal;
