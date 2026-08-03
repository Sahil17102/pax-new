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

The read-only folder covers pincode serviceability (including empty/Embargo
normalization), expected TAT, shipping cost, tracking, label metadata, and NDR
status. Requests that allocate waybills or change Delhivery state are skipped by
default. Set `allowMutating=true` only when you deliberately want to run those
requests against the configured Delhivery account.
