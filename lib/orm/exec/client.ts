import { SQL } from "bun";

export const sqlClient = new SQL({
  url: process.env.DATABASE_URL,
});
