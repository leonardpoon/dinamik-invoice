import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DebitNotePlain, SettingsPlain } from "@/lib/queries";
import { fmtDate, fmtMoney } from "@/lib/format";
import { COST_CATEGORY_LABEL, type CostCategory } from "@/lib/calc";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 40, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10, color: "#000" },
  header: { alignItems: "center", marginBottom: 22 },
  company: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 0.5 },
  small: { fontSize: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  addr: { width: "60%" },
  meta: { width: "40%", paddingLeft: 20 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 10 },
  metaRow: { flexDirection: "row", marginBottom: 4 },
  metaLabel: { width: 44 },
  line: { marginBottom: 3 },
  block: { marginTop: 14 },
  chargeRow: { flexDirection: "row", marginTop: 18 },
  chargeDesc: { width: "42%" },
  chargeRate: { width: "33%" },
  chargeAmt: { width: "25%", flexDirection: "row", justifyContent: "space-between" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 20 },
  totalBox: { width: "25%", flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#000", paddingVertical: 3 },
  words: { flexDirection: "row", marginTop: 16 },
  payment: { marginTop: 22, fontSize: 8.5 },
  signBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34 },
  signRight: { width: "45%", alignItems: "flex-end" },
  dotted: { marginTop: 30, width: 190, borderBottomWidth: 1, borderStyle: "dotted", borderColor: "#000" },
  copyLabel: { position: "absolute", top: 20, left: 48, fontSize: 8, fontFamily: "Helvetica-Bold" },
  costing: { marginTop: 22, borderTopWidth: 1, borderColor: "#000", paddingTop: 8, fontSize: 8 },
  costCols: { flexDirection: "row", gap: 14 },
  costCol: { flex: 1 },
  costHead: { fontFamily: "Helvetica-Bold", marginBottom: 3, textTransform: "uppercase" },
  costLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  costSummary: { width: 130, borderLeftWidth: 1, borderColor: "#999", paddingLeft: 10 },
  sumLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  sumTotal: { borderTopWidth: 1, borderColor: "#000", paddingTop: 2, marginTop: 2, fontFamily: "Helvetica-Bold" },
});

interface Props {
  dn: DebitNotePlain;
  settings: SettingsPlain;
}

export default function DebitNotePdf({ dn, settings }: Props) {
  return (
    <Document title={`${dn.dnNumber} - ${dn.customer.name}`} author={settings.companyName}>
      <CopyPage dn={dn} settings={settings} accounts={false} />
      <CopyPage dn={dn} settings={settings} accounts={true} />
    </Document>
  );
}

