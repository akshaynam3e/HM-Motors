# HM Motors CSV import: quick fixes

In **Admin → Inventory**, export the current CSV first as a backup/template. Upload a CSV file up to **1 MB** with no more than **500 vehicle rows**.

## Required header row

The header names must include these exact lowercase columns: `slug,category,brand,model`. Keep the rest of the exported header row if you used the app's template. A blank slug is generated from the vehicle details. Use a unique slug for each distinct listing; an existing slug **updates** that listing.

## Accepted values

- `category`: `SCOOTER`, `MOTORCYCLE`, or `CAR`
- `condition`: `NEW` or `PRE_OWNED` (if blank, it defaults to `NEW`)
- `availability`: `ASK`, `IN_STOCK`, `LIMITED`, `OUT_OF_STOCK`, or `DISCONTINUED`
- `price_verified`, `published`, and `featured`: `true`/`false` (or `1`/`0`)
- If `price_verified` is true, provide `ex_showroom_price`; this field is the asking price for a second-hand vehicle.
- `colours_json` must be a JSON list, e.g. `["Black","Red"]`; `specs_json` must be a JSON object, e.g. `{ "Year": "2022" }`. Leave either blank if not used.
- Leave `image_path` blank; add photos from the portal after importing.

## If the portal reports errors

1. Read the import summary: it shows how many rows were **created**, **updated**, and had errors. Valid rows are imported even if other rows fail.
2. Expand **Review rows with errors**. Row numbers count the header as row 1; use the reported row number in your spreadsheet.
3. Fix the reported value or JSON syntax, save/export as CSV UTF-8, then upload a corrected CSV containing only the failed rows. Do not re-import successful rows unless you intend to update them.
4. Common messages:
   - **CSV needs slug, category, brand, and model columns** — correct the header spelling/case; make sure there is at least one data row.
   - **CSV could not be read** — export as CSV (not XLSX), check consistent columns and quote any commas inside text.
   - **Invalid colours_json or specs_json** — use valid JSON with double quotes, or leave the cell blank.
   - **Duplicate slug** — give each different vehicle/condition listing a unique slug. Reusing a slug intentionally updates the existing listing.
   - **Invalid enum/value** — use the exact uppercase category, condition, availability, and boolean values above.
   - **Enter the verified listing price...** — add a numeric price or set `price_verified` to `false`.
5. Listings are drafts unless `published` is true. Check imported details and photos in Inventory before publishing.

If the portal says more than 50 rows have errors, it displays only the first 50. Fix those first or split the remaining rows into smaller batches.
