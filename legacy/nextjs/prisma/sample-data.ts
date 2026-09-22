/**
 * Inserts the debit note from samples/sample.xlsx so the PDF can be compared
 * against the original. Safe to run more than once (skips if DN202609-01 exists).
 *
 *   node prisma/sample-data.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dnNumber = "DN202609-01";
  if (await prisma.debitNote.findUnique({ where: { dnNumber } })) {
    console.log(`${dnNumber} already exists, nothing to do.`);
    return;
  }
  const customer = await prisma.customer.findFirstOrThrow({ where: { name: "Sabah Rubber Industry Board" } });
  const buyer = await prisma.buyer.findUniqueOrThrow({ where: { name: "Bridgestone Singapore Pte Ltd" } });
  const rateCard = await prisma.costRateDefault.findMany({ where: { active: true } });

  const boxes = 90;
  const containers = boxes / 16; // 5.625
  const tonnage = containers * 20.16; // 113.4
  const chargeAmount = Math.round(tonnage * 54 * 100) / 100; // 6123.60

  const costs = rateCard.map((r) => {
    const rate = Number(r.rate);
    const amount =
      r.basis === "PER_CONTAINER" ? rate * containers : r.basis === "PER_BOX" ? rate * boxes : r.basis === "PER_MT" ? rate * tonnage : rate;
    return {
      category: r.category,
      code: r.code,
      label: r.label,
      basis: r.basis,
      rate,
      amount: Math.round(amount * 100) / 100,
      sortOrder: r.sortOrder,
    };
  });
  const totalCost = Math.round(costs.reduce((a, c) => a + c.amount, 0) * 100) / 100;

  await prisma.debitNote.create({
    data: {
      dnNumber,
      yearMonth: "202609",
      runningNo: 1,
      dnDate: new Date(Date.UTC(2026, 8, 29)),
      customerId: customer.id,
      customerInvoiceRef: "13245",
      buyerId: buyer.id,
      contractNo: "283230",
      boxes,
      packingDesc: "Metal Boxes (MB5)",
      boxesPerContainer: 16,
      mtPerContainer: 20.16,
      containers,
      tonnage: Math.round(tonnage * 1000) / 1000,
      productDesc: "SMR 20 Rubber",
      feederVessel: "Jade Star",
      feederVoyage: "2610W",
      feederArrivalDate: new Date(Date.UTC(2026, 8, 22)),
      blNumber: "JJST2610W-BKI01",
      blRef: "179/26 Tuaran",
      oceanVessel: "Zim Mount Vinson",
      oceanVoyage: "12E",
      destination: "Savannah, USA",
      blDate: new Date(Date.UTC(2026, 8, 29)),
      chargeDesc: "Transhipment Charge",
      ratePerMt: 54,
      chargeAmount,
      totalAmount: chargeAmount,
      amountInWords: "Six Thousand One Hundred Twenty Three and cents Sixty only",
      totalCost,
      profit: Math.round((chargeAmount - totalCost) * 100) / 100,
      costs: { create: costs },
    },
  });
  console.log(`Created ${dnNumber}: total S$${chargeAmount}, cost S$${totalCost}, profit S$${chargeAmount - totalCost}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
