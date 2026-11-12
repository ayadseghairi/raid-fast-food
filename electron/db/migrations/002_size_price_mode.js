'use strict';

/**
 * Migration 002 – add size_price_mode to products.
 *
 * 'absolute' (DEFAULT for new products): each size price IS the full unit price.
 *   The base price field is not used for billing.
 * 'delta'   : each size price is an add-on on top of the base price.
 *
 * Existing products that already have sizes: set 'delta' so current
 * behavior (add-on) and existing data are preserved unchanged.
 * Products without sizes keep 'absolute' (they have no sizes, so the
 * column value is irrelevant, but 'absolute' is the future default).
 *
 * Also add sort_order to product_options so the owner can reorder sizes.
 */

module.exports = {
  version: 2,

  /**
   * @param {import('better-sqlite3').Database} db
   */
  up(db) {
    db.exec(`
      -- Add size_price_mode column (default 'absolute' for new products)
      ALTER TABLE products
        ADD COLUMN size_price_mode TEXT NOT NULL DEFAULT 'absolute'
          CHECK(size_price_mode IN ('absolute','delta'));

      -- Add sort_order to product_options (so owner can reorder sizes)
      ALTER TABLE product_options
        ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

      -- Existing products that already have at least one 'size' option
      -- get 'delta' so their current add-on pricing is unchanged.
      UPDATE products
        SET size_price_mode = 'delta'
        WHERE id IN (
          SELECT DISTINCT product_id
          FROM product_options
          WHERE type = 'size'
        );
    `);
  },
};
