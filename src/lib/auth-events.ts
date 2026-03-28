const AUTH_STATE_UPDATED_EVENT = 'auth-state-updated';
const AUTH_STORAGE_KEYS = new Set(['user', 'user_display_name', 'user_role']);

export interface StoredAuthState {
  shortname: string | null;
  displayName: string | null;
  role: string | null;
}

interface NextStoredAuthState {
  shortname: string;
  displayName: string;
  role: string;
}

function readStoredValue(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = localStorage.getItem(key)?.trim();
  return value ? value : null;
}

export function getStoredAuthState(): StoredAuthState {
  return {
    shortname: readStoredValue('user'),
    displayName: readStoredValue('user_display_name'),
    role: readStoredValue('user_role'),
  };
}

export function subscribeAuthState(onChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && !AUTH_STORAGE_KEYS.has(event.key)) {
      return;
    }

    onChange();
  };

  window.addEventListener(AUTH_STATE_UPDATED_EVENT, onChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(AUTH_STATE_UPDATED_EVENT, onChange);
    window.removeEventListener('storage', handleStorage);
  };
}

function notifyAuthStateChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_STATE_UPDATED_EVENT));
}

export function saveStoredAuthState(
  nextState: NextStoredAuthState
) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem('user', nextState.shortname);
  localStorage.setItem('user_display_name', nextState.displayName);
  localStorage.setItem('user_role', nextState.role);
  notifyAuthStateChanged();
}

export function clearStoredAuthState() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('user');
  localStorage.removeItem('user_display_name');
  localStorage.removeItem('user_role');
  notifyAuthStateChanged();
}
