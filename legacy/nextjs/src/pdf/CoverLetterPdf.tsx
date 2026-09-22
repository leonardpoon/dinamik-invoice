import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CustomerPlain, SettingsPlain } from "@/lib/queries";
import { fmtDate } from "@/lib/format";

const s = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 50, paddingHorizontal: 60, fontFamily: "Helvetica", fontSize: 10.5, color: "#000" },
  header: { alignItems: "center", marginBottom: 30 },
  company: { fontFamily: "Helvetica-Bold", fontSize: 15, letterSpacing: 0.5 },
  small: { fontSize: 8 },
  line: { marginBottom: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  list: { marginTop: 18, marginBottom: 30, flexDirection: "row", flexWrap: "wrap" },
  listCol: { width: "33%", marginBottom: 3 },
  sign: { marginTop: 40 },
});

interface Props {
  settings: SettingsPlain;
  customer: CustomerPlain;
  date: Date;
  dnNumbers: string[];
}

export default function CoverLetterPdf({ settings, customer, date, dnNumbers }: Props) {
  const address = [customer.addressLine1, customer.addressLine2, customer.addressLine3, customer.addressLine4, customer.addressLine5].filter(Boolean);
  return (
    <Document title={`Cover letter - ${customer.name} - ${fmtDate(date)}`} author={settings.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.company}>{settings.companyName}</Text>
          <Text style={s.small}>{settings.addressLine}</Text>
          <Text style={s.small}>{settings.registrationNo}</Text>
        </View>

        <Text style={[s.line, { marginBottom: 14 }]}>Date: {fmtDate(date)}</Text>

        <Text style={[s.bold, s.line]}>{customer.name.toUpperCase()}</Text>
        {address.map((l, i) => (
          <Text key={i} style={s.line}>
            {l.toUpperCase()}
          </Text>
        ))}

        {customer.attention ? <Text style={{ marginTop: 12 }}>Attn: {customer.attention}</Text> : null}

        <Text style={{ marginTop: 16 }}>{settings.coverLetterIntro}</Text>

        <View style={s.list}>
          {dnNumbers.map((n) => (
            <Text key={n} style={s.listCol}>
              {n}
            </Text>
          ))}
        </View>

        <View style={s.sign}>
          <Text style={s.line}>Yours Faithfully,</Text>
          <Text style={[s.bold, { marginBottom: 44 }]}>{settings.companyName}</Text>
          <Text style={s.line}>{settings.signatoryName}</Text>
          <Text>{settings.signatoryTitle}</Text>
        </View>
      </Page>
    </Document>
  );
}
