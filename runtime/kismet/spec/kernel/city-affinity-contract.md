# City Affinity Contract

> Owner Domain: `KIS-CITY-*`

## KIS-CITY-001 City Catalog Model

City affinity facts are authoritative in `tables/city-affinity-model.yaml`.
Runtime city data is a checked-in mod-local asset derived from that model.

## KIS-CITY-002 Deterministic Scoring

City affinity ranking MUST be deterministic from:

1. canonical favorable/unfavorable elements
2. day master relation to city base element
3. city element weights

## KIS-CITY-003 Weight Integrity

Each city entry MUST expose five-element weights summing to `100`.
`baseElement` MUST be the maximum-weight element.

## KIS-CITY-004 Birth City Exposure

Birth city five-element context MUST be visible to the user as `location context` with an explanation of its relation to the day master.