function CopyPage({ dn, settings, accounts }: Props & { accounts: boolean }) {
  const c = dn.customer;
  const addressLines = [c.addressLine1, c.addressLine2, c.addressLine3, c.addressLine4, c.addressLine5].filter(Boolean);
  const feeder = [dn.feederVessel && `Ex ${dn.feederVessel}`, dn.feederVoyage && `Voy ${dn.feederVoyage}`, dn.feederArrivalDate && `Arrd ${fmtDate(dn.feederArrivalDate)}`]
    .filter(Boolean)
    .join("    ");
  const bl = [dn.blNumber && `B/L No. ${dn.blNumber}`, dn.blRef && `(${dn.blRef})`].filter(Boolean).join("    ");
  const ocean = [dn.oceanVessel && `Shipped per ${dn.oceanVessel}`, dn.oceanVoyage && `Voy ${dn.oceanVoyage}`].filter(Boolean).join(" ");

  return (
    <Page size="A4" style={s.page}>
      {accounts && <Text style={s.copyLabel}>[ ACCOUNT&apos;S COPY ]</Text>}

      <View style={s.header}>
        <Text style={s.company}>{settings.companyName}</Text>
        <Text style={s.small}>{settings.addressLine}</Text>
        <Text style={s.small}>{settings.registrationNo}</Text>
      </View>

      <View style={s.row}>
        <View style={s.addr}>
          <Text style={[s.bold, s.line]}>{c.name}</Text>
          {addressLines.map((l, i) => (
            <Text key={i} style={s.line}>
              {l}
            </Text>
          ))}
        </View>
        <View style={s.meta}>
          <Text style={s.title}>Debit Note</Text>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>No.  :</Text>
            <Text>{dn.dnNumber}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Date  :</Text>
            <Text>{fmtDate(dn.dnDate)}</Text>
          </View>
        </View>
      </View>

      <View style={s.block}>
        {dn.customerInvoiceRef ? <Text style={s.line}>Your Invoice No. {dn.customerInvoiceRef}</Text> : null}
        <View style={[s.row, s.line]}>
          <Text style={[s.bold, { width: "55%" }]}>{dn.buyer?.name ?? ""}</Text>
          {dn.contractNo ? (
            <Text style={s.small}>
              Contract No.  {dn.contractNo}
            </Text>
          ) : null}
        </View>
        <View style={[s.row, s.line]}>
          <Text style={{ width: "42%" }}>
            {fmtMoney(dn.boxes, 0)}  {dn.packingDesc}
          </Text>
          <Text style={{ width: "22%" }}>{fmtMoney(dn.tonnage, 2)}  M/Tons</Text>
          <Text>{dn.productDesc}</Text>
        </View>
        {feeder ? <Text style={s.line}>{feeder}</Text> : null}
        {bl ? <Text style={s.line}>{bl}</Text> : null}
        {ocean ? <Text style={s.line}>{ocean}</Text> : null}
        {dn.destination ? <Text style={s.line}>To {dn.destination}</Text> : null}
        {dn.blDate ? <Text style={s.line}>B/L dated {fmtDate(dn.blDate)}</Text> : null}
      </View>

      <View style={s.chargeRow}>
        <Text style={s.chargeDesc}>{dn.chargeDesc}</Text>
        <Text style={s.chargeRate}>
          @ S$ {fmtMoney(dn.ratePerMt)} per M/Ton
        </Text>
        <View style={s.chargeAmt}>
          <Text>S$</Text>
          <Text>{fmtMoney(dn.chargeAmount)}</Text>
        </View>
      </View>

      <View style={s.totalRow}>
        <View style={s.totalBox}>
          <Text style={s.bold}>S$</Text>
          <Text style={s.bold}>{fmtMoney(dn.totalAmount)}</Text>
        </View>
      </View>

      <View style={s.words}>
        <Text style={{ width: 100 }}>Singapore Dollars</Text>
        <Text style={{ flex: 1 }}>{dn.amountInWords}</Text>
      </View>

      <View style={s.payment}>
        <Text>{settings.paymentLine1}</Text>
        <Text>{settings.paymentLine2}</Text>
      </View>

      <View style={s.signBlock}>
        <Text style={[s.small, s.bold]}>E &amp; O E</Text>
        <View style={s.signRight}>
          <Text style={s.small}>for {settings.companyName}</Text>
          <View style={s.dotted} />
        </View>
      </View>

      {accounts && <Costing dn={dn} />}
    </Page>
  );
}

function Costing({ dn }: { dn: DebitNotePlain }) {
  const cats: CostCategory[] = ["PORT", "TRANSPORT", "MISC"];
  const byCat = (cat: CostCategory) => dn.costs.filter((c) => c.category === cat);
  const sub = (cat: CostCategory) => byCat(cat).reduce((a, c) => a + c.amount, 0);
  return (
    <View style={s.costing}>
      <View style={s.costCols}>
        {cats.map((cat) => (
          <View key={cat} style={s.costCol}>
            <Text style={s.costHead}>{COST_CATEGORY_LABEL[cat]}</Text>
            {byCat(cat).map((c) => (
              <View key={c.id} style={s.costLine}>
                <Text>{c.code}</Text>
                <Text>{c.amount === 0 ? "-" : fmtMoney(c.amount)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={s.costSummary}>
          {cats.map((cat) => (
            <View key={cat} style={s.sumLine}>
              <Text>{COST_CATEGORY_LABEL[cat]}</Text>
              <Text>{fmtMoney(sub(cat))}</Text>
            </View>
          ))}
          <View style={[s.sumLine, s.sumTotal]}>
            <Text>Total</Text>
            <Text>{fmtMoney(dn.totalCost)}</Text>
          </View>
          <View style={[s.sumLine, { marginTop: 6 }]}>
            <Text>Containers</Text>
            <Text>{fmtMoney(dn.containers, 3)}</Text>
          </View>
          <View style={[s.sumLine, s.sumTotal]}>
            <Text>Profit</Text>
            <Text>{fmtMoney(dn.profit)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
