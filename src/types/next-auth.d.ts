// src/types/next-auth.d.ts
import{ DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  /**
   * Extend the default Session interface to include `user.id`.
   * This makes `session.user.id` available everywhere in your app.
   */
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  /**
   * Extend the User type (optional but good to keep in sync).
   * This tells TypeScript your User object produced by the adapter
   * will contain an `id` string property.
   */
  interface User extends DefaultUser {
    id: string;
  }
}
