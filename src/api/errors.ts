import type { ErrorBody, ErrorType, ValidationPayload } from './types';

const TYPE_BY_STATUS: Record<number, ErrorType> = {
  400: 'BadRequestException',
  401: 'AuthenticationException',
  404: 'NotFoundException',
  419: 'TokenMismatchException',
  422: 'ValidationException',
};

/** Every non-2xx response becomes one of these — UI code never looks at raw responses. */
export class ApiError extends Error {
  readonly status: number;
  readonly type: ErrorType | 'UnknownError';
  readonly payload: ValidationPayload | undefined;

  constructor(status: number, type: ApiError['type'], message: string, payload?: ValidationPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.payload = payload;
  }

  get isValidation(): boolean {
    return this.status === 422 && this.payload !== undefined;
  }
}

function isErrorBody(value: unknown): value is ErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return typeof error === 'object' && error !== null && 'type' in error && 'message' in error;
}

export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  if (isErrorBody(body)) {
    return new ApiError(response.status, body.error.type, body.error.message, body.error.payload);
  }
  return new ApiError(
    response.status,
    TYPE_BY_STATUS[response.status] ?? 'UnknownError',
    response.statusText || 'Request failed',
  );
}
