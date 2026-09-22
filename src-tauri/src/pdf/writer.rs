//! A small PDF 1.4 writer.
//!
//! The debit note is a plain business document — text on a grid, a few rules and
//! shaded cells — so it needs no layout engine, which is what lets the Excel
//! sheet be transcribed coordinate-for-coordinate.
//!
//! The workbook is set in Tahoma and Arial, neither of which is a base-14 PDF
//! font, so those two are embedded as subsets (see [`crate::pdf::truetype`]) and
//! addressed through `/Identity-H`: a character is written as its own glyph id.
//! The base-14 faces are kept for anything that is ours rather than the
//! workbook's — footers, preview watermarks.
//!
//! Coordinates used by callers are millimetres measured from the **top-left** of
//! the page, which is how the spreadsheet reads. They are converted to PDF user
//! space (points, bottom-up) on the way out.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::sync::OnceLock;

use crate::pdf::truetype::TrueTypeFont;

pub const A4_W: f64 = 210.0;
pub const A4_H: f64 = 297.0;

const MM_TO_PT: f64 = 72.0 / 25.4;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Font {
    Tahoma,
    TahomaBold,
    Arial,
    ArialBold,
    Helvetica,
    HelveticaBold,
    HelveticaOblique,
    Courier,
    CourierBold,
}

const TAHOMA: &[u8] = include_bytes!("../../assets/fonts/tahoma.ttf");
const TAHOMA_BD: &[u8] = include_bytes!("../../assets/fonts/tahomabd.ttf");
const ARIAL: &[u8] = include_bytes!("../../assets/fonts/arial.ttf");
const ARIAL_BD: &[u8] = include_bytes!("../../assets/fonts/arialbd.ttf");

/// The parsed face behind an embedded font. Parsing walks the whole `cmap`, so
/// each face is done once for the life of the process.
pub fn tt(font: Font) -> &'static TrueTypeFont {
    macro_rules! once {
        ($cell:ident, $bytes:expr, $name:expr, $bold:expr) => {{
            static $cell: OnceLock<TrueTypeFont> = OnceLock::new();
            $cell.get_or_init(|| TrueTypeFont::parse($bytes, $name, $bold))
        }};
    }
    match font {
        Font::Tahoma => once!(F_TAH, TAHOMA, "Tahoma", false),
        Font::TahomaBold => once!(F_TAHB, TAHOMA_BD, "Tahoma-Bold", true),
        Font::Arial => once!(F_ARI, ARIAL, "Arial", false),
        Font::ArialBold => once!(F_ARIB, ARIAL_BD, "Arial-Bold", true),
        _ => panic!("{font:?} is not an embedded font"),
    }
}

impl Font {
    fn is_embedded(self) -> bool {
        matches!(self, Font::Tahoma | Font::TahomaBold | Font::Arial | Font::ArialBold)
    }

