# Amazon Shipping Postman Checks

Import these files into Postman:

- `amazon-shipping.postman_collection.json`
- `amazon-shipping.local.postman_environment.json`

Before running the collection, set:

- `baseUrl`
- `xApiKey`
- `amazonAccessToken` if you want to pass a direct one-hour access token

If Amazon credentials are already saved from the admin Courier Credentials page,
leave `amazonAccessToken` blank and the backend will generate the token from the
stored refresh token and LWA client credentials.

For end-to-end purchase flow:

1. Run `Get Rates`.
2. Copy `requestToken`, a selected `rateId`, and optionally `serviceId` from the
   Amazon response into the environment.
3. Run `Purchase Shipment` or `One Click Shipment`.
4. Copy returned `shipmentId`, `trackingId`, and `carrierId` before running
   documents, tracking, cancel, or NDR checks.

Per Amazon Shipping docs, `Access Points` is configured with
`AmazonShipping_UK`; `NDR Feedback` is configured with `AmazonShipping_IN`.

## Delhivery B2B (LTL)

Import:

- `delhivery-b2b.postman_collection.json`
- `delhivery-b2b.local.postman_environment.json`

Save the production or UAT credentials from **Admin > Courier Credentials >
Delhivery B2B (LTL)**, then set `adminToken` to an Pax Logistics admin access
token. The proxy intentionally does not expose Delhivery's JWT.

The collection contains state-changing requests. Run password reset, warehouse
creation/update, manifestation, shipment update/cancellation, appointment, and
pickup creation/cancellation individually and only against the intended account.
For a read-only smoke test, run Login, Pincode Serviceability, Expected TAT, and
tracking with an existing LRN.

## Delhivery B2C

Import:

- `delhivery-b2c.postman_collection.json`
- `delhivery-b2c.local.postman_environment.json`

Save the Delhivery B2C token and client name from **Admin > Courier Credentials**.
Set the Postman admin login values locally; no courier or admin secret belongs in
the exported files. Run **Admin Login** first so its test script stores the Pax
admin access token.

The read-only folder covers standard pincode serviceability (including
empty/Embargo normalization), Heavy product pincode serviceability (including
NSZ and payment-mode normalization), expected TAT, shipping cost, tracking,
label metadata, and NDR status. Requests that allocate waybills or change
Delhivery state are skipped by default. Set `allowMutating=true` only when you
deliberately want to run those requests against the configured Delhivery
account.

Expected TAT supports `tatMode` values `S`, `E`, and `N`, optional `B2B`/`B2C`
product type, and `expectedPickupDate` in `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`
format. Clear the pickup-date value to let Delhivery calculate from the current
handover date.

Fetch Waybill uses Delhivery's bulk endpoint for every `waybillCount` from 1 to
10,000. The provider limit is 50,000 waybills and five requests per five-minute
IP window. Because waybills are generated internally in batches of 25, store the
returned `data.waybills` list and do not manifest it immediately. After the
provider has made an AWB available, copy one into `manifestWaybill`; the Create
Forward Shipment request will send it explicitly. Leave `manifestWaybill` empty
when Delhivery should assign the shipment AWB itself.

Fetch Single Waybill calls Delhivery's dedicated single-allocation endpoint and
stores the normalized response in the Postman `fetchedSingleWaybill` variable.
The production limit is 750 requests per five-minute IP window. Copy that value
to `manifestWaybill` only for the shipment that should consume it; every single
fetch request allocates a new AWB.

Shipment Creation accepts both Pax's existing nested order payload and the
Delhivery-native field names used in the provider examples. The Postman folder
contains forward SPS, Pickup/RVP, REPL, and MPS examples. For MPS, populate
`mpsWaybill1` and `mpsWaybill2` with distinct prefetched AWBs; each box is sent
with its own unique order ID. The first Postman AWB is passed as `master_id` and
must match one of the box waybills. Every provider box receives the same
`master_id`, `shipment_type=MPS`, and `mps_children` count. `mps_amount` is zero
for prepaid and the full package-amount sum for COD. The endpoint also accepts
Delhivery's native `{ pickup_location, shipments: [...] }` MPS structure.
`pickup_location` must exactly match the registered warehouse name. The proxy
form-encodes the provider payload, including addresses that contain `&`, `#`,
`%`, `;`, or backslashes.

Shipment Edit sends only Delhivery's documented editable keys: `name`, `phone`,
`pt`, `cod`, `add`, `products_desc`, `gm`, and shipment dimensions. The Postman
examples cover forward, Pickup, and REPL status rules. `current_payment_mode` and
`current_status` are local validation metadata and are never forwarded. COD and
Pre-paid can convert only to each other; Pre-paid-to-COD requires a positive
`cod` amount. Dispatched and terminal statuses are rejected before the provider
request.

Shipment Cancellation sends exactly `waybill` plus `cancellation="true"` to
Delhivery's edit endpoint. Postman includes Forward, Pickup/RVP, and REPL
examples. Optional `current_payment_mode` and `current_status` query parameters
are used only for local eligibility checks. The normalized response reports the
expected provider outcome: Manifested/UD before pickup, In Transit/RT for In
Transit or Pending, and Canceled/CN for a Scheduled Pickup shipment. Delhivery's
documented production limit for this endpoint is 12,200 requests per five
minutes per IP.

E-waybill Update is available at `PUT /api/delhivery/b2c/shipments/:awb/ewaybill`
with JSON body `{ "dcn": "invoice-number", "ewbn": "ewaybill-number" }`. The
proxy sends Delhivery exactly `{ "data": [{ "dcn", "ewbn" }] }` to the AWB-specific
provider endpoint, so it works for the shipment's current forward or return
flow. The Postman request is mutation-locked by default. Delhivery documents a
production limit of 250 requests per five-minute IP window.

Shipment Tracking supports `GET /api/delhivery/b2c/tracking?waybill=...&ref_ids=...`
for bulk lookup and keeps the existing
`GET /api/delhivery/b2c/shipments/:awb/tracking?ref_ids=...` route. Up to 50
comma-separated waybills are accepted per request; duplicates are removed. An
order ID can be supplied through `ref_ids`, including an order-ID-only lookup.
Responses normalize each shipment's current status and full scan history while
retaining `provider_response`. Delhivery documents a production limit of 750
requests per five-minute IP window.
