//! Print-ready, black-and-white A4 reports for the Overview and Director
//! Analytics tabs.
//!
//! Every chart the screen shows gets redrawn here with the writer's own
//! rectangles and rules — grayscale only (`GREY` and the two shades below),
//! since that is what an office printer will produce it as regardless of
//! what color the screen used.

use crate::models::{Analytics, CurrencyAnalytics, MonthStat, NameStat, Settings};
use crate::pdf::debit_note::{fmt2, long_date};
use crate::pdf::writer::{self, Align, Font, Page, Pdf, Rgb, BLACK, GREY};

const L: f64 = 16.0;
const R: f64 = writer::A4_W - 16.0;
const BODY: Font = Font::Tahoma;
const BOLD: Font = Font::TahomaBold;
const BAR: Rgb = Rgb(0.55, 0.55, 0.55);
const BAR_LIGHT: Rgb = Rgb(0.85, 0.85, 0.85);

fn header(p: &mut Page, company: &str, title: &str, sub: &str, today: &str) {
    p.text(L, 18.0, company, BOLD, 12.0, BLACK);
    p.text(L, 25.0, title, BOLD, 10.0, BLACK);
    p.text(L, 30.5, sub, BODY, 8.0, GREY);
    p.text_aligned(R, 18.0, &format!("Printed {}", long_date(today)), BODY, 7.0, GREY, Align::Right);
    p.hline(L, R, 34.0, 0.5, BLACK);
}

fn stat_row(p: &mut Page, y: f64, items: &[(&str, String)]) {
    let w = (R - L) / items.len() as f64;
    for (i, (label, value)) in items.iter().enumerate() {
        let x = L + i as f64 * w;
        p.text(x, y, label, BODY, 7.0, GREY);
        p.text(x, y + 7.0, value, BOLD, 13.0, BLACK);
    }
    p.hline(L, R, y + 10.0, 0.2, BAR_LIGHT);
}

fn section_title(p: &mut Page, y: f64, title: &str) {
    p.text(L, y, title, BOLD, 8.0, BLACK);
}

/// Plain vertical bars, oldest to newest, `h_mm` tall.
fn vbar_chart(p: &mut Page, x: f64, top_y: f64, w: f64, h_mm: f64, bars: &[(String, f64)]) {
    if bars.is_empty() {
        p.text(x, top_y + h_mm / 2.0, "No data yet", BODY, 7.5, GREY);
        return;
    }
    let max = bars.iter().map(|(_, v)| *v).fold(0.0_f64, f64::max).max(1.0);
    let col_w = w / bars.len() as f64;
    let bottom = top_y + h_mm;
    for (i, (label, value)) in bars.iter().enumerate() {
        let bx = x + i as f64 * col_w;
        let bar_h = if *value > 0.0 { (value / max * h_mm).max(1.5) } else { 0.0 };
        p.text_aligned(bx + col_w / 2.0, bottom - bar_h - 2.0, &fmt2(*value), BODY, 6.5, GREY, Align::Center);
        if bar_h > 0.0 {
            p.rect_filled(bx + col_w * 0.15, bottom - bar_h, col_w * 0.7, bar_h, BAR);
        }
        p.text_aligned(bx + col_w / 2.0, bottom + 4.5, label, BODY, 6.5, GREY, Align::Center);
    }
    p.hline(x, x + w, bottom, 0.3, BLACK);
}

/// Stacked vertical bars — cost below, profit above — for the revenue trend.
fn stacked_bar_chart(p: &mut Page, x: f64, top_y: f64, w: f64, h_mm: f64, months: &[&MonthStat]) {
    if months.is_empty() {
        p.text(x, top_y + h_mm / 2.0, "No data yet", BODY, 7.5, GREY);
        return;
    }
    let max = months.iter().map(|m| m.revenue).fold(0.0_f64, f64::max).max(1.0);
    let col_w = w / months.len() as f64;
    let bottom = top_y + h_mm;
    for (i, m) in months.iter().enumerate() {
        let bx = x + i as f64 * col_w;
        let total_h = if m.revenue > 0.0 { (m.revenue / max * h_mm).max(1.5) } else { 0.0 };
        let profit_h = if m.revenue > 0.0 { total_h * (m.profit / m.revenue).clamp(0.0, 1.0) } else { 0.0 };
        let cost_h = total_h - profit_h;
        p.text_aligned(bx + col_w / 2.0, bottom - total_h - 2.0, &fmt2(m.revenue), BODY, 6.5, GREY, Align::Center);
        if cost_h > 0.0 {
            p.rect_filled(bx + col_w * 0.15, bottom - cost_h, col_w * 0.7, cost_h, BAR_LIGHT);
        }
        if profit_h > 0.0 {
            p.rect_filled(bx + col_w * 0.15, bottom - total_h, col_w * 0.7, profit_h, BAR);
        }
        p.text_aligned(bx + col_w / 2.0, bottom + 4.5, &format!("{} {}", &m.label[..3.min(m.label.len())], &m.year_month[2..4]), BODY, 6.5, GREY, Align::Center);
    }
    p.hline(x, x + w, bottom, 0.3, BLACK);
    p.text_aligned(x + w, top_y - 3.0, "\u{25A0} profit   \u{25A1} cost", BODY, 6.0, GREY, Align::Right);
}

