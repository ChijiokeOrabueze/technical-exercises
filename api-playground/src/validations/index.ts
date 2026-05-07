import { Request, Response, NextFunction } from "express";
import { AnyZodObject } from "zod";

const validate =
  (schema: AnyZodObject) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const response = schema.safeParse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (!response.success) {
        const errors = response.error.errors.map((e) => ({
          message: e.message,
          field: `${e.path[0]}:${e.path[1]}`,
        }));
        throw errors;
      }
      req.body = response.data?.body || {};
      req.params = response.data?.params || {};
      req.query = response.data?.query || {};
      return next();
    } catch (error) {
      return res.status(400).json(error);
    }
  };

export default validate;
