import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

type Parts = 'body' | 'params' | 'query';

/**
 * Parse Zod errors into user-friendly format
 */
function formatZodErrors(error: z.ZodError): {
  message: string;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  for (const issue of error.errors) {
    const field = issue.path.join('.');
    // Use the Zod message (which includes custom messages from schemas)
    errors[field] = issue.message;
  }

  // Create a user-friendly summary message
  const errorCount = error.errors.length;
  const message =
    errorCount === 1
      ? error.errors[0].message
      : `Please fix ${errorCount} issues with your submission.`;

  return { message, errors };
}

export const validateRequest = (
  schemaOrMap: z.ZodType<any> | Partial<Record<Parts, z.ZodType<any>>>
) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (schemaOrMap instanceof z.ZodType) {
      await schemaOrMap.parseAsync(req.body);
    } else {
      if (schemaOrMap.body) await schemaOrMap.body.parseAsync(req.body);
      if (schemaOrMap.params) await schemaOrMap.params.parseAsync(req.params);
      if (schemaOrMap.query) await schemaOrMap.query.parseAsync(req.query);
    }
    return next();
  } catch (error) {
    // Handle Zod validation errors with user-friendly messages
    if (error instanceof z.ZodError) {
      const { message, errors } = formatZodErrors(error);
      res.status(400).json({
        success: false,
        message,
        code: 'VALIDATION_ERROR',
        errors,
      });
      return;
    }

    // Handle unexpected errors
    res.status(400).json({
      success: false,
      message: 'Please check your input and try again.',
      code: 'VALIDATION_ERROR',
    });
    return;
  }
};