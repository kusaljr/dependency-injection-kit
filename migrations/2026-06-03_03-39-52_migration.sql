BEGIN;
-- WARNING: Attempt to DROP NOT NULL on primary key column "id" skipped.
CREATE TABLE "product" (
  id SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "description" VARCHAR(255),
  "price" REAL NOT NULL,
  "status" "ProductStatus",
  "brand_id" INTEGER,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP,
  FOREIGN KEY ("brand_id") REFERENCES "brand"("id")
);
-- WARNING: Attempt to DROP NOT NULL on primary key column "id" skipped.
-- WARNING: Attempt to DROP NOT NULL on primary key column "id" skipped.
COMMIT;