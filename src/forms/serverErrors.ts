import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../api';

/**
 * 422 payload → errors next to the matching fields. Messages for fields the form does not
 * have go to the form-level error. Returns false when the error is not a validation error,
 * so the caller can show its own message.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || !error.isValidation || !error.payload) return false;

  const unmatched: string[] = [];
  for (const [field, messages] of Object.entries(error.payload)) {
    const message = messages[0] ?? error.message;
    if ((fields as readonly string[]).includes(field)) setError(field as Path<T>, { type: 'server', message });
    else unmatched.push(message);
  }
  if (unmatched.length) setError('root.server', { type: 'server', message: unmatched.join(' ') });
  return true;
}
