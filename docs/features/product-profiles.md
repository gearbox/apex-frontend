# Product profiles

A product profile describes the home route, default theme and navigation used by the shared app shell. The `productProfile` store resolves the product returned by the public product-info endpoint. Until it loads, or if the request fails, the validated build product (`VITE_PRODUCT_ID`, defaulting to `vex`) supplies the profile. An unknown runtime ID is reported once and falls back to the build product.

To add a navigation destination, add its route to `ROUTES` and its labels, icon and active matching to `NAV_DESTINATIONS`. Labels are functions so they reflect the current locale. Reference the destination ID in the appropriate profile navigation slots. The Library mobile slot is a special compound control; role- and legal-dependent entries remain in the shell components.

To vary behavior by product, add a typed field to `ProductProfile` and set it for every profile instead of branching on product names. ESLint prevents product ID comparisons and switch cases outside `src/lib/product/` (excluding tests and mocks). Theme defaults are applied in memory and never overwrite a stored user choice.

## Capabilities and gated destinations

Destinations can declare a runtime capability requirement in `NAV_DESTINATIONS`. The shared
navigation resolver removes those destinations until the capability probe reports `available`,
while preserving fixed mobile slots such as Library and More. Probe failures become `unreachable`
after one delayed retry; gated destinations stay hidden until a user retries successfully. The
Artists destination requires Studio, so it appears for Synthara only when the Studio API is
available. Vex does not probe Studio during startup because its profile has no Studio destination.