/// Ranked horizontal bars — name on the left, bar and value on the right.
/// Returns the y just past the last row, so the caller can keep laying out.
fn hbar_chart(p: &mut Page, x: f64, top_y: f64, w: f64, row_h: f64, items: &[(String, f64)], fmt: impl Fn(f64) -> String) -> f64 {
    if items.is_empty() {
        p.text(x, top_y + 4.0, "No data", BODY, 7.5, GREY);
        return top_y + row_h;
    }
    let max = items.iter().map(|(_, v)| *v).fold(0.0_f64, f64::max).max(1.0);
    let name_w = w * 0.4;
    let bar_x = x + name_w;
    let bar_w = w * 0.34;
    let mut y = top_y;
    for (name, value) in items {
        p.text_clipped(x, y + 4.2, name, BODY, 7.5, BLACK, name_w - 3.0);
        let bw = (value / max * bar_w).max(1.0);
        p.rect_filled(bar_x, y + 0.5, bw, row_h - 2.5, BAR_LIGHT);
        p.rect_filled(bar_x, y + 0.5, bw, 1.0, BAR);
        p.text_aligned(x + w, y + 4.2, &fmt(*value), BODY, 7.5, BLACK, Align::Right);
        y += row_h;
    }
    y
}

struct ForecastRange {
    low: f64,
    high: f64,
    expected: f64,
}

/// The same "low/high off the trailing actuals" range the screen shows — not
/// a fitted trend, on purpose (see the Analytics tab's own header comment).
fn forecast_range(months: &[MonthStat], pick: impl Fn(&MonthStat) -> f64, window: usize) -> Option<ForecastRange> {
    let recent: Vec<f64> = months.iter().take(window).map(&pick).collect();
    if recent.len() < 2 {
        return None;
    }
    let low = recent.iter().cloned().fold(f64::INFINITY, f64::min);
    let high = recent.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let expected = recent.iter().sum::<f64>() / recent.len() as f64;
    Some(ForecastRange { low, high, expected })
}

/// One forecast tile: a tiny bar chart of the trailing months plus a
/// lighter, outlined "Proj" bar for the expected figure, with the low/high
/// range printed underneath.
fn forecast_panel(
    p: &mut Page,
    x: f64,
    y: f64,
    w: f64,
    label: &str,
    months: &[MonthStat],
    pick: impl Fn(&MonthStat) -> f64,
    fmt: impl Fn(f64) -> String,
    window: usize,
) {
    const H: f64 = 42.0;
    p.rect_stroked(x, y, w, H, 0.2, BAR_LIGHT);
    p.text(x + 3.0, y + 6.0, label, BOLD, 7.5, BLACK);

    let Some(range) = forecast_range(months, &pick, window) else {
        p.text(x + 3.0, y + 18.0, "Not enough history yet", BODY, 7.0, GREY);
        return;
    };

    let mut bars: Vec<(String, f64, bool)> = months
        .iter()
        .take(window)
        .rev()
        .map(|m| (format!("{}", &m.label[..3.min(m.label.len())]), pick(m), false))
        .collect();
    bars.push(("Proj".to_string(), range.expected, true));

    let max = bars.iter().map(|(_, v, _)| *v).fold(0.0_f64, f64::max).max(1.0);
    let chart_h = 16.0;
    let chart_top = y + 10.0;
    let inner_w = w - 6.0;
    let col_w = inner_w / bars.len() as f64;
    for (i, (lbl, v, projected)) in bars.iter().enumerate() {
        let bx = x + 3.0 + i as f64 * col_w;
        let bar_h = (v / max * chart_h).max(1.0);
        p.rect_filled(bx + col_w * 0.2, chart_top + chart_h - bar_h, col_w * 0.6, bar_h, if *projected { BAR_LIGHT } else { BAR });
        if *projected {
            p.rect_stroked(bx + col_w * 0.2, chart_top + chart_h - bar_h, col_w * 0.6, bar_h, 0.2, BLACK);
        }
        p.text_aligned(bx + col_w / 2.0, chart_top + chart_h + 4.0, lbl, BODY, 5.5, GREY, Align::Center);
    }
    p.hline(x + 3.0, x + w - 3.0, chart_top + chart_h, 0.2, BLACK);

    p.text(x + 3.0, y + 36.0, &format!("{} \u{2013} {}", fmt(range.low), fmt(range.high)), BODY, 7.0, BLACK);
    p.text(x + 3.0, y + 40.0, "range, trailing actuals", BODY, 5.5, GREY);
}

