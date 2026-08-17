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

NDR actions are available at `POST /api/delhivery/b2c/ndr/actions`. The proxy
accepts only Delhivery's documented `RE-ATTEMPT` and `PICKUP_RESCHEDULE`
actions and forwards exactly `{ waybill, act }` in the provider `data` array.
The asynchronous provider UPL ID is normalized as `upl_id`, saved by both
Postman requests, and can then be checked with **NDR Upload Status**. Optional
`current_nsl` and `attempt_count` values are local safety metadata: when one is
provided both are required, the attempt must be 1 or 2, and the NSL must be in
the documented action-specific allowlist. These metadata fields are never sent
to Delhivery. For Pickup rescheduling, confirm the shipment is non-OTP
cancelled. Delhivery recommends applying both actions after 9 PM. Mutating NDR
requests remain skipped unless `allowMutating=true`. The action request uses a
135-second configurable timeout to cover the documented 126.38-second P99.
GET NDR Status is available at
`GET /api/delhivery/b2c/ndr/status/:uplId?verbose=true`. It validates the UPL
ID and boolean `verbose` value, returns normalized `status`, `completed`, and
`message` fields, and retains the complete `provider_response`. The read-only
Postman request uses the `uplId` saved by either NDR action and the
`ndrStatusVerbose` environment variable. A configurable 95-second timeout
covers Delhivery's documented 88.03-second production P99.

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

RVP QC 3.0 uses the same `POST /api/delhivery/b2c/shipments` endpoint with
`payment_mode=Pickup`, `qc_type=param`, and a `custom_qc` array. Delhivery must
first configure the one-time mapping between the client's `questions_id` values
and Delhivery question IDs; that account-side mapping is coordinated with the
Delhivery BD team. The proxy accepts at most two QC items and six questions per
item and rejects larger payloads instead of allowing Delhivery to silently
manifest a non-QC shipment. Item description, images, quantity, questions,
question ID, options, correct-value list, required boolean, and varchar/multi
type are validated. HTTP(S) image URLs and optional question images are
supported; quantity defaults to one. In multi-choice questions, `value[0]`
must match an option. Explicit gram/kg weight strings from Delhivery's examples
are normalized to grams. The Postman RVP QC request is mutation-locked unless
`allowMutating=true`. Delhivery documents a production limit of 20,000 requests
per five minutes per IP.

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

Calculate Shipping Cost accepts Delhivery's documented query names
`md`, `cgm`, `o_pin`, `d_pin`, `ss`, `pt`, `l`, `b`, `h`, and `ipkg_type`.
The earlier friendly aliases (`mode`, `weight_g`, `origin_pin`,
`destination_pin`, `status`, `payment_type`, and dimension names) remain
supported. Mode must be E or S; status may be Delivered, RTO, or DTO; package
type may be box or flyer. Dimensions must be supplied together as positive
integers. The response includes normalized quotes and the original provider
response. Delhivery documents a production limit of 50 requests per five-minute
IP window.

Generate Shipping Label supports
`GET /api/delhivery/b2c/shipments/:awb/label?pdf=false&pdf_size=A4` for
customizable JSON metadata and `pdf=true` for a provider-hosted PDF link. Label
size accepts A4 or 4R and defaults to A4 when omitted. The legacy `format=json`
and `format=pdf` aliases remain supported, but PDF mode now correctly returns
JSON containing `label_url` instead of treating the provider's S3-link response
as raw PDF bytes. Label requests use a configurable 70-second timeout because
of the documented provider tail latency. Delhivery documents a production limit
of 3,000 requests per five-minute IP window.

Download Document is available at
`GET /api/delhivery/b2c/shipments/:awb/documents?doc_type=EPOD`. Supported
document types are `SIGNATURE_URL`, `RVP_QC_IMAGE`, `EPOD`, and
`SELLER_RETURN_IMAGE`; values are normalized to uppercase and all other types
are rejected before contacting Delhivery. The response retains the complete
`provider_response` and also collects any HTTP(S) links into `document_urls`.
Only the configured Delhivery token is forwarded—the session cookie shown in
the provider curl example is not required or accepted from the client. Set the
Postman `awb` and `documentType` variables to test another document.

Client Warehouse Creation is available at `POST /api/delhivery/b2c/warehouses`.
The proxy sends only Delhivery's documented fields and requires `name`, `phone`,
`pin`, and `return_address`. Warehouse names retain their exact case because the
same value must be used later as `pickup_location` during manifestation and
pickup creation. Phone numbers are normalized to 10 digits, pickup and optional
return pincodes are validated as six digits, optional email is validated, and
blank optional fields are omitted. Responses include the normalized warehouse
name and original `provider_response`. The Postman request is mutation-locked
unless `allowMutating=true`. Delhivery documents a production limit of 10
requests per minute per IP.

