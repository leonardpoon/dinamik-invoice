//! The spreadsheet's formulas, in one place.
//!
//! Taken cell-for-cell from the sample workbook's debit note
//! (`DNxxSep.JS10.BST.90USSAV01`), which is the source of truth for every
//! number the app prints:
//!
//! ```text
//!   I18  =C18/16*20.16        containers = boxes / boxesPerContainer
//!                             tonnage    = containers * mtPerContainer
//!   N26  =I18*J26             charge     = tonnage * ratePerMt
//!   N31  =SUM(N26:N28)        total      = sum of charge lines
//!
//!   accounts copy, rows 55-61:
//!   U56  =T18/16*25.9         a per-container cost line
//!   AA58 =(1.5*16)*(T18/16)   a per-box cost line (1.5 per box)
//!   AA56 20                   a flat cost line
//!   AE55 =SUM(U56:U61)        Port Charges
//!   AE56 =SUM(X57:X61)        Transport
//!   AE57 =SUM(AA55:AA61)      Misc
//!   AE58 =SUM(AE55:AE57)      Total cost
//!   AE61 =AE31-AE58           Profit
//! ```

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CostCategory {
    Port,
    Transport,
    Misc,
}

impl CostCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            CostCategory::Port => "PORT",
            CostCategory::Transport => "TRANSPORT",
            CostCategory::Misc => "MISC",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            CostCategory::Port => "Port Charges",
            CostCategory::Transport => "Transport",
            CostCategory::Misc => "Misc",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "PORT" => Some(CostCategory::Port),
            "TRANSPORT" => Some(CostCategory::Transport),
            "MISC" => Some(CostCategory::Misc),
            _ => None,
        }
    }

    pub const ALL: [CostCategory; 3] =
        [CostCategory::Port, CostCategory::Transport, CostCategory::Misc];
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CostBasis {
    PerContainer,
    PerBox,
    PerMt,
    Flat,
}

impl CostBasis {
    pub fn as_str(self) -> &'static str {
        match self {
            CostBasis::PerContainer => "PER_CONTAINER",
            CostBasis::PerBox => "PER_BOX",
            CostBasis::PerMt => "PER_MT",
            CostBasis::Flat => "FLAT",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            CostBasis::PerContainer => "per container",
            CostBasis::PerBox => "per box",
            CostBasis::PerMt => "per M/Ton",
            CostBasis::Flat => "flat",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "PER_CONTAINER" => Some(CostBasis::PerContainer),
            "PER_BOX" => Some(CostBasis::PerBox),
            "PER_MT" => Some(CostBasis::PerMt),
            "FLAT" => Some(CostBasis::Flat),
            _ => None,
        }
    }
}

pub fn round2(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}

pub fn round3(n: f64) -> f64 {
    (n * 1000.0).round() / 1000.0
}

