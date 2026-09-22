//! Just enough TrueType to embed Tahoma and Arial in a PDF.
//!
//! The workbook is set in Tahoma (debit note) and Arial (cover letter), and the
//! print has to match it, so the base-14 fonts are not enough. Rather than pull
//! in a font crate this reads the four tables a PDF actually needs and writes a
//! subset back out.
//!
//! The subset keeps the original glyph ids — `loca` stays `numGlyphs + 1` long
//! and unused glyphs become zero-length entries — so nothing has to be remapped.
//! That is what lets the PDF use `/Identity-H` with `/CIDToGIDMap /Identity`:
//! a character is written as its own glyph id and the font needs no `cmap`.

use std::collections::{BTreeMap, BTreeSet};

pub struct TrueTypeFont {
    data: &'static [u8],
    tables: BTreeMap<[u8; 4], (usize, usize)>,
    pub units_per_em: u16,
    pub num_glyphs: u16,
    /// Advance width per glyph id, in font units.
    advances: Vec<u16>,
    /// Unicode scalar -> glyph id.
    cmap: BTreeMap<u32, u16>,
    loca: Vec<u32>,
    pub ascent: i16,
    pub descent: i16,
    pub cap_height: i16,
    pub italic_angle: f64,
    pub bbox: [i16; 4],
    pub stem_v: i16,
    pub is_bold: bool,
    pub ps_name: String,
}

fn u16_at(d: &[u8], o: usize) -> u16 {
    u16::from_be_bytes([d[o], d[o + 1]])
}

fn i16_at(d: &[u8], o: usize) -> i16 {
    u16_at(d, o) as i16
}

fn u32_at(d: &[u8], o: usize) -> u32 {
    u32::from_be_bytes([d[o], d[o + 1], d[o + 2], d[o + 3]])
}

impl TrueTypeFont {
    pub fn parse(data: &'static [u8], ps_name: &str, is_bold: bool) -> TrueTypeFont {
        let num_tables = u16_at(data, 4) as usize;
        let mut tables = BTreeMap::new();
        for i in 0..num_tables {
            let rec = 12 + i * 16;
            let tag = [data[rec], data[rec + 1], data[rec + 2], data[rec + 3]];
            let off = u32_at(data, rec + 8) as usize;
            let len = u32_at(data, rec + 12) as usize;
            if off + len <= data.len() {
                tables.insert(tag, (off, len));
            }
        }

        let table = |tag: &[u8; 4]| tables.get(tag).copied();
        let (head, _) = table(b"head").expect("head table");
        let units_per_em = u16_at(data, head + 18);
        let bbox = [
            i16_at(data, head + 36),
            i16_at(data, head + 38),
            i16_at(data, head + 40),
            i16_at(data, head + 42),
        ];
        let index_to_loc_format = i16_at(data, head + 50);

        let (maxp, _) = table(b"maxp").expect("maxp table");
        let num_glyphs = u16_at(data, maxp + 4);

        let (hhea, _) = table(b"hhea").expect("hhea table");
        let ascent = i16_at(data, hhea + 4);
        let descent = i16_at(data, hhea + 6);
        let num_h_metrics = u16_at(data, hhea + 34) as usize;

        let (hmtx, _) = table(b"hmtx").expect("hmtx table");
        let mut advances = Vec::with_capacity(num_glyphs as usize);
        let mut last = 0u16;
        for g in 0..num_glyphs as usize {
            if g < num_h_metrics {
                last = u16_at(data, hmtx + g * 4);
            }
            advances.push(last);
        }

        let loca = {
            let (loca_off, loca_len) = table(b"loca").expect("loca table");
            let n = num_glyphs as usize + 1;
            let mut v = Vec::with_capacity(n);
            for i in 0..n {
                if index_to_loc_format == 0 {
                    if loca_off + i * 2 + 2 > loca_off + loca_len {
                        break;
                    }
                    v.push(u16_at(data, loca_off + i * 2) as u32 * 2);
                } else {
                    if loca_off + i * 4 + 4 > loca_off + loca_len {
                        break;
                    }
                    v.push(u32_at(data, loca_off + i * 4));
                }
            }
            v
        };

        let cmap = table(b"cmap").map(|(o, _)| parse_cmap(data, o)).unwrap_or_default();

        // OS/2 carries the cap height from version 2 on; earlier tables and the
        // odd font without one fall back to 70% of the ascent, which is close
        // enough for the /CapHeight hint in the descriptor.
        let (cap_height, stem_v) = match table(b"OS/2") {
            Some((os2, len)) => {
                let version = u16_at(data, os2);
                let cap = if version >= 2 && len >= 90 {
                    i16_at(data, os2 + 88)
                } else {
                    (ascent as f64 * 0.7) as i16
                };
                let weight = u16_at(data, os2 + 4) as f64;
                // Type 1 convention: stem width tracks weight class.
                (cap, (50.0 + (weight / 100.0).powi(2) * 8.0) as i16)
            }
            None => ((ascent as f64 * 0.7) as i16, 80),
        };

        let italic_angle = table(b"post")
            .map(|(o, _)| u32_at(data, o + 4) as i32 as f64 / 65536.0)
            .unwrap_or(0.0);

        TrueTypeFont {
            data,
            tables,
            units_per_em,
            num_glyphs,
            advances,
            cmap,
            loca,
            ascent,
            descent,
            cap_height,
            italic_angle,
            bbox,
            stem_v,
            is_bold,
            ps_name: ps_name.to_string(),
        }
    }

