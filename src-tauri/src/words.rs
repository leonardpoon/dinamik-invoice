//! Amount in words, in the house style used on row 35 of the workbook:
//!
//! ```text
//!   6123.60 -> "Six Thousand One Hundred Twenty Three and cents Sixty only"
//!   6000.00 -> "Six Thousand only"
//! ```
//!
//! The currency label ("Singapore Dollars") sits in its own cell and is printed
//! separately, so it is not part of the phrase built here.

const ONES: [&str; 20] = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS: [&str; 10] =
    ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES: [&str; 5] = ["", "Thousand", "Million", "Billion", "Trillion"];

fn chunk_to_words(n: u64) -> String {
    let mut parts: Vec<String> = Vec::new();
    let hundreds = n / 100;
    let rest = (n % 100) as usize;
    if hundreds > 0 {
        parts.push(format!("{} Hundred", ONES[hundreds as usize]));
    }
    if rest < 20 {
        if rest > 0 {
            parts.push(ONES[rest].to_string());
        }
    } else {
        let t = rest / 10;
        let o = rest % 10;
        parts.push(if o > 0 { format!("{} {}", TENS[t], ONES[o]) } else { TENS[t].to_string() });
    }
    parts.join(" ")
}

pub fn integer_to_words(n: u64) -> String {
    if n == 0 {
        return "Zero".to_string();
    }
    let mut n = n;
    let mut chunks: Vec<String> = Vec::new();
    let mut scale = 0usize;
    while n > 0 && scale < SCALES.len() {
        let chunk = n % 1000;
        if chunk > 0 {
            let w = chunk_to_words(chunk);
            chunks.insert(0, if scale > 0 { format!("{} {}", w, SCALES[scale]) } else { w });
        }
        n /= 1000;
        scale += 1;
    }
    chunks.join(" ")
}

pub fn amount_to_words(amount: f64) -> String {
    let abs = amount.abs();
    // Round to cents first so 6123.5999999 does not lose its sixty cents.
    let total_cents = (abs * 100.0).round() as u64;
    let dollars = total_cents / 100;
    let cents = total_cents % 100;
    let d = integer_to_words(dollars);
    if cents == 0 {
        format!("{d} only")
    } else {
        format!("{d} and cents {} only", integer_to_words(cents))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_sample_workbook_row_35() {
        assert_eq!(
            amount_to_words(6123.60),
            "Six Thousand One Hundred Twenty Three and cents Sixty only"
        );
    }

    #[test]
    fn whole_amounts_drop_the_cents_clause() {
        assert_eq!(amount_to_words(6000.0), "Six Thousand only");
        assert_eq!(amount_to_words(0.0), "Zero only");
    }

    #[test]
    fn float_noise_does_not_lose_cents() {
        assert_eq!(amount_to_words(6123.599999999999), amount_to_words(6123.60));
    }

    #[test]
    fn teens_and_tens() {
        assert_eq!(integer_to_words(15), "Fifteen");
        assert_eq!(integer_to_words(40), "Forty");
        assert_eq!(integer_to_words(115), "One Hundred Fifteen");
        assert_eq!(integer_to_words(1_000_000), "One Million");
    }

    #[test]
    fn cents_only() {
        assert_eq!(amount_to_words(0.45), "Zero and cents Forty Five only");
    }
}
