import { Controller, Get, Post } from "@express-di-kit/common";
import {
  Body,
  Delete,
  Param,
  Patch,
  Query,
} from "@express-di-kit/decorators/router";
import { React } from "@express-di-kit/static";
import { pageResponse } from "@express-di-kit/static/decorator";
import { BarcodeDto, UpdateBarcodeDto } from "../dto/barcode.dto";
import { BarcodeService } from "../services/barcode.service";

@Controller("/dashboard/barcodes")
export class BarcodePagesController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Get()
  @React()
  async getBarcodeList(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 10
  ) {
    const { data } = await this.barcodeService.getBarcodeList(limit, page);
    return pageResponse(
      {
        title: "Barcode List",
        description: "List of all barcodes",
      },
      {
        barcodes: data,
      }
    );
  }

  @Post()
  async createBarcode(@Body() body: BarcodeDto) {
    const result = await this.barcodeService.createBarcode(body);
    if (result.error) {
      return {
        error: result.error,
        status: result.status || 500,
      };
    }
    return {
      data: result.data,
      status: 201,
    };
  }

  @Patch("/:id")
  async updateBarcode(@Param("id") id: number, @Body() body: UpdateBarcodeDto) {
    return await this.barcodeService.updateBarcode(id, body);
  }

  @Delete("/:id")
  async deleteBarcode(@Param("id") id: number) {
    return await this.barcodeService.deleteBarcode(id);
  }
}
