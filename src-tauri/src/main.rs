// Release builds open a window, not a console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dinamik_invoice_lib::run()
}
