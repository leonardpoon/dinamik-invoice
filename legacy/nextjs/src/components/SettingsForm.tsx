"use client";

import { useActionState } from "react";
import { saveSettings, type ActionResult } from "@/app/settings/actions";
import type { SettingsPlain } from "@/lib/queries";

export default function SettingsForm({ settings }: { settings: SettingsPlain }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(async (_p, fd) => saveSettings(fd), null);

  return (
    <form action={formAction} className="card">
      <h2 className="card-title">Company, bank and form defaults</h2>
      <div className="p-4 space-y-4">
        {state && (
          <div
            className={`rounded px-3 py-2 text-sm border ${
              state.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"
            }`}
          >
            {state.ok ? state.message : state.error}
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase text-slate-500 mb-1">Letterhead</legend>
          <Text name="companyName" label="Company name" value={settings.companyName} />
          <Text name="addressLine" label="Address line (single line, printed under the name)" value={settings.addressLine} />
          <Text name="registrationNo" label="Registration line" value={settings.registrationNo} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase text-slate-500 mb-1">Payment instructions</legend>
          <Text name="paymentLine1" label="Line 1" value={settings.paymentLine1} />
          <Text name="paymentLine2" label="Line 2" value={settings.paymentLine2} />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase text-slate-500 mb-1">Cover letter</legend>
          <Text name="coverLetterIntro" label="Introduction sentence" value={settings.coverLetterIntro} />
          <div className="grid grid-cols-2 gap-3">
            <Text name="signatoryName" label="Signatory name" value={settings.signatoryName} />
            <Text name="signatoryTitle" label="Signatory title" value={settings.signatoryTitle} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase text-slate-500 mb-1">Defaults for new debit notes</legend>
          <div className="grid grid-cols-2 gap-3">
            <Text name="defaultPackingDesc" label="Packing" value={settings.defaultPackingDesc} />
            <Text name="defaultProductDesc" label="Product" value={settings.defaultProductDesc} />
            <Text name="defaultBoxesPerContainer" label="Boxes per container" value={String(settings.defaultBoxesPerContainer)} type="number" />
            <Text name="defaultMtPerContainer" label="M/Tons per container" value={String(settings.defaultMtPerContainer)} type="number" />
            <Text name="defaultChargeDesc" label="Charge description" value={settings.defaultChargeDesc} />
            <Text name="defaultRatePerMt" label="Rate per M/Ton (S$)" value={String(settings.defaultRatePerMt)} type="number" />
          </div>
        </fieldset>

        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function Text({ name, label, value, type = "text" }: { name: string; label: string; value: string; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input name={name} defaultValue={value} type={type} step={type === "number" ? "any" : undefined} className="input" />
    </div>
  );
}
