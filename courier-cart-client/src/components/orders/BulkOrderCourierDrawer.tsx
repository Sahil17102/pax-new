/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAvailableCouriers } from "../../api/courier";
import { bookExistingB2COrderCourier } from "../../api/order.service";
import { usePickupAddresses } from "../../hooks/Pickup/usePickupAddresses";
import type { HydratedPickup } from "../../types/generic.types";
import { courierLogos, defaultLogo } from "../../utils/constants";
import CustomDrawer from "../UI/drawer/CustomDrawer";
import { toast } from "../UI/Toast";

type BulkOrder = Record<string, any> & { id: string | number };

type BulkOrderCourierDrawerProps = {
  open: boolean;
  orders: BulkOrder[];
  onClose: () => void;
  onComplete?: () => void;
};

type CommonCourierOption = {
  key: string;
  representative: Record<string, any>;
  perOrder: Record<string, any>[];
  total: number;
};

type CourierCacheEntry = {
  commonCouriers: CommonCourierOption[];
  courierError: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const getOrderAmount = (order: BulkOrder) => {
  const products = Array.isArray(order.products) ? order.products : [];
  const subtotal = products.reduce(
    (sum: number, product: Record<string, any>) =>
      sum +
      Number(product.price ?? 0) *
        Number(product.quantity ?? product.qty ?? 1) -
      Number(product.discount ?? 0),
    0,
  );
  return subtotal > 0 ? subtotal : Number(order.order_amount ?? 0);
};

const getCourierKey = (courier: Record<string, any>) =>
  String(
    courier.courier_option_key ??
      `${courier.id ?? courier.courier_id}__${courier.integration_type ?? courier.serviceProvider ?? ""}__${courier.max_slab_weight ?? "base"}`,
  );

const normalizeKeyPart = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const getBulkCompatibleCourierKey = (courier: Record<string, any>) => {
  const provider = normalizeKeyPart(
    courier.integration_type ??
      courier.serviceProvider ??
      courier.service_provider,
  );
  const courierId = normalizeKeyPart(courier.id ?? courier.courier_id);
  const name = normalizeKeyPart(
    courier.name ?? courier.displayName ?? courier.courier_name,
  );
  const shadowfaxMode = normalizeKeyPart(
    courier.provider_serviceability?.mode ??
      courier.provider_serviceability?.shipping_mode ??
      courier.mode ??
      courier.shipping_mode,
  );
  const serviceMode = normalizeKeyPart(
    courier.provider_serviceability?.service_mode ??
      courier.service_mode ??
      courier.transport_speed,
  );
  const amazonServiceId = normalizeKeyPart(
    courier.amazon_service_id ?? courier.service_id,
  );
  const amazonCarrierId = normalizeKeyPart(courier.amazon_carrier_id);

  return [
    provider,
    courierId || name,
    shadowfaxMode,
    serviceMode,
    amazonServiceId,
    amazonCarrierId,
  ].join("__");
};

const getForwardRate = (courier: Record<string, any>) =>
  Number(
    courier.localRates?.forward?.rate ??
      courier.rate ??
      courier.freight_charges ??
      0,
  );

const getCodRate = (courier: Record<string, any>, order: BulkOrder) =>
  String(order.order_type || "").toLowerCase() === "cod"
    ? Number(
        courier.localRates?.forward?.cod_charges ?? courier.cod_charges ?? 0,
      )
    : 0;

const getOtherRate = (courier: Record<string, any>) =>
  Number(
    courier.localRates?.forward?.other_charges ?? courier.other_charges ?? 0,
  );

const getTaxInclusiveRate = (
  courier: Record<string, any>,
  order: BulkOrder,
) => {
  if (String(order.order_type || "").toLowerCase() === "cod") return 0;

  const explicit =
    courier.localRates?.forward?.total_charges_with_gst ??
    courier.total_charges_with_gst ??
    courier.localRates?.forward?.wallet_debit_amount ??
    courier.wallet_debit_amount;
  if (explicit !== undefined && explicit !== null) return Number(explicit);
  return (
    getForwardRate(courier) +
    getCodRate(courier, order) +
    getOtherRate(courier) +
    Number(courier.localRates?.forward?.gst_amount ?? courier.gst_amount ?? 0)
  );
};

const getWarehouseLabel = (warehouse: HydratedPickup) =>
  warehouse.pickup?.addressNickname ||
  warehouse.pickup?.contactName ||
  "Warehouse";

const getCourierLogo = (name: string) =>
  Object.entries(courierLogos).find(([key]) =>
    name.toLowerCase().includes(key.toLowerCase()),
  )?.[1] ?? defaultLogo;

const buildOrdersRateSignature = (orders: BulkOrder[]) =>
  orders
    .map((order) =>
      [
        order.id,
        order.pincode,
        order.order_type,
        getOrderAmount(order),
        order.weight,
        order.length,
        order.breadth,
        order.height,
        order.buyer_name,
        order.buyer_phone,
        order.address,
        order.city,
        order.state,
      ]
        .map((value) => String(value ?? "").trim())
        .join("~"),
    )
    .join("|");

export default function BulkOrderCourierDrawer({
  open,
  orders,
  onClose,
  onComplete,
}: BulkOrderCourierDrawerProps) {
  const queryClient = useQueryClient();
  const { data: warehouseData, isLoading: warehousesLoading } =
    usePickupAddresses({
      page: 1,
      limit: 100,
    });
  const warehouses = useMemo(
    () =>
      (warehouseData?.pickupAddresses || []).filter(
        (warehouse) => warehouse.isPickupEnabled,
      ),
    [warehouseData?.pickupAddresses],
  );
  const [warehouseId, setWarehouseId] = useState("");
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [courierError, setCourierError] = useState("");
  const [commonCouriers, setCommonCouriers] = useState<CommonCourierOption[]>(
    [],
  );
  const [selectedCourierKey, setSelectedCourierKey] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookingProgress, setBookingProgress] = useState(0);
  const [bookingError, setBookingError] = useState("");
  const courierCacheRef = useRef(new Map<string, CourierCacheEntry>());

  const selectedWarehouse = warehouses.find(
    (warehouse) => String(warehouse.pickupId) === warehouseId,
  );
  const ordersRateSignature = useMemo(
    () => buildOrdersRateSignature(orders),
    [orders],
  );
  const courierRequestKey = useMemo(() => {
    if (!open || !selectedWarehouse || !orders.length) return "";

    const pickup = selectedWarehouse.pickup;
    return JSON.stringify({
      warehouseId,
      pickupId: selectedWarehouse.pickupId,
      pickupPincode: pickup?.pincode || "",
      pickupName: pickup?.addressNickname || "",
      pickupAddress: pickup?.addressLine1 || "",
      pickupCity: pickup?.city || "",
      pickupState: pickup?.state || "",
      orders: ordersRateSignature,
    });
  }, [open, orders.length, ordersRateSignature, selectedWarehouse, warehouseId]);

  useEffect(() => {
    if (!open) return;
    setWarehouseId("");
    setCommonCouriers([]);
    setSelectedCourierKey("");
    setCourierError("");
    setBookingError("");
    setBookingProgress(0);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedWarehouse || !orders.length || !courierRequestKey)
      return;
    let cancelled = false;

    const loadCouriers = async () => {
      const cached = courierCacheRef.current.get(courierRequestKey);
      if (cached) {
        setLoadingCouriers(false);
        setCourierError(cached.courierError);
        setCommonCouriers(cached.commonCouriers);
        setSelectedCourierKey((currentKey) =>
          cached.commonCouriers.some((option) => option.key === currentKey)
            ? currentKey
            : "",
        );
        return;
      }

      setLoadingCouriers(true);
      setCourierError("");
      setCommonCouriers([]);
      setSelectedCourierKey("");

      try {
        const pickup = selectedWarehouse.pickup;
        const perOrderCouriers = await Promise.all(
          orders.map((order) =>
            fetchAvailableCouriers({
              origin: pickup.pincode,
              destination: order.pincode,
              pickupId: selectedWarehouse.pickupId,
              pickupName: pickup.addressNickname,
              pickupAddress: pickup.addressLine1,
              pickupCity: pickup.city,
              pickupState: pickup.state,
              deliveryName: order.buyer_name,
              deliveryPhone: order.buyer_phone,
              deliveryAddress: order.address,
              deliveryCity: order.city,
              deliveryState: order.state,
              payment_type:
                String(order.order_type || "").toLowerCase() === "cod"
                  ? "cod"
                  : "prepaid",
              order_amount: getOrderAmount(order),
              cod:
                String(order.order_type || "").toLowerCase() === "cod" ? 1 : 0,
              weight: Number(order.weight ?? 0),
              length: Number(order.length ?? 0),
              breadth: Number(order.breadth ?? 0),
              height: Number(order.height ?? 0),
              shipment_type: "b2c",
              context: "shipment_courier_selection",
              shadowfax_forward_mode: "marketplace",
            }),
          ),
        );

        if (cancelled) return;
        const firstOptions = perOrderCouriers[0] || [];
        const intersectionByKey = new Map<string, CommonCourierOption>();
        firstOptions.forEach((courier) => {
          const key = getBulkCompatibleCourierKey(courier);
          if (!key.replace(/_/g, "")) return;
          const matches = [courier];
          for (let index = 1; index < perOrderCouriers.length; index += 1) {
            const matchingCandidates = perOrderCouriers[index].filter(
              (candidate: Record<string, any>) =>
                getBulkCompatibleCourierKey(candidate) === key,
            );
            if (!matchingCandidates.length) return;
            const match = matchingCandidates.sort(
              (left: Record<string, any>, right: Record<string, any>) =>
                getTaxInclusiveRate(left, orders[index]) -
                getTaxInclusiveRate(right, orders[index]),
            )[0];
            matches.push(match);
          }
          const option = {
            key,
            representative: courier,
            perOrder: matches,
            total: matches.reduce(
              (sum, entry, index) =>
                sum + getTaxInclusiveRate(entry, orders[index]),
              0,
            ),
          };
          const existing = intersectionByKey.get(key);
          if (!existing || option.total < existing.total) {
            intersectionByKey.set(key, option);
          }
        });

        const intersection = Array.from(intersectionByKey.values());
        const sortedIntersection = intersection.sort((a, b) => a.total - b.total);
        const nextError = !sortedIntersection.length
          ? "No single courier is currently serviceable for every selected order."
          : "";

        courierCacheRef.current.set(courierRequestKey, {
          commonCouriers: sortedIntersection,
          courierError: nextError,
        });

        setCommonCouriers(sortedIntersection);
        if (nextError) {
          setCourierError(
            "No single courier is currently serviceable for every selected order.",
          );
        }
      } catch (error: any) {
        if (!cancelled) {
          setCourierError(
            error?.message || "Unable to load available couriers.",
          );
        }
      } finally {
        if (!cancelled) setLoadingCouriers(false);
      }
    };

    void loadCouriers();
    return () => {
      cancelled = true;
    };
  }, [courierRequestKey]);

  const handleBook = async () => {
    const option = commonCouriers.find(
      (courier) => courier.key === selectedCourierKey,
    );
    if (!selectedWarehouse || !option) return;

    setBooking(true);
    setBookingError("");
    setBookingProgress(0);
    const pickup = selectedWarehouse.pickup;
    const rto = selectedWarehouse.rto;
    const failures: string[] = [];
    let successCount = 0;

    for (let index = 0; index < orders.length; index += 1) {
      const order = orders[index];
      const courier = option.perOrder[index];
      const forwardRate = getForwardRate(courier);
      const codRate = getCodRate(courier, order);
      const otherRate = getOtherRate(courier);

      try {
        await bookExistingB2COrderCourier(String(order.id), {
          payment_type:
            String(order.order_type || "").toLowerCase() === "cod"
              ? "cod"
              : "prepaid",
          package_weight: Number(order.weight ?? 0),
          package_length: Number(order.length ?? 0),
          package_breadth: Number(order.breadth ?? 0),
          package_height: Number(order.height ?? 0),
          order_amount: getOrderAmount(order),
          shipping_charges: Number(order.shipping_charges ?? 0),
          prepaid_amount: Number(order.prepaid_amount ?? 0),
          discount: Number(order.discount ?? 0),
          transaction_fee: Number(order.transaction_fee ?? 0),
          gift_wrap: Number(order.gift_wrap ?? 0),
          freight_charges: forwardRate,
          cod_charges: codRate,
          other_charges: otherRate,
          courier_cost: Number(courier.courier_cost_estimate ?? forwardRate),
          integration_type: courier.integration_type ?? courier.serviceProvider,
          courier_id: Number(courier.id ?? courier.courier_id),
          courier_partner: courier.name ?? courier.displayName,
          courier_option_key: getCourierKey(courier),
          amazon_request_token: courier.amazon_request_token,
          amazon_rate_id: courier.amazon_rate_id,
          amazon_service_id: courier.amazon_service_id,
          amazon_carrier_id: courier.amazon_carrier_id,
          shadowfax_forward_mode:
            courier.provider_serviceability?.mode ??
            courier.mode ??
            "marketplace",
          shadowfax_service_mode:
            courier.provider_serviceability?.service_mode ??
            courier.service_mode,
          selected_max_slab_weight: courier.max_slab_weight ?? undefined,
          pickup_location_id: selectedWarehouse.pickupId,
          pickup_date: today(),
          pickup_time: "10:00",
          gst_percent: Number(
            courier.localRates?.forward?.gst_percent ??
              courier.gst_percent ??
              0,
          ),
          gst_amount: Number(
            courier.localRates?.forward?.gst_amount ?? courier.gst_amount ?? 0,
          ),
          wallet_debit_amount: getTaxInclusiveRate(courier, order),
          delivery_location:
            courier.approxZone?.code ?? courier.approxZone?.name,
          zone_id: courier.approxZone?.id,
          chargedWeight:
            courier.localRates?.forward?.chargeable_weight ??
            courier.chargeable_weight ??
            undefined,
          volumetricWeight:
            courier.localRates?.forward?.volumetric_weight ??
            courier.volumetric_weight ??
            undefined,
          pickup: {
            warehouse_name: pickup.addressNickname || pickup.contactName || "",
            name: pickup.contactName || pickup.addressNickname || "",
            phone: pickup.contactPhone || "",
            address: [pickup.addressLine1, pickup.addressLine2]
              .filter(Boolean)
              .join(", "),
            city: pickup.city || "",
            state: pickup.state || "",
            pincode: pickup.pincode || "",
            pickup_date: today(),
            pickup_time: "10:00",
          },
          is_rto_different: selectedWarehouse.isRTOSame ? "no" : "yes",
          ...(!selectedWarehouse.isRTOSame && rto
            ? {
                rto: {
                  warehouse_name: rto.addressNickname || rto.contactName || "",
                  name: rto.contactName || rto.addressNickname || "",
                  phone: rto.contactPhone || "",
                  address: [rto.addressLine1, rto.addressLine2]
                    .filter(Boolean)
                    .join(", "),
                  city: rto.city || "",
                  state: rto.state || "",
                  pincode: rto.pincode || "",
                },
              }
            : {}),
        } as any);
        successCount += 1;
      } catch (error: any) {
        failures.push(
          `${order.order_number || order.id}: ${error?.response?.data?.message || error?.message || "Booking failed"}`,
        );
      } finally {
        setBookingProgress(index + 1);
      }
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["b2cOrdersByUser"] }),
      queryClient.invalidateQueries({ queryKey: ["orders"] }),
    ]);
    setBooking(false);

    if (failures.length) {
      const message = `${successCount} of ${orders.length} orders booked. ${failures.slice(0, 3).join(" | ")}`;
      setBookingError(message);
      toast.open({ message, severity: successCount ? "warning" : "error" });
      onComplete?.();
      return;
    }

    toast.open({
      message: `${successCount} order${successCount === 1 ? "" : "s"} booked successfully`,
      severity: "success",
    });
    onComplete?.();
    onClose();
  };

  return (
    <CustomDrawer
      open={open}
      onClose={booking ? () => undefined : onClose}
      title="Bulk book orders"
      width={760}
    >
      <Stack spacing={2}>
        <Alert severity="info">
          Select one warehouse and a courier available for all {orders.length}{" "}
          selected orders. Rates are checked separately for every delivery
          pincode.
        </Alert>

        <TextField
          select
          fullWidth
          label="Pickup warehouse"
          value={warehouseId}
          disabled={warehousesLoading || booking}
          onChange={(event) => setWarehouseId(event.target.value)}
          helperText={
            warehousesLoading
              ? "Loading warehouses..."
              : warehouses.length
                ? "The selected warehouse will be used for the full batch."
                : "Add and enable a pickup warehouse before bulk booking."
          }
        >
          {warehouses.map((warehouse) => (
            <MenuItem key={warehouse.pickupId} value={warehouse.pickupId}>
              {getWarehouseLabel(warehouse)} —{" "}
              {warehouse.pickup?.pincode || "No pincode"}
            </MenuItem>
          ))}
        </TextField>

        <Divider />

        {loadingCouriers && (
          <Stack alignItems="center" spacing={1.2} sx={{ py: 5 }}>
            <CircularProgress size={30} />
            <Typography color="text.secondary">
              Checking couriers across {orders.length} orders...
            </Typography>
          </Stack>
        )}

        {courierError && <Alert severity="warning">{courierError}</Alert>}

        {!loadingCouriers && commonCouriers.length > 0 && (
          <Stack spacing={1}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="subtitle1" fontWeight={800}>
                Available couriers
              </Typography>
              <Chip
                label={`${commonCouriers.length} options`}
                color="primary"
                size="small"
              />
            </Stack>
            {commonCouriers.map((option) => {
              const courier = option.representative;
              const name = String(
                courier.displayName || courier.name || "Courier",
              );
              const selected = selectedCourierKey === option.key;
              return (
                <Paper
                  key={option.key}
                  onClick={() => !booking && setSelectedCourierKey(option.key)}
                  sx={{
                    p: 1.5,
                    cursor: booking ? "default" : "pointer",
                    borderRadius: 2,
                    border: selected
                      ? "2px solid #062A5B"
                      : "1px solid rgba(17, 24, 39, 0.12)",
                    bgcolor: selected ? alpha("#062A5B", 0.05) : "#fff",
                    "&:hover": { borderColor: "#062A5B" },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.25}>
                    <Avatar
                      src={getCourierLogo(name)}
                      alt={name}
                      sx={{ width: 36, height: 36 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography fontWeight={800}>{name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Serviceable for all {orders.length} selected orders
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography fontWeight={900}>
                        ₹{option.total.toFixed(2)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        estimated batch total
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}

        {bookingError && <Alert severity="warning">{bookingError}</Alert>}

        {booking && (
          <Alert severity="info">
            Booking order {Math.min(bookingProgress + 1, orders.length)} of{" "}
            {orders.length}. Please keep this window open.
          </Alert>
        )}

        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button onClick={onClose} disabled={booking}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!selectedCourierKey || booking || loadingCouriers}
            onClick={() => void handleBook()}
          >
            {booking
              ? `Booking ${bookingProgress}/${orders.length}`
              : `Book ${orders.length} orders`}
          </Button>
        </Stack>
      </Stack>
    </CustomDrawer>
  );
}