    /// Glyph id for `ch`, falling back to a space and then to `.notdef` so an
    /// unmapped character never shifts the rest of a line.
    pub fn glyph(&self, ch: char) -> u16 {
        self.cmap
            .get(&(ch as u32))
            .copied()
            .or_else(|| self.cmap.get(&0x20).copied())
            .unwrap_or(0)
    }

    pub fn glyphs(&self, s: &str) -> Vec<u16> {
        s.chars().map(|c| self.glyph(c)).collect()
    }

    /// Advance width in 1/1000 em, the unit PDF text metrics use.
    pub fn advance_1000(&self, gid: u16) -> f64 {
        let raw = self.advances.get(gid as usize).copied().unwrap_or(0) as f64;
        raw * 1000.0 / self.units_per_em as f64
    }

    pub fn scale_1000(&self, units: i16) -> i32 {
        (units as f64 * 1000.0 / self.units_per_em as f64).round() as i32
    }

    fn glyph_bytes(&self, gid: u16) -> &[u8] {
        let (glyf, _) = match self.tables.get(b"glyf") {
            Some(t) => *t,
            None => return &[],
        };
        let i = gid as usize;
        if i + 1 >= self.loca.len() {
            return &[];
        }
        let (start, end) = (self.loca[i] as usize, self.loca[i + 1] as usize);
        if end <= start || glyf + end > self.data.len() {
            return &[];
        }
        &self.data[glyf + start..glyf + end]
    }

    /// Composite glyphs point at other glyphs, which must travel with them.
    fn add_with_components(&self, gid: u16, out: &mut BTreeSet<u16>, depth: u8) {
        if depth > 5 || !out.insert(gid) {
            return;
        }
        let g = self.glyph_bytes(gid);
        if g.len() < 10 || i16_at(g, 0) >= 0 {
            return;
        }
        let mut o = 10;
        loop {
            if o + 4 > g.len() {
                return;
            }
            let flags = u16_at(g, o);
            let component = u16_at(g, o + 2);
            o += 4;
            o += if flags & 0x0001 != 0 { 4 } else { 2 };
            if flags & 0x0008 != 0 {
                o += 2;
            } else if flags & 0x0040 != 0 {
                o += 4;
            } else if flags & 0x0080 != 0 {
                o += 8;
            }
            self.add_with_components(component, out, depth + 1);
            if flags & 0x0020 == 0 {
                return;
            }
        }
    }

