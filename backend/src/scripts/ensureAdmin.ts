import * as dotenv from 'dotenv'
import path from 'path'
import bcryptjs from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { users } from '../models/schema/users'
import { userProfiles } from '../models/schema/userProfile'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const email = (process.env.ADMIN_SEED_EMAIL || process.env.ADMIN_LOGIN_EMAIL || 'admin@expressmagic.com')
  .trim()
  .toLowerCase()
const configuredPassword = process.env.ADMIN_SEED_PASSWORD || process.env.ADMIN_LOGIN_PASSWORD
const password = configuredPassword || 'Admin@12345!'
const forcePasswordReset = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.ADMIN_FORCE_PASSWORD_RESET || '').trim().toLowerCase(),
)

const isMissingRelationError = (error: any) =>
  error?.code === '42P01' ||
  error?.cause?.code === '42P01' ||
  String(error?.message || '').includes('relation "users" does not exist') ||
  String(error?.cause?.message || '').includes('relation "users" does not exist')

async function ensureAdmin() {
  if (!email || !password) {
    throw new Error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD are required')
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  let userId = existingUser?.id

  if (existingUser) {
    const updates: Partial<typeof users.$inferInsert> = {
      role: 'admin',
      emailVerified: true,
      phoneVerified: true,
      accountVerified: true,
      updatedAt: new Date(),
    }

    // An explicitly configured seed password is authoritative. This prevents
    // Render credentials from drifting away from an older database password.
    if (!existingUser.passwordHash || forcePasswordReset || configuredPassword) {
      updates.passwordHash = await bcryptjs.hash(password, 10)
    }

    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, existingUser.id))
    console.log(`Admin updated: ${email}`)
    if (forcePasswordReset || configuredPassword) {
      console.log('Admin password synchronized from ADMIN_SEED_PASSWORD')
    }
  } else {
    const passwordHash = await bcryptjs.hash(password, 10)
    const [createdUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        role: 'admin',
        emailVerified: true,
        phoneVerified: true,
        accountVerified: true,
      })
      .returning()

    userId = createdUser.id
    console.log(`Admin created: ${email}`)
  }

  const existingProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId!),
  })

  const companyInfo = {
    businessName: 'Pax Logistics Admin',
    contactPerson: 'Admin User',
    POCEmailVerified: true,
    POCPhoneVerified: true,
    companyAddress: 'Admin Workspace',
    pincode: '110001',
    state: 'Delhi',
    city: 'New Delhi',
    contactNumber: '+919999999999',
    contactEmail: email,
    companyContactNumber: '+919999999999',
    brandName: 'Pax Logistics',
    companyEmail: email,
    website: 'https://pax-log-admin.onrender.com',
  }

  if (existingProfile) {
    await db
      .update(userProfiles)
      .set({
        companyInfo,
        businessType: ['b2c'],
        approved: true,
        onboardingComplete: true,
        profileComplete: true,
        approvedAt: existingProfile.approvedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId!))
    console.log('Admin profile updated')
  } else {
    await db.insert(userProfiles).values({
      userId: userId!,
      companyInfo,
      businessType: ['b2c'],
      approved: true,
      onboardingComplete: true,
      profileComplete: true,
      approvedAt: new Date(),
    })
    console.log('Admin profile created')
  }

  console.log('\nAdmin panel login')
  console.log(`Email: ${email}`)
  console.log('Password: configured securely in ADMIN_SEED_PASSWORD')
}

ensureAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    if (isMissingRelationError(error)) {
      console.warn(
        'Admin seed skipped: database schema is not initialized yet. Run `npm run bootstrap:db` once, then redeploy/restart.',
      )
      process.exit(0)
    }

    console.error('Failed to ensure admin:', error)
    process.exit(1)
  })