Client Warehouse Updation is exposed as
`PATCH /api/delhivery/b2c/warehouses` and forwarded to Delhivery's warehouse
edit endpoint as POST. The exact case-sensitive `name` is always required and
is used only to identify the existing warehouse; it cannot be changed. At least
one of `address`, `pin`, or `phone` must be supplied. Although the parameter
table marks pin mandatory, Delhivery's official example updates address/phone
without pin, so the proxy supports that documented sample and validates pin
only when provided. Unsupported fields are rejected, phone is normalized to 10
digits, and the response reports `updated_fields` plus `provider_response`.
The provider timeout is 70 seconds to cover the documented 61.16-second P99.
The Postman request is mutation-locked unless `allowMutating=true`; Delhivery's
production limit is 10 requests per minute per IP.

Pickup Request Creation is available at `POST /api/delhivery/b2c/pickups` with
exactly `pickup_date`, `pickup_time`, `pickup_location`, and
`expected_package_count`. The location is the case-sensitive registered
warehouse name, not a waybill; one request covers all ready packages at that
location. Date and time are validated as `YYYY-MM-DD` and `HH:mm:ss`, and the
package count must be a positive integer. The Postman pre-request script sets
the pickup date to tomorrow. Delhivery allows only one open request per
warehouse/day, so that provider response is normalized as an idempotent success
with `already_exists=true`. The request remains mutation-locked unless
`allowMutating=true`. Delhivery documents a production limit of 4,000 requests
per five-minute IP window.

## Innofulfill B2C

Import:

- `innofulfill-b2c.postman_collection.json`
- `innofulfill-b2c.local.postman_environment.json`

Set `innofulfillUsername` and `innofulfillPassword` locally. Run
**Innofulfill Login** to call `POST https://apis.innofulfill.com/auth/login`
with `signinType: EMAIL`; the test script stores the returned `id_token`,
`refresh_token`, `tenant_id`, and `user_id` only in your active Postman
environment. Run **Innofulfill Refresh Token** after login to call
`POST /auth/refresh-token`; the old refresh token is single-use, so the test
script replaces it with the rotated value from the response.

Run **Admin Login** before the Pax admin proxy requests. **Save Innofulfill
Credentials** stores the base URL, email login, tenant ID, user ID, and latest
refresh token through the admin Courier Credentials API. **Test Saved Login
Credentials** verifies the same login path through the backend without exposing
the provider token to the dashboard. **Test Refresh Token Through Pax** verifies
refresh-token rotation through the backend and persists the newly rotated
refresh token server-side.

**Check ECOMM Serviceability** calls Innofulfill directly with
`Authorization: Bearer {{innofulfillIdToken}}` and
`TenantId: {{innofulfillTenantId}}`. The optional `Api-Key` header is present
but disabled in the collection; enable it and set `innofulfillApiKey` if you
want to test API-key authentication instead. **Test ECOMM Serviceability
Through Pax** calls the backend proxy, which returns normalized carrier-wise
`serviceable` booleans, `reason`, pincode metadata, and the raw provider
response. Both provider serviceable and non-serviceable responses are HTTP 200,
so the tests assert `carriers[0].serviceable` is a boolean rather than assuming
it must be `true`.

**Check Hyperlocal Serviceability** calls
`POST /gateway/serviceability/hyperlocal` with pickup and shipping address
objects, including address text, pincode, latitude, and longitude. **Test
Hyperlocal Serviceability Through Pax** returns the same normalized
carrier-wise `serviceable` boolean and `reason`, plus pickup/shipping address
metadata, pincode metadata, account/configuration details, distance, duration,
and the raw provider response. The default sample lane uses Koregaon Park to
Kharadi in Pune with carrier `SMILE`.

**Calculate ECOMM Rates** calls
`POST /gateway/ure/api/external/rate-calculation/calculate/v2` with static
`serviceType=ECOMM` and `productType=ECOMM`. The request uses
`filters.delivery_mode` as `SURFACE` or `AIR`, and the default sample uses
400101 to 411014 with 23 kg and 3 x 3 x 4 cm dimensions. **Test ECOMM Rates
Through Pax** returns normalized base rate, total amount, charges, GST summary,
weight calculation, pincode details, zone resolution, and the raw provider
response.

**Calculate Hyperlocal Rates** uses the same rate-calculation endpoint with
static `serviceType=HYPERLOCAL` and `productType=HYPERLOCAL`. The `distance`
field is required in kilometres and `filters` must stay empty because delivery
mode is not applicable. The default sample uses 400101 to 400063 with 4 kg,
3 x 2 x 3 cm dimensions, and 6.16 km distance. **Test Hyperlocal Rates Through
Pax** returns the same normalized amount, GST, weight, pincode, zone, distance,
and raw provider data.

**List Orders** calls `GET /gateway/booking-service/orders` directly with
`page`, `limit`, `sortOrder`, and optional disabled filters for order status,
AWB, phone, payment type, dates, destination zip, and `addresses.*` fields.
**Test List Orders Through Pax** calls the backend proxy and returns normalized
`orders`, `count`, `page`, `limit`, `totalPages`, `currentPage`, `traceId`, and
the raw provider response.