    fn resource(self) -> &'static str {
        match self {
            Font::Tahoma => "F1",
            Font::TahomaBold => "F2",
            Font::Arial => "F3",
            Font::ArialBold => "F4",
            Font::Helvetica => "F5",
            Font::HelveticaBold => "F6",
            Font::HelveticaOblique => "F7",
            Font::Courier => "F8",
            Font::CourierBold => "F9",
        }
    }

    fn base_name(self) -> &'static str {
        match self {
            Font::Helvetica => "Helvetica",
            Font::HelveticaBold => "Helvetica-Bold",
            Font::HelveticaOblique => "Helvetica-Oblique",
            Font::Courier => "Courier",
            Font::CourierBold => "Courier-Bold",
            _ => unreachable!("embedded fonts do not use a base-14 name"),
        }
    }

    const BASE14: [Font; 5] = [
        Font::Helvetica,
        Font::HelveticaBold,
        Font::HelveticaOblique,
        Font::Courier,
        Font::CourierBold,
    ];

    const EMBEDDED: [Font; 4] = [Font::Tahoma, Font::TahomaBold, Font::Arial, Font::ArialBold];

    /// Width of one byte of WinAnsi text, in 1/1000 em. Base-14 only.
    fn glyph_width(self, b: u8) -> u16 {
        match self {
            Font::Courier | Font::CourierBold => 600,
            Font::HelveticaBold => helvetica_bold_width(b),
            _ => helvetica_width(b),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Align {
    Left,
    Center,
    Right,
}

#[derive(Clone, Copy, Debug)]
pub struct Rgb(pub f64, pub f64, pub f64);

pub const BLACK: Rgb = Rgb(0.0, 0.0, 0.0);
pub const GREY: Rgb = Rgb(0.42, 0.42, 0.42);

/// One page's content stream, built up by the layout code.
pub struct Page {
    ops: String,
    fill: Rgb,
    stroke: Rgb,
    line_w: f64,
    /// Glyphs this page asked for, with a character that produced each, so the
    /// document can subset the fonts and write a `/ToUnicode` map.
    used: BTreeMap<Font, BTreeMap<u16, char>>,
}

impl Page {
    fn new() -> Self {
        Page {
            ops: String::with_capacity(8 * 1024),
            fill: BLACK,
            stroke: BLACK,
            line_w: 0.4,
            used: BTreeMap::new(),
        }
    }

    fn y(mm: f64) -> f64 {
        (A4_H - mm) * MM_TO_PT
    }

    fn x(mm: f64) -> f64 {
        mm * MM_TO_PT
    }

    fn set_fill(&mut self, c: Rgb) {
        if (c.0, c.1, c.2) != (self.fill.0, self.fill.1, self.fill.2) {
            let _ = writeln!(self.ops, "{:.3} {:.3} {:.3} rg", c.0, c.1, c.2);
            self.fill = c;
        }
    }

    fn set_stroke(&mut self, c: Rgb) {
        if (c.0, c.1, c.2) != (self.stroke.0, self.stroke.1, self.stroke.2) {
            let _ = writeln!(self.ops, "{:.3} {:.3} {:.3} RG", c.0, c.1, c.2);
            self.stroke = c;
        }
    }

    fn set_line_width(&mut self, mm: f64) {
        let pt = mm * MM_TO_PT;
        if (pt - self.line_w).abs() > f64::EPSILON {
            let _ = writeln!(self.ops, "{:.3} w", pt);
            self.line_w = pt;
        }
    }

    /// Draw `text` with its baseline at `y_mm`, anchored at `x_mm` per `align`.
    pub fn text(&mut self, x_mm: f64, y_mm: f64, text: &str, font: Font, size: f64, color: Rgb) {
        self.text_aligned(x_mm, y_mm, text, font, size, color, Align::Left)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn text_aligned(
        &mut self,
        x_mm: f64,
        y_mm: f64,
        text: &str,
        font: Font,
        size: f64,
        color: Rgb,
        align: Align,
    ) {
        if text.is_empty() {
            return;
        }
        let w = text_width(text, font, size);
        let x = match align {
            Align::Left => x_mm,
            Align::Center => x_mm - w / 2.0,
            Align::Right => x_mm - w,
        };
        self.set_fill(color);
        let shown = if font.is_embedded() {
            let f = tt(font);
            let seen = self.used.entry(font).or_default();
            let mut hex = String::with_capacity(text.len() * 4 + 2);
            hex.push('<');
            for ch in text.chars() {
                let gid = f.glyph(ch);
                seen.entry(gid).or_insert(ch);
                let _ = write!(hex, "{gid:04X}");
            }
            hex.push('>');
            hex
        } else {
            pdf_string(text)
        };
        let _ = writeln!(
            self.ops,
            "BT /{} {:.2} Tf {:.2} {:.2} Td {} Tj ET",
            font.resource(),
            size,
            Self::x(x),
            Self::y(y_mm),
            shown
        );
    }

    /// Text clipped to `max_w_mm` by truncating with an ellipsis, so a long
    /// vessel name can never bleed into the next column.
    #[allow(clippy::too_many_arguments)]
    pub fn text_clipped(
        &mut self,
        x_mm: f64,
        y_mm: f64,
        text: &str,
        font: Font,
        size: f64,
        color: Rgb,
        max_w_mm: f64,
    ) {
        self.text(x_mm, y_mm, &truncate(text, font, size, max_w_mm), font, size, color);
    }

    pub fn line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, width_mm: f64, color: Rgb) {
        self.set_stroke(color);
        self.set_line_width(width_mm);
        let _ = writeln!(
            self.ops,
            "{:.2} {:.2} m {:.2} {:.2} l S",
            Self::x(x1),
            Self::y(y1),
            Self::x(x2),
            Self::y(y2)
        );
    }

    pub fn hline(&mut self, x1: f64, x2: f64, y: f64, width_mm: f64, color: Rgb) {
        self.line(x1, y, x2, y, width_mm, color);
    }

    pub fn vline(&mut self, x: f64, y1: f64, y2: f64, width_mm: f64, color: Rgb) {
        self.line(x, y1, x, y2, width_mm, color);
    }

    pub fn rect_filled(&mut self, x: f64, y: f64, w: f64, h: f64, color: Rgb) {
        self.set_fill(color);
        let _ = writeln!(
            self.ops,
            "{:.2} {:.2} {:.2} {:.2} re f",
            Self::x(x),
            Self::y(y + h),
            w * MM_TO_PT,
            h * MM_TO_PT
        );
    }

    pub fn rect_stroked(&mut self, x: f64, y: f64, w: f64, h: f64, width_mm: f64, color: Rgb) {
        self.set_stroke(color);
        self.set_line_width(width_mm);
        let _ = writeln!(
            self.ops,
            "{:.2} {:.2} {:.2} {:.2} re S",
            Self::x(x),
            Self::y(y + h),
            w * MM_TO_PT,
            h * MM_TO_PT
        );
    }
}

pub struct Pdf {
    pages: Vec<Page>,
    title: String,
}

/// Indirect objects, numbered from 1 in the order they are added.
struct Objects(Vec<Vec<u8>>);

impl Objects {
    fn add(&mut self, body: impl Into<Vec<u8>>) -> usize {
        self.0.push(body.into());
        self.0.len()
    }

    fn reserve(&mut self) -> usize {
        self.add(Vec::new())
    }

    fn fill(&mut self, id: usize, body: impl Into<Vec<u8>>) {
        self.0[id - 1] = body.into();
    }
}

impl Pdf {
    pub fn new(title: impl Into<String>) -> Self {
        Pdf { pages: Vec::new(), title: title.into() }
    }

    pub fn add_page(&mut self) -> &mut Page {
        self.pages.push(Page::new());
        self.pages.last_mut().unwrap()
    }

    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    pub fn page_mut(&mut self, i: usize) -> &mut Page {
        &mut self.pages[i]
    }

    /// Serialise to PDF bytes with a correct xref table.
    pub fn to_bytes(&self) -> Vec<u8> {
        let empty = Page::new();
        let n_pages = self.pages.len().max(1);
        let pages: Vec<&Page> = (0..n_pages).map(|i| self.pages.get(i).unwrap_or(&empty)).collect();

        // Union the glyphs every page asked for: one subset per face per file.
        let mut used: BTreeMap<Font, BTreeMap<u16, char>> = BTreeMap::new();
        for page in &pages {
            for (font, glyphs) in &page.used {
                used.entry(*font).or_default().extend(glyphs.iter());
            }
        }

        let mut objs = Objects(Vec::new());
        let catalog = objs.reserve();
        let page_tree = objs.reserve();

        let mut font_res = String::new();
        for f in Font::BASE14 {
            let id = objs.add(format!(
                "<< /Type /Font /Subtype /Type1 /BaseFont /{} /Encoding /WinAnsiEncoding >>",
                f.base_name()
            ));
            let _ = write!(font_res, "/{} {} 0 R ", f.resource(), id);
        }
        for f in Font::EMBEDDED {
            let Some(glyphs) = used.get(&f) else { continue };
            let id = write_embedded_font(&mut objs, f, glyphs);
            let _ = write!(font_res, "/{} {} 0 R ", f.resource(), id);
        }

        let mut page_ids = Vec::with_capacity(n_pages);
        for page in &pages {
            let content = objs.add(stream(&format!("<< /Length {} >>", page.ops.len()), page.ops.as_bytes()));
            page_ids.push(objs.add(format!(
                "<< /Type /Page /Parent {page_tree} 0 R /MediaBox [0 0 {:.2} {:.2}] \
                 /Resources << /Font << {font_res}>> >> /Contents {content} 0 R >>",
                A4_W * MM_TO_PT,
                A4_H * MM_TO_PT,
            )));
        }

        objs.fill(catalog, format!("<< /Type /Catalog /Pages {page_tree} 0 R >>"));
        let kids: Vec<String> = page_ids.iter().map(|id| format!("{id} 0 R")).collect();
        objs.fill(
            page_tree,
            format!("<< /Type /Pages /Count {} /Kids [{}] >>", n_pages, kids.join(" ")),
        );

        let info = objs.add(format!(
            "<< /Title {} /Producer (Dinamik Invoice) >>",
            pdf_string(&self.title)
        ));

        // --- assemble ---------------------------------------------------
        let mut out: Vec<u8> = Vec::with_capacity(64 * 1024);
        out.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
        let mut offsets = Vec::with_capacity(objs.0.len());
        for (i, body) in objs.0.iter().enumerate() {
            offsets.push(out.len());
            out.extend_from_slice(format!("{} 0 obj\n", i + 1).as_bytes());
            out.extend_from_slice(body);
            out.extend_from_slice(b"\nendobj\n");
        }

        let xref_at = out.len();
        let total = offsets.len() + 1;
        let mut xref = format!("xref\n0 {total}\n0000000000 65535 f \n");
        for off in &offsets {
            // The trailing space matters: every xref entry is exactly 20 bytes.
            let _ = writeln!(xref, "{off:010} 00000 n ");
        }
        let _ = write!(
            xref,
            "trailer\n<< /Size {total} /Root {catalog} 0 R /Info {info} 0 R >>\nstartxref\n{xref_at}\n%%EOF\n"
        );
        out.extend_from_slice(xref.as_bytes());
        out
    }
}

fn stream(dict: &str, body: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(dict.len() + body.len() + 32);
    v.extend_from_slice(dict.as_bytes());
    v.extend_from_slice(b"\nstream\n");
    v.extend_from_slice(body);
    v.extend_from_slice(b"\nendstream");
    v
}

/// Write the four objects a subset TrueType face needs and return the /Type0 id.
fn write_embedded_font(objs: &mut Objects, font: Font, glyphs: &BTreeMap<u16, char>) -> usize {
    let f = tt(font);
    let gids: BTreeSet<u16> = glyphs.keys().copied().collect();
    let subset = f.subset(&gids);
    // A six-letter tag marks the font as a subset, as the spec requires.
    let tag: String = (0..6)
        .map(|i| (b'A' + ((f.ps_name.len() * 7 + i * 13 + gids.len()) % 26) as u8) as char)
        .collect();
    let name = format!("{tag}+{}", f.ps_name);

    let len = subset.len();
    let file = objs.add(stream(&format!("<< /Length {len} /Length1 {len} >>"), &subset));

    let flags = if f.italic_angle != 0.0 { 32 | 64 } else { 32 };
    let descriptor = objs.add(format!(
        "<< /Type /FontDescriptor /FontName /{name} /Flags {flags} \
         /FontBBox [{} {} {} {}] /ItalicAngle {:.1} /Ascent {} /Descent {} \
         /CapHeight {} /StemV {} /FontFile2 {file} 0 R >>",
        f.scale_1000(f.bbox[0]),
        f.scale_1000(f.bbox[1]),
        f.scale_1000(f.bbox[2]),
        f.scale_1000(f.bbox[3]),
        f.italic_angle,
        f.scale_1000(f.ascent),
        f.scale_1000(f.descent),
        f.scale_1000(f.cap_height),
        f.stem_v,
    ));

    let widths: Vec<String> = gids
        .iter()
        .map(|g| format!("{g} [{:.0}]", f.advance_1000(*g)))
        .collect();
    let descendant = objs.add(format!(
        "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{name} \
         /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> \
         /FontDescriptor {descriptor} 0 R /DW 1000 /W [{}] /CIDToGIDMap /Identity >>",
        widths.join(" ")
    ));

    let to_unicode = objs.add(stream(
        &format!("<< /Length {} >>", to_unicode_cmap(glyphs).len()),
        to_unicode_cmap(glyphs).as_bytes(),
    ));

    objs.add(format!(
        "<< /Type /Font /Subtype /Type0 /BaseFont /{name} /Encoding /Identity-H \
         /DescendantFonts [{descendant} 0 R] /ToUnicode {to_unicode} 0 R >>"
    ))
}

/// Maps glyph ids back to characters so the PDF stays searchable and copyable.
fn to_unicode_cmap(glyphs: &BTreeMap<u16, char>) -> String {
    let mut s = String::with_capacity(glyphs.len() * 20 + 400);
    s.push_str(
        "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n\
         /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n\
         /CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n\
         1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n",
    );
    let entries: Vec<(u16, char)> = glyphs.iter().map(|(g, c)| (*g, *c)).collect();
    for chunk in entries.chunks(100) {
        let _ = writeln!(s, "{} beginbfchar", chunk.len());
        for (gid, ch) in chunk {
            let mut buf = [0u16; 2];
            let utf16: String = ch
                .encode_utf16(&mut buf)
                .iter()
                .map(|u| format!("{u:04X}"))
                .collect();
            let _ = writeln!(s, "<{gid:04X}> <{utf16}>");
        }
        s.push_str("endbfchar\n");
    }
    s.push_str("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend");
    s
}

/// Width of `text` in mm at `size` points.
pub fn text_width(text: &str, font: Font, size: f64) -> f64 {
    let thousandths: f64 = if font.is_embedded() {
        let f = tt(font);
        text.chars().map(|c| f.advance_1000(f.glyph(c))).sum()
    } else {
        win_ansi(text).iter().map(|b| font.glyph_width(*b) as f64).sum()
    };
    (thousandths / 1000.0) * size / MM_TO_PT
}

pub fn truncate(text: &str, font: Font, size: f64, max_w_mm: f64) -> String {
    if text_width(text, font, size) <= max_w_mm {
        return text.to_string();
    }
    let ell = "...";
    let ell_w = text_width(ell, font, size);
    let mut kept = String::new();
    for ch in text.chars() {
        let mut probe = kept.clone();
        probe.push(ch);
        if text_width(&probe, font, size) + ell_w > max_w_mm {
            break;
        }
        kept = probe;
    }
    kept.push_str(ell);
    kept
}

/// Greedily wrap `text` to `max_w_mm`, breaking on spaces.
pub fn wrap(text: &str, font: Font, size: f64, max_w_mm: f64) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    for word in text.split_whitespace() {
        let probe = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
        if text_width(&probe, font, size) <= max_w_mm || line.is_empty() {
            line = probe;
        } else {
            lines.push(std::mem::take(&mut line));
            line = word.to_string();
        }
    }
    if !line.is_empty() {
        lines.push(line);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

/// Map to WinAnsi bytes, replacing anything outside the encoding with '?'.
fn win_ansi(s: &str) -> Vec<u8> {
    s.chars()
        .map(|c| match c {
            '\u{2018}' | '\u{2019}' => 0x27, // curly single quotes -> '
            '\u{201C}' | '\u{201D}' => 0x22, // curly double quotes -> "
            '\u{2013}' => 0x96,              // en dash
            '\u{2014}' => 0x97,              // em dash
            '\u{2026}' => 0x85,              // ellipsis
            '\u{00B7}' => 0xB7,              // middle dot
            '\u{00F7}' => 0xF7,              // division sign
            c if (c as u32) < 0x100 => c as u8,
            _ => b'?',
        })
        .collect()
}

fn pdf_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('(');
    for b in win_ansi(s) {
        match b {
            b'(' | b')' | b'\\' => {
                out.push('\\');
                out.push(b as char);
            }
            0x20..=0x7E => out.push(b as char),
            _ => {
                let _ = write!(out, "\\{b:03o}");
            }
        }
    }
    out.push(')');
    out
}

// ---------------------------------------------------------------------------
// Base-14 glyph widths (1/1000 em, WinAnsi code points), for the few places
// that are ours rather than the workbook's.
// ---------------------------------------------------------------------------

macro_rules! width_fn {
    ($name:ident, $default:expr, $table:expr) => {
        fn $name(b: u8) -> u16 {
            const T: &[u16] = &$table;
            if (0x20..=0x7E).contains(&b) {
                T[(b - 0x20) as usize]
            } else {
                $default
            }
        }
    };
}

// Helvetica, codes 0x20..0x7E
width_fn!(
    helvetica_width,
    556,
    [
        278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556,
        556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722,
        722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
        667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
        556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
        500, 334, 260, 334, 584
    ]
);

// Helvetica-Bold, codes 0x20..0x7E
width_fn!(
    helvetica_bold_width,
    611,
    [
        278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556,
        556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722,
        722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722,
        667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
        611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
        500, 389, 280, 389, 584
    ]
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn widths_are_monotonic_for_repeated_text() {
        let one = text_width("A", Font::Tahoma, 10.0);
        let three = text_width("AAA", Font::Tahoma, 10.0);
        assert!((three - one * 3.0).abs() < 1e-9);
    }

    #[test]
    fn truncate_fits_budget() {
        let s = truncate("Zim Mount Vinson Voyage 12E", Font::Tahoma, 9.0, 20.0);
        assert!(text_width(&s, Font::Tahoma, 9.0) <= 20.0);
        assert!(s.ends_with("..."));
    }

    #[test]
    fn escapes_parens_and_backslash() {
        assert_eq!(pdf_string("a(b)c\\"), "(a\\(b\\)c\\\\)");
    }

    #[test]
    fn pdf_has_header_and_trailer() {
        let mut pdf = Pdf::new("t");
        pdf.add_page().text(10.0, 10.0, "hello", Font::Tahoma, 10.0, BLACK);
        let bytes = pdf.to_bytes();
        assert!(bytes.starts_with(b"%PDF-1.4"));
        assert!(bytes.ends_with(b"%%EOF\n"));
    }

    #[test]
    fn embedded_font_only_ships_when_used() {
        let mut plain = Pdf::new("t");
        plain.add_page().text(10.0, 10.0, "hello", Font::Helvetica, 10.0, BLACK);
        assert!(!contains(&plain.to_bytes(), b"FontFile2"));

        let mut embedded = Pdf::new("t");
        embedded.add_page().text(10.0, 10.0, "hello", Font::Tahoma, 10.0, BLACK);
        let bytes = embedded.to_bytes();
        assert!(contains(&bytes, b"FontFile2"));
        assert!(contains(&bytes, b"/Identity-H"));
        assert!(contains(&bytes, b"Tahoma"));
        // Small next to the megabyte-plus source face, even though loca and
        // hmtx still cover Tahoma's full glyph count.
        assert!(bytes.len() < 100_000, "pdf was {} bytes", bytes.len());
    }

    #[test]
    fn xref_offsets_point_at_their_objects() {
        let mut pdf = Pdf::new("t");
        pdf.add_page().text(10.0, 10.0, "x", Font::Arial, 10.0, BLACK);
        let bytes = pdf.to_bytes();
        let tail = String::from_utf8_lossy(&bytes[bytes.len() - 400..]).to_string();
        let start = tail.rfind("startxref\n").expect("startxref");
        let at: usize = tail[start + 10..].lines().next().unwrap().trim().parse().unwrap();
        assert_eq!(&bytes[at..at + 4], b"xref");
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack.windows(needle.len()).any(|w| w == needle)
    }

    #[test]
    fn wrap_breaks_on_spaces() {
        let lines = wrap("one two three four five", Font::Tahoma, 10.0, 20.0);
        assert!(lines.len() > 1);
        for l in &lines {
            assert!(text_width(l, Font::Tahoma, 10.0) <= 20.0 || !l.contains(' '));
        }
    }
}
