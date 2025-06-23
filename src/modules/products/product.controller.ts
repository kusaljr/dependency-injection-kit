import { Controller, Get } from "@express-di-kit/common";
import { dikitDB } from "@express-di-kit/orm";

@Controller("/products")
export class ProductController {
  @Get()
  async getProductList() {
    const products = await dikitDB.table("barcode").select([]).execute();

    return {
      data: products,
    };
  }
}
