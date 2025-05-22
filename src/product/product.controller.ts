import { Body, Controller, Get, Post } from "../../lib/decorators/express";
import { CreateProductDto } from "./product.dto";
import { ProductService } from "./product.service";

@Controller("/products")
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get("/")
  getProducts() {
    return this.productService.getProducts();
  }

  @Post("/")
  createProduct(@Body() body: CreateProductDto) {
    return {
      message: "Product created",
    };
  }
}
