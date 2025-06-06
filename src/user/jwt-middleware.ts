import { Injectable } from "@express-di-kit/common";
import { CanActivate } from "@express-di-kit/common/middleware";

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(req: any) {
    return true;
  }
}
