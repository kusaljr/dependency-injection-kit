import { Injectable } from "@express-di-kit/common";
import { ForbiddenException } from "@express-di-kit/common/exceptions";
import { CanActivate } from "@express-di-kit/common/middleware";

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(req: any) {
    throw new ForbiddenException(
      "You are not authorized to access this resource. Please log in."
    );
    return true;
  }
}
