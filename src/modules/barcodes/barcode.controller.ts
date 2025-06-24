import { Controller, Get } from "@express-di-kit/common";
import { Body, Param, Post, Query } from "@express-di-kit/decorators/router";
import { dikitDB } from "@express-di-kit/orm";
import { BarcodeDto } from "./barcode.dto";

@Controller("/barcodes")
export class BarcodeController {
  @Get()
  async getBarcodeList(
    @Query("search") search?: string,
    @Query("is_active") isActive?: boolean,
    @Query("limit") limit: number = 10,
    @Query("offset") offset: number = 0
  ) {
    const products = await dikitDB
      .table("barcode")
      .select([])
      .limit(limit)
      .offset(offset)
      .execute();

    return {
      data: products,
    };
  }

  @Get("/:id")
  async getBarcodeById(@Param("id") id: number) {
    const product = await dikitDB
      .table("barcode")
      .select([])
      .where({
        "barcode.id": Number(id),
      })
      .execute();

    if (product.length === 0) {
      return {
        error: "Barcode not found",
        status: 404,
      };
    }

    return {
      data: product[0],
    };
  }

  @Post()
  async createBarcode(@Body() body: BarcodeDto) {
    const { code, metadata, is_active } = body;

    const newBarcode = await dikitDB.table("barcode").insert({
      code,
      metadata,
      is_active,
    });

    if (!newBarcode) {
      return {
        error: "Failed to create barcode",
        status: 500,
      };
    }

    return {
      data: newBarcode,
    };
  }
}
