import type { CostLineForm, DebitNoteFormValues } from "@/components/DebitNoteForm";
import { toInputDate, todayUtc } from "@/lib/format";
import {
  getRateCard,
  getSettings,
  listBuyers,
  listCustomers,
  listDestinations,
  listVessels,
  type DebitNotePlain,
} from "@/lib/queries";

/** Everything the DebitNoteForm needs, loaded in one place for the new and edit pages. */
export async function loadDebitNoteFormProps(dn: DebitNotePlain | null) {
  const [settings, rateCard, customers, buyers, destinations, vessels] = await Promise.all([
    getSettings(),
    getRateCard(),
    listCustomers(),
    listBuyers(),
    listDestinations(),
    listVessels(),
  ]);

  const rateCardForm: CostLineForm[] = rateCard.map((r, i) => ({
    key: `rc${i}`,
    category: r.category,
    code: r.code,
    label: r.label,
    basis: r.basis,
    rate: String(r.rate),
    sortOrder: r.sortOrder,
  }));

  const initial: DebitNoteFormValues = dn
    ? {
        dnNumber: dn.dnNumber,
        dnDate: toInputDate(dn.dnDate),
        customerId: String(dn.customerId),
        customerInvoiceRef: dn.customerInvoiceRef,
        buyerName: dn.buyer?.name ?? "",
        contractNo: dn.contractNo,
        boxes: String(dn.boxes),
        packingDesc: dn.packingDesc,
        boxesPerContainer: String(dn.boxesPerContainer),
        mtPerContainer: String(dn.mtPerContainer),
        productDesc: dn.productDesc,
        feederVessel: dn.feederVessel,
        feederVoyage: dn.feederVoyage,
        feederArrivalDate: toInputDate(dn.feederArrivalDate),
        blNumber: dn.blNumber,
        blRef: dn.blRef,
        oceanVessel: dn.oceanVessel,
        oceanVoyage: dn.oceanVoyage,
        destination: dn.destination,
        blDate: toInputDate(dn.blDate),
        chargeDesc: dn.chargeDesc,
        ratePerMt: String(dn.ratePerMt),
        remarks: dn.remarks,
      }
    : {
        dnNumber: "",
        dnDate: toInputDate(todayUtc()),
        customerId: customers.length === 1 ? String(customers[0].id) : "",
        customerInvoiceRef: "",
        buyerName: buyers.length === 1 ? buyers[0].name : "",
        contractNo: "",
        boxes: "",
        packingDesc: settings.defaultPackingDesc,
        boxesPerContainer: String(settings.defaultBoxesPerContainer),
        mtPerContainer: String(settings.defaultMtPerContainer),
        productDesc: settings.defaultProductDesc,
        feederVessel: "",
        feederVoyage: "",
        feederArrivalDate: "",
        blNumber: "",
        blRef: "",
        oceanVessel: "",
        oceanVoyage: "",
        destination: "",
        blDate: "",
        chargeDesc: settings.defaultChargeDesc,
        ratePerMt: String(settings.defaultRatePerMt),
        remarks: "",
      };

  const initialCosts: CostLineForm[] = dn
    ? dn.costs.map((c) => ({
        key: `c${c.id}`,
        category: c.category,
        code: c.code,
        label: c.label,
        basis: c.basis,
        rate: String(c.rate),
        sortOrder: c.sortOrder,
      }))
    : rateCardForm;

  return {
    initial,
    initialCosts,
    rateCard: rateCardForm,
    customers: customers.map((c) => ({ id: c.id, name: c.name })),
    buyers: buyers.map((b) => b.name),
    destinations,
    feederVessels: vessels.feeder,
    oceanVessels: vessels.ocean,
  };
}