pub fn round4(n: f64) -> f64 {
    (n * 10000.0).round() / 10000.0
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct CargoInput {
    pub boxes: f64,
    pub boxes_per_container: f64,
    pub mt_per_container: f64,
    pub rate_per_mt: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CargoComputed {
    pub containers: f64,
    pub tonnage: f64,
    pub charge_amount: f64,
    pub total_amount: f64,
}

/// `I18` and `N26`. The spreadsheet displays tonnage to 2 dp but multiplies the
/// *unrounded* value, so the charge is derived from `tonnage_raw`, not from the
/// rounded figure that gets printed.
pub fn compute_cargo(input: CargoInput) -> CargoComputed {
    let containers = if input.boxes_per_container > 0.0 {
        input.boxes / input.boxes_per_container
    } else {
        0.0
    };
    let tonnage_raw = containers * input.mt_per_container;
    let charge_amount = round2(tonnage_raw * input.rate_per_mt);
    CargoComputed {
        containers: round4(containers),
        tonnage: round3(tonnage_raw),
        charge_amount,
        total_amount: charge_amount,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostLine {
    pub category: CostCategory,
    pub code: String,
    pub label: String,
    pub basis: CostBasis,
    pub rate: f64,
    #[serde(default)]
    pub amount: f64,
    pub sort_order: i64,
}

#[derive(Clone, Copy, Debug)]
pub struct CostContext {
    pub containers: f64,
    pub boxes: f64,
    pub tonnage: f64,
}

pub fn compute_cost_amount(basis: CostBasis, rate: f64, ctx: CostContext) -> f64 {
    let raw = match basis {
        CostBasis::PerContainer => rate * ctx.containers,
        CostBasis::PerBox => rate * ctx.boxes,
        CostBasis::PerMt => rate * ctx.tonnage,
        CostBasis::Flat => rate,
    };
    round2(raw)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostSummary {
    pub lines: Vec<CostLine>,
    pub port: f64,
    pub transport: f64,
    pub misc: f64,
    pub total_cost: f64,
    pub profit: f64,
}

/// Rows 55-61 of the accounts copy: price every line, subtotal per category,
/// then `profit = revenue - total cost`.
pub fn compute_costs(lines: &[CostLine], ctx: CostContext, revenue: f64) -> CostSummary {
    let priced: Vec<CostLine> = lines
        .iter()
        .map(|l| CostLine { amount: compute_cost_amount(l.basis, l.rate, ctx), ..l.clone() })
        .collect();

    let sum = |cat: CostCategory| -> f64 {
        round2(priced.iter().filter(|l| l.category == cat).map(|l| l.amount).sum::<f64>())
    };
    let port = sum(CostCategory::Port);
    let transport = sum(CostCategory::Transport);
    let misc = sum(CostCategory::Misc);
    let total_cost = round2(port + transport + misc);

    CostSummary {
        lines: priced,
        port,
        transport,
        misc,
        total_cost,
        profit: round2(revenue - total_cost),
    }
}

/// The rate card as it stands in the sample workbook's costing block. Seeded on
/// first run; editable in Settings afterwards.
pub fn default_rate_card() -> Vec<CostLine> {
    let l = |category, code: &str, basis, rate, sort_order| CostLine {
        category,
        code: code.to_string(),
        label: code.to_string(),
        basis,
        rate,
        amount: 0.0,
        sort_order,
    };
    use CostBasis::*;
    use CostCategory::*;
    vec![
        // U56:U61 — all `T18/16 * rate`, i.e. per container.
        l(Port, "HSC", PerContainer, 25.9, 10),
        l(Port, "SR", PerContainer, 82.0, 20),
        l(Port, "EC", PerContainer, 63.25, 30),
        l(Port, "DHC", PerContainer, 80.0, 40),
        l(Port, "CL", PerContainer, 50.0, 50),
        l(Port, "STK", PerContainer, 40.0, 60),
        // X57:X61
        l(Transport, "AF", PerContainer, 5.0, 10),
        l(Transport, "TR", PerContainer, 100.0, 20),
        l(Transport, "STF", PerContainer, 180.0, 30),
        l(Transport, "CMAS", PerContainer, 12.0, 40),
        l(Transport, "IR", PerContainer, 0.0, 50),
        // AA55:AA61 — a mix: PERMIT is a flat 20, RM is 1.5 per box, FL 8 per container.
        l(Misc, "BL", Flat, 0.0, 10),
        l(Misc, "PERMIT", Flat, 20.0, 20),
        l(Misc, "SEAL", Flat, 0.0, 30),
        l(Misc, "RM", PerBox, 1.5, 40),
        l(Misc, "FL", PerContainer, 8.0, 50),
        l(Misc, "OTHERS", Flat, 0.0, 60),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The worked example in the sample workbook: 90 boxes, 16 per container,
    /// 20.16 MT per container, S$54/MT -> S$6,123.60 (matching the amount in
    /// words on row 35, "Six Thousand One Hundred Twenty Three and cents Sixty").
    #[test]
    fn matches_the_sample_workbook() {
        let c = compute_cargo(CargoInput {
            boxes: 90.0,
            boxes_per_container: 16.0,
            mt_per_container: 20.16,
            rate_per_mt: 54.0,
        });
        assert_eq!(c.containers, 5.625);
        assert_eq!(c.tonnage, 113.4);
        assert_eq!(c.charge_amount, 6123.6);
        assert_eq!(c.total_amount, 6123.6);
    }

    #[test]
    fn cost_block_matches_the_accounts_copy() {
        let c = compute_cargo(CargoInput {
            boxes: 90.0,
            boxes_per_container: 16.0,
            mt_per_container: 20.16,
            rate_per_mt: 54.0,
        });
        let ctx = CostContext { containers: c.containers, boxes: 90.0, tonnage: c.tonnage };
        let s = compute_costs(&default_rate_card(), ctx, c.total_amount);

        // Port = 5.625 * (25.9+82+63.25+80+50+40) = 5.625 * 341.15
        assert_eq!(s.port, round2(5.625 * 341.15));
        // Transport = 5.625 * (5+100+180+12+0)
        assert_eq!(s.transport, round2(5.625 * 297.0));
        // Misc = 20 flat + 1.5*90 boxes + 8*5.625 containers
        assert_eq!(s.misc, round2(20.0 + 135.0 + 45.0));
        assert_eq!(s.total_cost, round2(s.port + s.transport + s.misc));
        assert_eq!(s.profit, round2(6123.6 - s.total_cost));
    }

    #[test]
    fn zero_boxes_per_container_does_not_divide_by_zero() {
        let c = compute_cargo(CargoInput {
            boxes: 90.0,
            boxes_per_container: 0.0,
            mt_per_container: 20.16,
            rate_per_mt: 54.0,
        });
        assert_eq!(c.containers, 0.0);
        assert_eq!(c.tonnage, 0.0);
        assert_eq!(c.charge_amount, 0.0);
    }

    #[test]
    fn charge_uses_unrounded_tonnage() {
        // 100 boxes / 16 = 6.25 containers * 20.16 = 126.0 exactly; pick a case
        // where rounding tonnage first would change the answer.
        let c = compute_cargo(CargoInput {
            boxes: 7.0,
            boxes_per_container: 3.0,
            mt_per_container: 1.0,
            rate_per_mt: 3.0,
        });
        assert_eq!(c.tonnage, 2.333); // printed
        assert_eq!(c.charge_amount, 7.0); // 7/3 * 3, not 2.333 * 3
    }
}
