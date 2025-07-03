import { Controller, Get, NotFoundException } from "@express-di-kit/common";
import {
  Body,
  Param,
  Patch,
  Post,
  Query,
} from "@express-di-kit/decorators/router";
import { dikitDB } from "@express-di-kit/orm";
import { BarcodeDto, UpdateBarcodeDto } from "./barcode.dto";

@Controller("/barcodes")
export class BarcodeController {
  @Get()
  async getBarcodeList(
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 10
  ) {
    const products = await dikitDB
      .table("barcode")
      .select([])
      .limit(limit)
      .offset((page - 1) * limit)
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
    console.log("Creating barcode with body:", body);
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

  @Patch("/:id")
  async updateBarcode(@Param("id") id: number, @Body() body: UpdateBarcodeDto) {
    const existingBarcode = await dikitDB
      .table("barcode")
      .select([])
      .where({
        "barcode.id": Number(id),
      })
      .execute();

    if (existingBarcode.length === 0) {
      throw new NotFoundException("Barcode with this ID does not list");
    }

    return await dikitDB
      .table("barcode")
      .update(body)
      .where({
        "barcode.id": Number(id),
      })
      .execute();
  }
}
