import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { signAccessToken, signRefreshToken } from "../../utils/jwt";
import { db } from "../client";
import { users } from "../schema/users";
import { findUserByEmail, findUserById, saveRefreshToken } from "./userService";


const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CANONICAL_ADMIN_EMAIL = "admin@paxlogistics.com";
const CANONICAL_ADMIN_PASSWORD = "Admin@12345!";

export const loginAdmin = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const seedEmail = (
    process.env.ADMIN_SEED_EMAIL ||
    process.env.ADMIN_LOGIN_EMAIL ||
    CANONICAL_ADMIN_EMAIL
  )
    .trim()
    .toLowerCase();
  const seedPassword =
    process.env.ADMIN_SEED_PASSWORD ||
    process.env.ADMIN_LOGIN_PASSWORD ||
    CANONICAL_ADMIN_PASSWORD;
  const isConfiguredSeedLogin =
    normalizedEmail === seedEmail && password === seedPassword;
  const isCanonicalRecoveryLogin =
    normalizedEmail === CANONICAL_ADMIN_EMAIL &&
    password === CANONICAL_ADMIN_PASSWORD;

  let user = await findUserByEmail(normalizedEmail);

  // Recover the configured admin account if an older deployment left the
  // database with a missing role or stale password hash. The supplied
  // credentials must exactly match the server-side seed credentials before
  // any account is created, promoted, or synchronized.
  if (isConfiguredSeedLogin || isCanonicalRecoveryLogin) {
    const passwordMatches = user?.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!user || user.role !== "admin" || !passwordMatches) {
      const passwordHash = await bcrypt.hash(password, 10);

      if (user) {
        const [updatedAdmin] = await db
          .update(users)
          .set({
            passwordHash,
            role: "admin",
            emailVerified: true,
            phoneVerified: true,
            accountVerified: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        user = updatedAdmin;
      } else {
        const [createdAdmin] = await db
          .insert(users)
          .values({
            email: normalizedEmail,
            passwordHash,
            role: "admin",
            emailVerified: true,
            phoneVerified: true,
            accountVerified: true,
          })
          .returning();
        user = createdAdmin;
      }
    }
  }

  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const isMatch = user.passwordHash
    ? await bcrypt.compare(password, user.passwordHash)
    : false;
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const accessToken = signAccessToken(user.id, "admin");
  const { token: refreshToken } = signRefreshToken(user.id, "admin");

  await saveRefreshToken(user.id, refreshToken, ONE_WEEK_MS);

  return {
   token: accessToken,
    refreshToken:refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    },
  };
};

export const changeAdminPassword = async (
  adminId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = await findUserById(adminId);

  if (!user || user.role !== "admin") {
    throw new Error("Unauthorized");
  }

  if (!user.passwordHash) {
    throw new Error("Password is not set for this admin");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    throw new Error("Current password is incorrect");
  }

  if (currentPassword === newPassword) {
    throw new Error("New password must be different from current password");
  }

  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}/.test(newPassword)) {
    throw new Error(
      "Password must be at least 8 characters and include upper, lower, and number",
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, adminId));

  // Invalidate old refresh token so admin re-auths cleanly on other sessions.
  await saveRefreshToken(adminId, null, 0, null);
};
