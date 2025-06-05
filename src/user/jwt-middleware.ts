import { useInterceptor } from "@express-di-kit/common";

export const IsAuthenticated = () =>
  useInterceptor((req: any, res: any, next: any) => {
    (req as any).user = { id: 1, name: "Test User" };
    next();
    // res.status(401).json({
    //   error: "Unauthorized",
    //   message: "You must be authenticated to access this resource.",
    //   statusCode: 401,
    // });
  });
