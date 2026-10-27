import type { Seed } from "../types.ts";

export const seed: Seed = {
  "priceList": [
    {
      "sku": "EVA-75CL-12",
      "name": "Eva Water 75cl",
      "aliases": [
        "eva",
        "eva water",
        "eva 75cl",
        "water"
      ],
      "pack": "crate of 12",
      "unit_price": 3600,
      "stock_cases": 480
    },
    {
      "sku": "COKE-50CL-12",
      "name": "Coca-Cola 50cl",
      "aliases": [
        "coke",
        "coca cola",
        "cola",
        "coke 50cl"
      ],
      "pack": "crate of 12",
      "unit_price": 4200,
      "stock_cases": 300
    },
    {
      "sku": "PEPSI-50CL-12",
      "name": "Pepsi 50cl",
      "aliases": [
        "pepsi",
        "pepsi 50cl"
      ],
      "pack": "crate of 12",
      "unit_price": 4050,
      "stock_cases": 210
    },
    {
      "sku": "MALTINA-50CL-24",
      "name": "Maltina 50cl",
      "aliases": [
        "malt",
        "maltina",
        "maltina 50cl"
      ],
      "pack": "case of 24",
      "unit_price": 11800,
      "stock_cases": 120
    },
    {
      "sku": "LACASERA-50CL-12",
      "name": "La Casera 50cl",
      "aliases": [
        "casera",
        "la casera",
        "lacasera"
      ],
      "pack": "crate of 12",
      "unit_price": 3900,
      "stock_cases": 24
    },
    {
      "sku": "FAYROUZ-33CL-24",
      "name": "Fayrouz 33cl",
      "aliases": [
        "fayrouz",
        "fayrus"
      ],
      "pack": "case of 24",
      "unit_price": 10400,
      "stock_cases": 60
    },
    {
      "sku": "INDOMIE-70G-40",
      "name": "Indomie Chicken 70g",
      "aliases": [
        "indomie",
        "noodles",
        "indomi"
      ],
      "pack": "carton of 40",
      "unit_price": 9200,
      "stock_cases": 90
    },
    {
      "sku": "PEAK-400G-24",
      "name": "Peak Milk 400g tin",
      "aliases": [
        "peak",
        "peak milk",
        "milk"
      ],
      "pack": "carton of 24",
      "unit_price": 28800,
      "stock_cases": 40
    }
  ],
  "retailers": [
    {
      "phone": "+2348031112222",
      "shop_name": "Mama Chi Stores",
      "contact": "Chinyere",
      "area": "MUSHIN",
      "credit_limit": 500000,
      "balance": 120000,
      "oldest_invoice_days": 8,
      "status": "active"
    },
    {
      "phone": "+2348032223333",
      "shop_name": "Blessing Provisions",
      "contact": "Blessing",
      "area": "OSHODI",
      "credit_limit": 300000,
      "balance": 275000,
      "oldest_invoice_days": 12,
      "status": "active"
    },
    {
      "phone": "+2348033334444",
      "shop_name": "Kola Ventures",
      "contact": "Kolade",
      "area": "IKEJA",
      "credit_limit": 400000,
      "balance": 310000,
      "oldest_invoice_days": 41,
      "status": "active"
    },
    {
      "phone": "+2348034445555",
      "shop_name": "Sharp Mart",
      "contact": "Ifeanyi",
      "area": "AGEGE",
      "credit_limit": 150000,
      "balance": 0,
      "oldest_invoice_days": 0,
      "status": "active"
    },
    {
      "phone": "+2348035556666",
      "shop_name": "Tope Stores",
      "contact": "Tope",
      "area": "SURULERE",
      "credit_limit": 250000,
      "balance": 250000,
      "oldest_invoice_days": 60,
      "status": "on_hold"
    }
  ],
  "routes": {
    "MUSHIN": {
      "label": "Mushin",
      "weekday": 2,
      "day_name": "Tuesday",
      "cutoff_hour": 16
    },
    "OSHODI": {
      "label": "Oshodi",
      "weekday": 3,
      "day_name": "Wednesday",
      "cutoff_hour": 16
    },
    "IKEJA": {
      "label": "Ikeja",
      "weekday": 4,
      "day_name": "Thursday",
      "cutoff_hour": 16
    },
    "AGEGE": {
      "label": "Agege",
      "weekday": 5,
      "day_name": "Friday",
      "cutoff_hour": 14
    },
    "SURULERE": {
      "label": "Surulere",
      "weekday": 2,
      "day_name": "Tuesday",
      "cutoff_hour": 16
    }
  }
};
