import RateCardEditor from "@/components/RateCardEditor";
import SettingsForm from "@/components/SettingsForm";
import { getRateCard, getSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, rateCard] = await Promise.all([getSettings(), getRateCard()]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <SettingsForm settings={settings} />
        <RateCardEditor initial={rateCard} />
      </div>
    </div>
  );
}
