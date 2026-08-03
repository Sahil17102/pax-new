import * as dotenv from 'dotenv'
import path from 'path'
import bcryptjs from 'bcryptjs'
import { db } from '../models/client'
import { users } from '../models/schema/users'
import { userProfiles } from '../models/schema/userProfile'
import { eq } from 'drizzle-orm'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

async function createDummyAdmin() {
  try {
    console.log('🚀 Creating dummy admin user...')

    const email = (process.env.ADMIN_SEED_EMAIL || process.env.ADMIN_LOGIN_EMAIL || 'admin@paxlogistics.com')
      .trim()
      .toLowerCase()
    const password = process.env.ADMIN_SEED_PASSWORD || process.env.ADMIN_LOGIN_PASSWORD || 'Admin@12345!'
    const hashedPassword = await bcryptjs.hash(password, 10)

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    })

    if (existingUser) {
      console.log('⚠️  Admin user already exists. Updating...')
      await db
        .update(users)
        .set({
          passwordHash: hashedPassword,
          emailVerified: true,
          phoneVerified: true,
          accountVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
      console.log('✓ Admin password updated')
    } else {
      // Create new admin user
      const newUser = await db
        .insert(users)
        .values({
          email,
          passwordHash: hashedPassword,
          emailVerified: true,
          phoneVerified: true,
          accountVerified: true,
          role: 'admin',
        })
        .returning()

      console.log('✓ Admin user created:', newUser[0].id)

      // Create user profile with approved and onboarding complete
      await db
        .insert(userProfiles)
        .values({
          userId: newUser[0].id,
          companyInfo: {
            businessName: 'Test Company',
            contactPerson: 'Admin User',
            POCEmailVerified: true,
            POCPhoneVerified: true,
            companyAddress: '123 Test Street',
            pincode: '110001',
            state: 'Delhi',
            city: 'New Delhi',
            contactNumber: '+919876543210',
            contactEmail: email,
            companyContactNumber: '+919876543210',
            brandName: 'Test Brand',
            companyEmail: email,
            website: 'https://shiplifi.local',
          },
          businessType: ['b2c'],
          approved: true,
          onboardingComplete: true,
          profileComplete: true,
          approvedAt: new Date(),
        })
        .returning()

      console.log('✓ User profile created with approved=true, onboardingComplete=true')
    }

    console.log('\n✅ Dummy admin setup complete!')
    console.log(`📧 Email: ${email}`)
    console.log(`🔐 Password: ${password}`)
    console.log('\nYou can now login to the admin panel with these credentials.')

    process.exit(0)
  } catch (error) {
    console.error('❌ Error creating dummy admin:', error)
    process.exit(1)
  }
}

createDummyAdmin()
