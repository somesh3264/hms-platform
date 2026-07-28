// Seeds a demo hospital with a hospital admin, front-desk user, doctor, and
// pharmacist, so the front-desk/doctor/pharmacy/billing/admin modules have
// real accounts to log into locally (src/app/login). No separate billing
// staff -- the pharmacist bills for the medicines they dispense (see
// "Pharmacist billing" in CLAUDE.md).
// Not meant to represent production data -- DEMO_PASSWORD below is a shared
// dev-only password for every seeded user.
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'password123';

async function main() {
  const existing = await prisma.hospital.findFirst({ where: { name: 'Demo Hospital' } });
  if (existing) {
    console.log('Demo Hospital already seeded, skipping.');
    return;
  }

  const hospital = await prisma.hospital.create({
    data: {
      name: 'Demo Hospital',
      status: 'ACTIVE',
      address: '12 MG Road, Demo City, IN 560001',
      gstin: '29ABCDE1234F1Z5',
    },
  });

  const passwordHash = hashSync(DEMO_PASSWORD, 10);
  const demoUsers = [
    {
      hospitalId: hospital.id,
      name: 'Meera Nair',
      email: 'admin@demo.hospital',
      passwordHash,
      role: 'HOSPITAL_ADMIN',
    },
    {
      hospitalId: hospital.id,
      name: 'Priya Sharma',
      email: 'frontdesk@demo.hospital',
      passwordHash,
      role: 'FRONT_DESK',
    },
    {
      hospitalId: hospital.id,
      name: 'Dr. Rao',
      email: 'doctor@demo.hospital',
      passwordHash,
      role: 'DOCTOR',
    },
    {
      hospitalId: hospital.id,
      name: 'Anil Kumar',
      email: 'pharmacist@demo.hospital',
      passwordHash,
      role: 'PHARMACIST',
    },
  ];

  await prisma.user.createMany({ data: demoUsers });

  const in15Days = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  // Deliberately varied so low-stock (FR-6.6) and near-expiry (FR-6.9)
  // scenarios are demonstrable without manual setup.
  await prisma.medicine.createMany({
    data: [
      {
        hospitalId: hospital.id,
        name: 'Paracetamol 500mg',
        stockQuantity: 500,
        reorderLevel: 100,
        unitPriceCents: 200,
        expiryDate: nextYear,
      },
      {
        hospitalId: hospital.id,
        name: 'Amoxicillin 250mg',
        stockQuantity: 20, // <= 30% of reorderLevel (100) -> low stock
        reorderLevel: 100,
        unitPriceCents: 1500,
        expiryDate: nextYear,
      },
      {
        hospitalId: hospital.id,
        name: 'Cetirizine 10mg',
        stockQuantity: 300,
        reorderLevel: 50,
        unitPriceCents: 300,
        expiryDate: in15Days, // within the 30-day near-expiry window
      },
      {
        hospitalId: hospital.id,
        name: 'Cough Syrup 100ml',
        stockQuantity: 200,
        reorderLevel: 50,
        unitPriceCents: 8000,
        expiryDate: nextYear,
      },
    ],
  });

  console.log(`Seeded Demo Hospital (${hospital.id}).`);
  console.log(
    `Log in at /login, hospital "Demo Hospital", password "${DEMO_PASSWORD}" for all of:`,
  );
  for (const user of demoUsers) {
    console.log(`  ${user.role.padEnd(14)} ${user.email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
