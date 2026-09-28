//! PDF generation.
//!
//! Every document is drawn straight onto a page by [`writer`], a small PDF
//! writer using the base-14 fonts. The debit note is a transcription of the
//! sample workbook, so the layout code reads as coordinates rather than as a
//! document model — which is what makes it checkable against the original.

pub mod cover_letter;
pub mod debit_note;
pub mod filing_report;
pub mod report;
pub mod truetype;
pub mod writer;
