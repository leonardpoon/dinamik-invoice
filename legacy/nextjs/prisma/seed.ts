import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Rate card taken from the costing block on the accounts copy of the sample workbook.
const rateCard = [
  // Port charges (per container)
  { category: "PORT", code: "HSC", label: "HSC", basis: "PER_CONTAINER", rate: 25.9, sortOrder: 10 },
  { category: "PORT", code: "SR", label: "SR", basis: "PER_CONTAINER", rate: 82, sortOrder: 20 },
  { category: "PORT", code: "EC", label: "EC", basis: "PER_CONTAINER", rate: 63.25, sortOrder: 30 },
  { category: "PORT", code: "DHC", label: "DHC", basis: "PER_CONTAINER", rate: 80, sortOrder: 40 },
  { category: "PORT", code: "CL", label: "CL", basis: "PER_CONTAINER", rate: 50, sortOrder: 50 },
  { category: "PORT", code: "STK", label: "STK", basis: "PER_CONTAINER", rate: 40, sortOrder: 60 },
  // Transport (per container)
  { category: "TRANSPORT", code: "AF", label: "AF", basis: "PER_CONTAINER", rate: 5, sortOrder: 10 },
  { category: "TRANSPORT", code: "TR", label: "TR", basis: "PER_CONTAINER", rate: 100, sortOrder: 20 },
  { category: "TRANSPORT", code: "STF", label: "STF", basis: "PER_CONTAINER", rate: 180, sortOrder: 30 },
  { category: "TRANSPORT", code: "CMAS", label: "CMAS", basis: "PER_CONTAINER", rate: 12, sortOrder: 40 },
  { category: "TRANSPORT", code: "IR", label: "IR", basis: "PER_CONTAINER", rate: 0, sortOrder: 50 },
  // Misc
  { category: "MISC", code: "BL", label: "BL", basis: "FLAT", rate: 0, sortOrder: 10 },
  { category: "MISC", code: "PERMIT", label: "PERMIT", basis: "FLAT", rate: 20, sortOrder: 20 },
  { category: "MISC", code: "SEAL", label: "SEAL", basis: "FLAT", rate: 0, sortOrder: 30 },
  { category: "MISC", code: "RM", label: "RM", basis: "PER_BOX", rate: 1.5, sortOrder: 40 },
  { category: "MISC", code: "FL", label: "FL", basis: "PER_CONTAINER", rate: 8, sortOrder: 50 },
  { category: "MISC", code: "OTHERS", label: "OTHERS", basis: "FLAT", rate: 0, sortOrder: 60 },
] as const;

async function main() {
  await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  for (const r of rateCard) {
    await prisma.costRateDefault.upsert({
      where: { category_code: { category: r.category, code: r.code } },
      update: {},
      create: { ...r },
    });
  }

  const existing = await prisma.customer.findFirst({ where: { name: "Sabah Rubber Industry Board" } });
  if (!existing) {
    await prisma.customer.create({
      data: {
        name: "Sabah Rubber Industry Board",
        addressLine1: "Level 3, Wisma Pertanian Sabah",
        addressLine2: "Jalan Tasik",
        addressLine3: "Luyang (off Jalan Maktab Gaya)",
        addressLine4: "Kota Kinabalu, Sabah",
        addressLine5: "East Malaysia",
        attention: "Ms Chia Ching Lian",
      },
    });
  }

  await prisma.buyer.upsert({
    where: { name: "Bridgestone Singapore Pte Ltd" },
    update: {},
    create: { name: "Bridgestone Singapore Pte Ltd" },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
