import { db } from "./exec/db";

// generate types

async function main() {
  const result = await db
    .table("barcode")
    .update({
      metadata: {
        type: {
          nonce: "asldkfj1234",
        },
        code_type: "QR",
      },
    })
    .where({
      "barcode.code": "1C234567890",
      "barcode.metadata": {
        type: {
          nonce: "asldkfj1234",
        },
      },
    })
    .select(["barcode.metadata"])
    .execute();

  console.log("Query Result:", result[0]);
}

main();
