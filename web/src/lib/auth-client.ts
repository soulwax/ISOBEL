// File: web/src/lib/auth-client.ts

/**
 * Client-side authentication utilities
 * For use in React components
 */

import { AUTH_BASE_URL } from './api-paths';

function callbackUrl(): string {
  return window.location.href;
}

export async function signIn() {
  const csrfToken = await getCsrfToken();
  if (!csrfToken) {
    window.location.href = `${AUTH_BASE_URL}/signin?callbackUrl=${encodeURIComponent(callbackUrl())}`;
    return;
  }

  // OAuth provider sign-in must be a browser form POST so redirects can navigate the page.
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${AUTH_BASE_URL}/signin/discord`;
  form.style.display = 'none';

  const csrfInput = document.createElement('input');
  csrfInput.type = 'hidden';
  csrfInput.name = 'csrfToken';
  csrfInput.value = csrfToken;

  const callbackInput = document.createElement('input');
  callbackInput.type = 'hidden';
  callbackInput.name = 'callbackUrl';
  callbackInput.value = callbackUrl();

  form.appendChild(csrfInput);
  form.appendChild(callbackInput);
  document.body.appendChild(form);
  form.submit();
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
