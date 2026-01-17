// File: web/src/auth/index.ts

import NextAuth from 'next-auth';
import { authConfig } from './config.js';

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
