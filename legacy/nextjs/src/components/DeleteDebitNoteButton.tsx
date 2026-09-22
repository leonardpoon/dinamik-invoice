"use client";

import { useTransition } from "react";
import { deleteDebitNote } from "@/app/debit-notes/actions";

export default function DeleteDebitNoteButton({ id, dnNumber }: { id: number; dnNumber: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-danger"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Delete ${dnNumber}? This cannot be undone.`)) start(() => deleteDebitNote(id));
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
