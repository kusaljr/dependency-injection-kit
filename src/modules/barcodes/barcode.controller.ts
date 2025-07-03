import { Controller, Get } from "@express-di-kit/common";
import {
  Body,
  Delete,
  Param,
  Patch,
  Post,
  Query,
} from "@express-di-kit/decorators/router";
import { BarcodeDto, UpdateBarcodeDto } from "./barcode.dto";
import { BarcodeService } from "./barcode.service";

@Controller("/barcodes")
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Get()
  async getBarcodeList(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 10
  ) {
    return this.barcodeService.getBarcodeList(limit, page);
  }

  @Get("/:id")
  async getBarcodeById(@Param("id") id: number) {
    return this.barcodeService.getBarcodeById(id);
  }

  @Post()
  async createBarcode(@Body() body: BarcodeDto) {
    return this.barcodeService.createBarcode(body);
  }

  @Patch("/:id")
  async updateBarcode(@Param("id") id: number, @Body() body: UpdateBarcodeDto) {
    return this.barcodeService.updateBarcode(id, body);
  }

  @Delete("/:id")
  async deleteBarcode(@Param("id") id: number) {
    return this.barcodeService.deleteBarcode(id);
  }
}
