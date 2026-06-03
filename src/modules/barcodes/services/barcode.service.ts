import { Injectable, NotFoundException } from "@express-di-kit/common";
import { dikitDB } from "@express-di-kit/orm";
import { BarcodeDto, UpdateBarcodeDto } from "../dto/barcode.dto";

@Injectable()
export class BarcodeService {
  constructor() {}

  async getBarcodeList(limit: number, page: number) {
    const result = await dikitDB
      .with("active_barcodes", (db) =>
        db.table("barcode").where({
          "barcode.is_active": true,
        }),
      )
      .from("active_barcodes")
      .limit(Number(limit))
      .offset(Number((page - 1) * limit))
      .select(["active_barcodes.code"])
      .execute();

    return result;
  }

  async getBarcodeById(id: number) {
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

  async createBarcode(body: BarcodeDto) {
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

  async updateBarcode(id: number, body: UpdateBarcodeDto) {
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

  async deleteBarcode(id: number) {
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
      .delete()
      .where({
        "barcode.id": Number(id),
      })
      .execute();
  }
}