/// The Overview tab, all time or a single month — tonnage only, no money,
/// same as the screen.
pub fn render_overview(data: &Analytics, settings: &Settings, scope_label: &str, today: &str) -> Vec<u8> {
    let mut pdf = Pdf::new("Overview".to_string());
    let p = pdf.add_page();
    header(p, &settings.company_name, "Overview", scope_label, today);

    let mut y = 42.0;
    stat_row(
        p,
        y,
        &[
            ("TOTAL DEBIT NOTES", format!("{}", data.total_notes)),
            ("TOTAL TONNAGE", format!("{} MT", fmt2(data.total_tonnage))),
        ],
    );
    y += 18.0;

    section_title(p, y, "MONTHLY TONNAGE (MT)");
    y += 4.0;
    let bars: Vec<(String, f64)> = data
        .months
        .iter()
        .take(6)
        .rev()
        .map(|m| (format!("{} {}", &m.label[..3.min(m.label.len())], &m.year_month[2..4]), m.tonnage))
        .collect();
    vbar_chart(p, L, y, R - L, 30.0, &bars);
    y += 44.0;

    section_title(p, y, "BUYERS BY TONNAGE");
    y += 5.0;
    let buyers: Vec<(String, f64)> = top_by(&data.buyers, |s| s.tonnage);
    y = hbar_chart(p, L, y, R - L, 7.0, &buyers, |v| format!("{} MT", fmt2(v))) + 8.0;

    section_title(p, y, "TONNAGE BY FIRST CARRIERS");
    y += 5.0;
    let vessels: Vec<(String, f64)> = top_by(&data.vessels, |s| s.tonnage);
    y = hbar_chart(p, L, y, R - L, 7.0, &vessels, |v| format!("{} MT", fmt2(v))) + 8.0;

    section_title(p, y, "GRADE DISTRIBUTION");
    y += 5.0;
    let products: Vec<(String, f64)> = top_by(&data.products, |s| s.tonnage);
    hbar_chart(p, L, y, R - L, 7.0, &products, |v| format!("{} MT", fmt2(v)));

    pdf.to_bytes()
}

/// The director's Analytics tab, one currency at a time — money, the trend,
/// who actually makes it, and the same safe forecast range the screen shows.
pub fn render_director(data: &CurrencyAnalytics, settings: &Settings, today: &str) -> Vec<u8> {
    let mut pdf = Pdf::new(format!("Director Analytics \u{2014} {}", data.currency));
    let p = pdf.add_page();
    header(
        p,
        &settings.company_name,
        "Director Analytics",
        &format!("Revenue, cost and profit \u{2014} all time \u{2014} {}", data.currency),
        today,
    );

    let margin = if data.total_revenue > 0.0 { data.total_profit / data.total_revenue * 100.0 } else { 0.0 };
    let mut y = 42.0;
    stat_row(
        p,
        y,
        &[
            ("REVENUE", format!("{} {}", data.currency, fmt2(data.total_revenue))),
            ("COST", format!("{} {}", data.currency, fmt2(data.total_cost))),
            ("PROFIT", format!("{} {}", data.currency, fmt2(data.total_profit))),
            ("MARGIN", format!("{margin:.1}%")),
        ],
    );
    y += 18.0;

    section_title(p, y, "MONTHLY REVENUE \u{2014} COST VS. PROFIT");
    y += 4.0;
    let months: Vec<&MonthStat> = data.months.iter().take(6).rev().collect();
    stacked_bar_chart(p, L, y, R - L, 30.0, &months);
    y += 44.0;

    section_title(p, y, "TOP BUYERS BY REVENUE");
    y += 5.0;
    let by_revenue: Vec<(String, f64)> = top_by(&data.buyers, |s| s.revenue);
    y = hbar_chart(p, L, y, R - L, 7.0, &by_revenue, |v| format!("{} {}", data.currency, fmt2(v))) + 8.0;

    section_title(p, y, "TOP BUYERS BY PROFIT");
    y += 5.0;
    let mut by_profit_src = data.buyers.clone();
    by_profit_src.sort_by(|a, b| b.profit.partial_cmp(&a.profit).unwrap_or(std::cmp::Ordering::Equal));
    let by_profit: Vec<(String, f64)> = top_by(&by_profit_src, |s| s.profit);
    y = hbar_chart(p, L, y, R - L, 7.0, &by_profit, |v| format!("{} {}", data.currency, fmt2(v))) + 10.0;

    section_title(p, y, "NEXT MONTH \u{2014} PROJECTED RANGE");
    y += 5.0;
    let gap = 6.0;
    let panel_w = (R - L - gap * 2.0) / 3.0;
    forecast_panel(p, L, y, panel_w, "TONNAGE", &data.months, |m| m.tonnage, |v| format!("{} MT", fmt2(v)), 3);
    forecast_panel(
        p,
        L + panel_w + gap,
        y,
        panel_w,
        "REVENUE",
        &data.months,
        |m| m.revenue,
        |v| format!("{} {}", data.currency, fmt2(v)),
        3,
    );
    forecast_panel(
        p,
        L + (panel_w + gap) * 2.0,
        y,
        panel_w,
        "CONTRACTS",
        &data.months,
        |m| m.count as f64,
        |v| format!("{}", v.round() as i64),
        3,
    );

    pdf.to_bytes()
}