    /// A valid TrueType file holding only `used` (plus `.notdef`), with every
    /// glyph id left where it was.
    pub fn subset(&self, used: &BTreeSet<u16>) -> Vec<u8> {
        let mut keep = BTreeSet::new();
        keep.insert(0u16);
        for g in used {
            self.add_with_components(*g, &mut keep, 0);
        }

        let n = self.num_glyphs as usize;
        let mut glyf = Vec::with_capacity(64 * 1024);
        let mut loca = Vec::with_capacity((n + 1) * 4);
        for gid in 0..=n {
            loca.extend_from_slice(&(glyf.len() as u32).to_be_bytes());
            if gid == n {
                break;
            }
            if keep.contains(&(gid as u16)) {
                glyf.extend_from_slice(self.glyph_bytes(gid as u16));
                while glyf.len() % 4 != 0 {
                    glyf.push(0);
                }
            }
        }

        let mut head = self.table_bytes(b"head").to_vec();
        // The subset always writes long-format loca, whatever the original used.
        head[50..52].copy_from_slice(&1i16.to_be_bytes());
        // A stale adjustment is worse than none; viewers do not require it.
        head[8..12].copy_from_slice(&0u32.to_be_bytes());

        // Hinting (`cvt `/`fpgm`/`prep`) is dropped: it only guides pixel-grid
        // rasterisation at small screen sizes, a PDF viewer's own renderer
        // handles an unhinted outline fine, and the bytecode programs are
        // fixed overhead unrelated to which glyphs were kept — for Tahoma
        // that overhead is most of the file.
        let parts: Vec<(&[u8; 4], Vec<u8>)> = vec![
            (b"glyf", glyf),
            (b"head", head),
            (b"hhea", self.table_bytes(b"hhea").to_vec()),
            (b"hmtx", self.table_bytes(b"hmtx").to_vec()),
            (b"loca", loca),
            (b"maxp", self.table_bytes(b"maxp").to_vec()),
        ];
        let parts: Vec<_> = parts.into_iter().filter(|(_, b)| !b.is_empty()).collect();

        let count = parts.len();
        let mut out = Vec::with_capacity(glyf_capacity(&parts));
        let entry_selector = (usize::BITS - 1 - count.leading_zeros()) as u16;
        let search_range = (1u16 << entry_selector) * 16;
        out.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        out.extend_from_slice(&(count as u16).to_be_bytes());
        out.extend_from_slice(&search_range.to_be_bytes());
        out.extend_from_slice(&entry_selector.to_be_bytes());
        out.extend_from_slice(&((count as u16) * 16 - search_range).to_be_bytes());

        let mut offset = 12 + count * 16;
        let mut records = Vec::with_capacity(count);
        for (tag, body) in &parts {
            records.push((*tag, offset, body.len()));
            offset += (body.len() + 3) & !3;
        }
        for (tag, off, len) in &records {
            out.extend_from_slice(*tag);
            out.extend_from_slice(&0u32.to_be_bytes());
            out.extend_from_slice(&(*off as u32).to_be_bytes());
            out.extend_from_slice(&(*len as u32).to_be_bytes());
        }
        for (_, body) in &parts {
            out.extend_from_slice(body);
            while out.len() % 4 != 0 {
                out.push(0);
            }
        }
        out
    }

    fn table_bytes(&self, tag: &[u8; 4]) -> &[u8] {
        match self.tables.get(tag) {
            Some(&(o, l)) if o + l <= self.data.len() => &self.data[o..o + l],
            _ => &[],
        }
    }
}

fn glyf_capacity(parts: &[(&[u8; 4], Vec<u8>)]) -> usize {
    parts.iter().map(|(_, b)| b.len() + 4).sum::<usize>() + 12 + parts.len() * 16
}

/// Pull the Windows Unicode subtable out of `cmap`. Format 4 covers the BMP and
/// is what both fonts ship; format 12 is read too in case a future font needs it.
fn parse_cmap(d: &[u8], off: usize) -> BTreeMap<u32, u16> {
    let n = u16_at(d, off + 2) as usize;
    let mut best: Option<usize> = None;
    let mut best_rank = -1i32;
    for i in 0..n {
        let rec = off + 4 + i * 8;
        let platform = u16_at(d, rec);
        let encoding = u16_at(d, rec + 2);
        let sub = off + u32_at(d, rec + 4) as usize;
        let rank = match (platform, encoding) {
            (3, 10) => 4,
            (3, 1) => 3,
            (0, _) => 2,
            (3, 0) => 1,
            _ => 0,
        };
        if rank > best_rank {
            best_rank = rank;
            best = Some(sub);
        }
    }
    let Some(sub) = best else { return BTreeMap::new() };
    match u16_at(d, sub) {
        4 => parse_cmap4(d, sub),
        12 => parse_cmap12(d, sub),
        _ => BTreeMap::new(),
    }
}

