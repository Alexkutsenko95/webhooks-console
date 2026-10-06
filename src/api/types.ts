// The API contract from the task, as types. One place: mock, client and UI all import from here.

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
}

export interface Webhook {
  id: number;
  name: string;
  url: string;
  active: boolean;
  created_at: string;
}

export interface WebhookList {
  data: Webhook[];
  paging: {
    pages: { current: number; last: number };
    results: { total: number; limitation: number };
  };
}

export interface WebhookInput {
  name: string;
  url: string;
}

export interface WebhookListParams {
  page: number;
  search: string;
}

export type ErrorType =
  | 'BadRequestException'
  | 'AuthenticationException'
  | 'NotFoundException'
  | 'TokenMismatchException'
  | 'ValidationException';

/** Field name → messages. Present on 422 only. */
export type ValidationPayload = Record<string, string[]>;

export interface ErrorBody {
  error: {
    type: ErrorType;
    message: string;
    payload?: ValidationPayload;
  };
}

export interface LoginResponse {
  device_session_token: string;
}