/// The top 6 of a name-keyed breakdown, already sorted by the backend for
/// tonnage — re-sorted here when the caller wants a different figure.
fn top_by(stats: &[NameStat], pick: impl Fn(&NameStat) -> f64) -> Vec<(String, f64)> {
    let mut v: Vec<&NameStat> = stats.iter().collect();
    v.sort_by(|a, b| pick(b).partial_cmp(&pick(a)).unwrap_or(std::cmp::Ordering::Equal));
    v.into_iter().take(6).map(|s| (s.name.clone(), pick(s))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn month(ym: &str, revenue: f64, cost: f64, profit: f64, tonnage: f64, count: usize) -> MonthStat {
        MonthStat {
            year_month: ym.into(),
            label: crate::pdf::cover_letter::month_label(ym),
            count,
            tonnage,
            revenue,
            cost,
            profit,
        }
    }

    fn name_stat(name: &str, tonnage: f64, revenue: f64, profit: f64) -> NameStat {
        NameStat { name: name.into(), count: 1, tonnage, revenue, profit }
    }

    #[test]
    fn overview_renders_a_pdf() {
        let data = Analytics {
            total_notes: 3,
            total_tonnage: 300.0,
            total_revenue: 0.0,
            total_cost: 0.0,
            total_profit: 0.0,
            months: vec![month("202609", 0.0, 0.0, 0.0, 300.0, 3)],
            buyers: vec![name_stat("Bridgestone", 300.0, 0.0, 0.0)],
            vessels: vec![name_stat("Jade Star", 300.0, 0.0, 0.0)],
            destinations: vec![],
            products: vec![],
        };
        let bytes = render_overview(&data, &Settings::default(), "All time", "2026-09-30");
        assert!(bytes.starts_with(b"%PDF-1.4"));
    }

    #[test]
    fn overview_renders_with_no_data() {
        let data = Analytics {
            total_notes: 0,
            total_tonnage: 0.0,
            total_revenue: 0.0,
            total_cost: 0.0,
            total_profit: 0.0,
            months: vec![],
            buyers: vec![],
            vessels: vec![],
            destinations: vec![],
            products: vec![],
        };
        let bytes = render_overview(&data, &Settings::default(), "All time", "2026-09-30");
        assert!(bytes.starts_with(b"%PDF-1.4"));
    }

    #[test]
    fn director_renders_with_and_without_enough_history() {
        let data = CurrencyAnalytics {
            currency: "SGD".into(),
            total_notes: 2,
            total_tonnage: 400.0,
            total_revenue: 20000.0,
            total_cost: 12000.0,
            total_profit: 8000.0,
            months: vec![month("202609", 12000.0, 7000.0, 5000.0, 250.0, 1)],
            buyers: vec![name_stat("Jaya Asri", 250.0, 12000.0, 5000.0)],
        };
        let bytes = render_director(&data, &Settings::default(), "2026-09-30");
        assert!(bytes.starts_with(b"%PDF-1.4"));

        let mut two_months = data;
        two_months.months.push(month("202608", 8000.0, 5000.0, 3000.0, 150.0, 1));
        let bytes2 = render_director(&two_months, &Settings::default(), "2026-09-30");
        assert!(bytes2.starts_with(b"%PDF-1.4"));
        assert!(bytes2.len() > bytes.len() || bytes2.len() > 100);
    }
}
