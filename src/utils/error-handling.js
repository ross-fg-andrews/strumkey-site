export class AppError extends Error {
  constructor(message, code, userMessage) {
    super(message);
    this.code = code;
    this.userMessage = userMessage || message;
    this.name = 'AppError';
  }
}

export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DELETION_BLOCKED: 'DELETION_BLOCKED',
  AUTH_ERROR: 'AUTH_ERROR',
};

export function handleError(error, context = '') {
  console.error(`Error in ${context}:`, error);

  if (error instanceof AppError) {
    return {
      message: error.userMessage,
      code: error.code,
      originalError: error.message,
    };
  }

  // Network errors
  if (error.message?.includes('network') || error.message?.includes('fetch')) {
    return {
      message: 'Network error. Please check your connection and try again.',
      code: ERROR_CODES.NETWORK_ERROR,
    };
  }

  // Permission errors
  if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
    return {
      message: 'You don\'t have permission to perform this action.',
      code: ERROR_CODES.PERMISSION_DENIED,
    };
  }

  // Generic error
  return {
    message: 'Something went wrong. Please try again.',
    code: 'UNKNOWN_ERROR',
  };
}

