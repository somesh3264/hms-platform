// Seeds a demo hospital with a front-desk user, a doctor, a pharmacist, and
// billing staff, so the front-desk/doctor/pharmacy/billing modules (and
// src/shared/dev-session.ts, its temporary stand-in for real auth) have
// something to resolve against locally. Not meant to represent production
// data.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // No auth module exists yet (FR-2.4) -- these are not real password
  // hashes, just placeholders so the User rows are creatable.
  await prisma.user.createMany({
    data: [
      {
        hospitalId: hospital.id,
        name: 'Priya Sharma',
        email: 'frontdesk@demo.hospital',
        passwordHash: 'seed-placeholder-not-a-real-hash',
        role: 'FRONT_DESK',
      },
      {
        hospitalId: hospital.id,
        name: 'Dr. Rao',
        email: 'doctor@demo.hospital',
        passwordHash: 'seed-placeholder-not-a-real-hash',
        role: 'DOCTOR',
      },
      {
        hospitalId: hospital.id,
        name: 'Anil Kumar',
        email: 'pharmacist@demo.hospital',
        passwordHash: 'seed-placeholder-not-a-real-hash',
        role: 'PHARMACIST',
      },
      {
        hospitalId: hospital.id,
        name: 'Sunita Iyer',
        email: 'billing@demo.hospital',
        passwordHash: 'seed-placeholder-not-a-real-hash',
        role: 'BILLING_STAFF',
      },
    ],
  });

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
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
