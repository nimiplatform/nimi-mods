# Intake Contract

> Owner Domain: `KIS-IN-*`

## KIS-IN-001 Birth Intake Schema

Birth intake is authoritative in `tables/input-fields.yaml`.
The user-facing input MUST be birth-based, not expert BaZi-field-based.

## KIS-IN-002 City Selector Requirement

Birth place MUST resolve from the mod-local curated city catalog.
Free-text geocoding is out of scope.

## KIS-IN-003 Deterministic Derivation Preview

Before natal analysis generation, the mod MUST derive and display year, month, day, and hour pillars from the birth intake.

## KIS-IN-004 Consent Inputs

Local consent toggles are part of intake because they govern city affinity use and local profile persistence.
