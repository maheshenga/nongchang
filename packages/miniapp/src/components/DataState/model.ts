export interface AsyncResource<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: T;
  error: string | null;
}

export function idleResource<T>(data: T): AsyncResource<T> {
  return { status: 'idle', data, error: null };
}

export function loadingResource<T>(previous: AsyncResource<T>): AsyncResource<T> {
  return { status: 'loading', data: previous.data, error: null };
}

export function successResource<T>(data: T): AsyncResource<T> {
  return { status: 'success', data, error: null };
}

export function errorResource<T>(previous: AsyncResource<T>, error: string): AsyncResource<T> {
  return { status: 'error', data: previous.data, error };
}
