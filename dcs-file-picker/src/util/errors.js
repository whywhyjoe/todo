// The one error type the broker throws, and the code vocabulary every
// provider must speak. Callers switch on `code`, never on message text.
//
// Codes:
//   cancelled          the user dismissed the dialog (open/save resolve null
//                      instead of throwing — this code is for provider aborts)
//   not-available      the provider cannot run here (no SP context, no API)
//   invalid-location   a locator string did not resolve to a browsable place
//   outside-root       a path escaped the provider's allowed boundary
//   not-found          the file or folder is gone
//   permission         the store refused the caller's identity
//   conflict           a file with that name already exists
//   too-large          past the configured byte ceiling
//   unsupported-type   the file does not match the accept filter
//   invalid-name       a file name with separators or a reserved name
//   network            the transport failed before a response arrived
//   read / write       generic transfer failure
//   metadata-read / metadata-write   the bytes moved but the columns did not

export class FileBrokerError extends Error {
  constructor(message, { code = 'file-broker', status = 0, cause, fieldErrors } = {}) {
    super(message, { cause });
    this.name = 'FileBrokerError';
    this.code = code;
    this.status = status;
    // { fieldKey: message } — set by metadata writes so a form can route a
    // per-field rejection back onto the control that produced it.
    if (fieldErrors) this.fieldErrors = fieldErrors;
  }
}

export function brokerError(error, fallbackCode = 'file-broker') {
  if (error instanceof FileBrokerError) return error;
  return new FileBrokerError(error?.message || String(error), {
    code: fallbackCode,
    cause: error,
  });
}
