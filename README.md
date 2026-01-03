Website accessible here : [https://main.di9rzwkm5kwbm.amplifyapp.com/](https://main.di9rzwkm5kwbm.amplifyapp.com/) ; 

# GeoGridTrainer

The goal is to get better at [https://www.geogridgame.com/](https://www.geogridgame.com/) ; There are several levels to this that all seem interesting and will help me get better.

## Level 1

Create a simple UI that looks like a big excel sheet with all categories as column (slightly more complex than that for others) with advanced filtering and sorting capabilities. Most of the time will be spend on data collecting and cleaning probably.

### Web UI (React + TypeScript)

This repo now includes a React+TypeScript UI (Vite) that loads:

- `public/data/ui_countries.csv` (a UI-focused subset of the dataset)
- `public/flags/{cc}.svg` (flag assets)

Run locally:

```bash
yarn install
yarn dev
```

Build (also what AWS Amplify runs):

```bash
yarn build
```

### Data (CDN mirror + clean CSV export)

GeoGrid itself loads pre-built JSON datasets (compiled from sources like Wikipedia) from a public CDN.
This repo mirrors those JSON files and exports **clean CSVs** where any list-like category (ex: flag colors) is preserved as a **JSON array inside a CSV cell**.

- **Source website**: [GeoGrid](https://www.geogridgame.com/)
- **CDN base** (discovered via site frontend): `https://cdn-assets.teuteuf.fr/data/`

#### Generate / refresh datasets

From the repo root:

```bash
python3 scripts/geogrid_fetch_and_build.py
```

This will:

- Download raw CDN JSON into `raw data/cdn/`
- Validate that every downloaded file parses as JSON
- Export cleaned CSVs into `cleaned/`

#### Output files (high-signal)

- `cleaned/geogrid_country_details.csv`
  - Flattened per-country GeoGrid category data
  - Example list field: `flagInfo__colorsOnFlag` is a JSON array string (ex: `["black","white","red","green"]`)
  - Border helpers:
    - `geographyInfo__borderCount` (derived)
    - `geographyInfo__borderCountriesCodes_json` (derived, JSON array of neighbor codes)
- `cleaned/geogrid_board_cells.csv`
  - One row per board cell, with `answers_names_json` and resolved `answers_codes_json`
- `cleaned/common_country_details.csv`
  - Extra country facts (population, languages, currencyData, borders, etc.)

#### One final "everything" CSV (for the Level 1 spreadsheet UI)

- `cleaned/final_countries.csv`
  - One row per country
  - Includes `Country code`
  - Includes `Country name (xx)` columns for **every language code** present in the source data
  - Merges **Common** + **GeoGrid** detail fields
  - Column headers are human-readable and keep the original machine key in brackets (for stable parsing)

#### Column naming helpers

GeoGrid uses human-friendly category names/definitions in its frontend; this repo exports those too:

- `cleaned/geogrid_category_metadata.csv`: official category wording + descriptions + sources
- `cleaned/geogrid_category_ids.csv`: mapping from `category_id` -> `category_name` / `section_name`
- `cleaned/column_dictionary_geogrid_country_details.csv`: mapping from raw CSV column -> display name
- `cleaned/column_dictionary_common_country_details.csv`: mapping from raw CSV column -> display name

#### Flags (SVG)

The pipeline also mirrors **all flag SVGs** keyed by country code:

- **Folder**: `raw data/cdn/common_flags_svg/`
- **Filename format**: `{country_code_lower}.svg` (example: `af.svg`, `fr.svg`, `us.svg`)

#### UI dataset

The UI uses a smaller CSV exported by the pipeline:

- `cleaned/ui_countries.csv` -> copied to `public/data/ui_countries.csv`
- Only includes columns that back GeoGrid-style prompts (flag colors, medals, landlocked, etc.)
- Includes `flag_svg` as a ready-to-use URL (ex: `/flags/af.svg`)

## Level 2

One new learning page:

- **Learning a Country** : Flashcard mode for country facts. Shows only labels first; click/tap to reveal values. Includes a big flag, name, and all grid-relevant facts (rarity, population/area, flags, geography, economy, politics, sports, facts) sorted by usefulness. "New card" pulls another random country.

Navigation is via the top bar:

- `Table` -> main filterable/sortable dataset table
- `Learning a Country` -> flashcard practice for countries
- `Learning a Category` -> (empty, reserved for next iteration)

## Level 3

The **Learning a Category** page is now an interactive drill tool:

- **Pick a category** (any column) from a small dropdown, or click **Random**
- **Practice by guessing countries** that match the category:
  - A grid of hidden tiles is built from all countries matching the category
  - Tiles are **sorted by Rarity** (rarest first)
  - Type in the input (substring search like `bah` -> Bahamas) and click a suggestion
  - If correct, the tile reveals the **flag + country name**
  - If wrong, the input blinks red briefly
- **Boolean categories** train only the **true** cases (e.g., "Was USSR" shows only former USSR countries)
- **Numeric categories** let you choose **<= / >=** and enter a number manually
- **Flag colors** supports selecting **Any** vs **All** combinations of colors
- **Reveal all** button shows the full answer set for a category