fn parse_cmap4(d: &[u8], sub: usize) -> BTreeMap<u32, u16> {
    let mut map = BTreeMap::new();
    let seg_x2 = u16_at(d, sub + 6) as usize;
    let segs = seg_x2 / 2;
    let ends = sub + 14;
    let starts = ends + seg_x2 + 2;
    let deltas = starts + seg_x2;
    let ranges = deltas + seg_x2;
    for s in 0..segs {
        let end = u16_at(d, ends + s * 2);
        let start = u16_at(d, starts + s * 2);
        let delta = u16_at(d, deltas + s * 2);
        let range_off = u16_at(d, ranges + s * 2);
        if start > end {
            continue;
        }
        for c in start..=end {
            if c == 0xFFFF {
                continue;
            }
            let gid = if range_off == 0 {
                c.wrapping_add(delta)
            } else {
                let at = ranges + s * 2 + range_off as usize + (c - start) as usize * 2;
                if at + 2 > d.len() {
                    continue;
                }
                let g = u16_at(d, at);
                if g == 0 {
                    continue;
                }
                g.wrapping_add(delta)
            };
            if gid != 0 {
                map.insert(c as u32, gid);
            }
        }
    }
    map
}

fn parse_cmap12(d: &[u8], sub: usize) -> BTreeMap<u32, u16> {
    let mut map = BTreeMap::new();
    let groups = u32_at(d, sub + 12) as usize;
    for g in 0..groups {
        let rec = sub + 16 + g * 12;
        if rec + 12 > d.len() {
            break;
        }
        let start = u32_at(d, rec);
        let end = u32_at(d, rec + 4);
        let gid = u32_at(d, rec + 8);
        for c in start..=end.min(start + 0xFFFF) {
            map.insert(c, (gid + (c - start)) as u16);
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pdf::writer::{tt, Font};

    #[test]
    fn tahoma_parses_and_maps_ascii() {
        let f = tt(Font::Tahoma);
        assert_eq!(f.units_per_em, 2048);
        assert!(f.num_glyphs > 100);
        assert_ne!(f.glyph('A'), 0);
        assert_ne!(f.glyph('A'), f.glyph('B'));
        assert!(f.advance_1000(f.glyph('M')) > f.advance_1000(f.glyph('i')));
    }

    #[test]
    fn subset_is_a_valid_sfnt_and_much_smaller() {
        let f = tt(Font::Tahoma);
        let used: BTreeSet<u16> = "Dinamik Shipping Pte Ltd 1234567890".chars().map(|c| f.glyph(c)).collect();
        let bytes = f.subset(&used);
        assert_eq!(u32_at(&bytes, 0), 0x0001_0000);
        // Well under the original ~920KB face: loca and hmtx still cover every
        // glyph id (glyph ids must stay put for `/CIDToGIDMap /Identity`), but
        // glyf itself only carries the handful of outlines actually used.
        assert!(bytes.len() < 100_000, "subset was {} bytes", bytes.len());
        // loca must still describe every glyph, so the ids stay put.
        let count = u16_at(&bytes, 4) as usize;
        let loca = (0..count)
            .map(|i| 12 + i * 16)
            .find(|&r| &bytes[r..r + 4] == b"loca")
            .expect("loca in subset");
        assert_eq!(u32_at(&bytes, loca + 12) as usize, (f.num_glyphs as usize + 1) * 4);
    }

    #[test]
    fn arial_and_tahoma_disagree_on_widths() {
        let a = tt(Font::Arial);
        let t = tt(Font::Tahoma);
        assert!((a.advance_1000(a.glyph('W')) - t.advance_1000(t.glyph('W'))).abs() > 1.0);
    }
}
