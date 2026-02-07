// File: web/src/lib/auth-client.ts

/**
 * Client-side authentication utilities
 * For use in React components
 */

import { AUTH_BASE_URL } from './api-paths';

function callbackUrl(): string {
  return encodeURIComponent(window.location.href);
}

export async function signIn() {
  // Redirect directly to Discord provider sign-in.
  window.location.href = `${AUTH_BASE_URL}/signin/discord?callbackUrl=${callbackUrl()}`;
}

async function getCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/csrf`, {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { csrfToken?: string };
    return typeof data.csrfToken === 'string' ? data.csrfToken : null;
  } catch {
    return null;
  }
}

export async function signOut() {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    window.location.href = `${AUTH_BASE_URL}/signout?callbackUrl=${encodeURIComponent(window.location.origin)}`;
    return;
  }

  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: window.location.origin,
  });

  const response = await fetch(`${AUTH_BASE_URL}/signout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    credentials: 'include',
    body: body.toString(),
  });

  if (response.redirected) {
    window.location.href = response.url;
    return;
  }

  if (response.ok || response.status === 302) {
    window.location.href = '/';
    return;
  }

  window.location.href = `${AUTH_BASE_URL}/signout?callbackUrl=${encodeURIComponent(window.location.origin)}`;
}

export async function getSession() {
  try {
    const response = await fetch(`${AUTH_BASE_URL}/session`, {
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}
