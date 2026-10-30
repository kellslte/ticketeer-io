import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

export interface FieldError {
  field: string;
  message: string;
}

export function flattenErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    return [
      ...Object.values(e.constraints ?? {}).map((message) => ({ field, message })),
      ...flattenErrors(e.children ?? [], field),
    ];
  });
}

/** Global pipe: strips nothing silently — unknown fields (e.g. `status` on create) are a 400. */
export const createValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: flattenErrors(errors),
      }),
  });
