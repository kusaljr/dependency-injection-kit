import { Controller, Get } from "@express-di-kit/common";

@Controller("products")
export class ProductController {
  @Get()
  async getProductList() {
    const products = [
      { id: 1, name: "Product A", price: 100 },
      { id: 2, name: "Product B", price: 150 },
      { id: 3, name: "Product C", price: 200 },
    ];

    return {
      data: products,
    };
  }
}
