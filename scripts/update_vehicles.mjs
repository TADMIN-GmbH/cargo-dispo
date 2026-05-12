const SUPABASE_URL = "https://gbcxekmeeyybxzoynles.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const rows = [
  { plate: "HAM CK 419", brand: "IVECO-MAGIRUS",       model: "AT260S33Y/FS-D",       date: "2011-09-19", vin: "WJME2NHD404384710", tire: "315/80 R22.5 154/150 G", payload: 16490 },
  { plate: "HAM CK 501", brand: "Daimler",              model: "1224 L ATEGO",          date: "2010-12-10", vin: "WDB9702571L524595",  tire: "265/70 R19.5 136/133 G", payload: 5120  },
  { plate: "HAM CK 503", brand: "MAN Truck & Bus",      model: "TGM 18.290 4X2 BL",    date: "2012-01-25", vin: "WMAN18ZZ5CY277190",  tire: "295/80 R22.5 152/148 G", payload: 10950 },
  { plate: "HAM CK 504", brand: "Daimler",              model: "Atego",                 date: "2015-08-05", vin: "WDB9670281L968701",  tire: "245/70 R17.5 136/133 G", payload: 5450  },
  { plate: "HAM CK 505", brand: "MAN Truck & Bus",      model: "TGX",                   date: "2017-04-19", vin: "WMA18XZZ0HM742932",  tire: "315/70 R22.5 156/150 L", payload: 15800 },
  { plate: "HAM CK 506", brand: "Daimler",              model: "2536 L 6X2 AXOR-G",    date: "2009-03-02", vin: "WDF94020318970170",  tire: "315/80 R22.5 154/145 G", payload: 15470 },
  { plate: "HAM CK 508", brand: "MAN Nutzfahrzeuge",    model: "TGS 26.360 6X2-2 BL",  date: "2011-08-17", vin: "WMA18SZZ9BW157720",  tire: "315/80 R22.5 154/145 G", payload: 15120 },
  { plate: "HAM CK 512", brand: "Daimler",              model: "2536 L 6X2",            date: "2011-07-07", vin: "WDF94020318973678",  tire: "315/80 R22.5 154/145 G", payload: 15870 },
  { plate: "HAM CK 513", brand: "Daimler",              model: "1829 L",                date: "2011-04-29", vin: "WDB9505351L558442",  tire: "295/80 R22.5 152/148 G", payload: 10030 },
  { plate: "HAM CK 514", brand: "MAN Nutzfahrzeuge",    model: "TGS 26.360 6X2-2 BL",  date: "2011-05-05", vin: "WMA18SZZ5BW151509",  tire: "315/80 R22.5 154/145 G", payload: 15120 },
  { plate: "HAM CK 515", brand: "Daimler",              model: "Atego",                 date: "2015-07-27", vin: "WDB9670071L967471",  tire: "285/70 R19.5 141/142 G", payload: 8515  },
  { plate: "HAM CK 516", brand: "Daimler",              model: "930.20",                date: "2012-10-30", vin: "WDB9302041L684602",  tire: "315/70 R22.5 152/145 G", payload: 14700 },
  { plate: "HAM CK 517", brand: "MAN Truck & Bus",      model: "TGM",                   date: "2013-01-24", vin: "WMAN18ZZ9DY292955",  tire: "295/80 R22.5 152/148 M", payload: 9900  },
  { plate: "HAM CK 518", brand: "Daimler",              model: "1829L",                 date: "2012-01-17", vin: "WDB9505371L619629",  tire: "295/80 R22.5 152/148 G", payload: 9590  },
  { plate: "HAM CK 520", brand: "Daimler",              model: "2536 L 6X2 AXOR-C",    date: "2009-02-02", vin: "WDF9402051B968173",  tire: "385/65 R22.5 154/G",     payload: 14450 },
  { plate: "HAM CK 521", brand: "SCANIA",               model: "G450",                  date: "2016-01-04", vin: "YS2G6X20005405296",  tire: "385/65 R22.5 156/J",     payload: 16600 },
  { plate: "HAM CK 522", brand: "SCANIA",               model: "G450",                  date: "2016-01-04", vin: "YS2G6X20005404699",  tire: "385/65 R22.5 156/J",     payload: 16600 },
  { plate: "HAM CK 523", brand: "Daimler",              model: "Atego",                 date: "2013-12-09", vin: "WDB9506741L810799",  tire: "295/80 R22.5 152/150 G", payload: 9625  },
  { plate: "HAM CK 524", brand: "Daimler",              model: "1829L",                 date: "2008-05-28", vin: "WDB9505371L325812",  tire: "315/70 R22.5 154/148 G", payload: 9660  },
  { plate: "HAM CK 526", brand: "DaimlerChrysler",      model: "1824 L",                date: "2010-08-17", vin: "WDB9505361L495431",  tire: "385/65 R22.5 152/148 G", payload: 11010 },
  { plate: "HAM CK 528", brand: "Daimler",              model: "1522",                  date: "2011-01-31", vin: "WDB9700781L525599",  tire: "285/70 R19.5 141/142 G", payload: 8100  },
];

for (const row of rows) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/vehicles?license_plate=eq.${encodeURIComponent(row.plate)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        brand: row.brand,
        model: row.model,
        registration_date: row.date,
        vin: row.vin,
        tire_size: row.tire,
        payload_kg: row.payload,
      }),
    }
  );
  console.log(`${row.plate}: ${res.ok ? "✓" : `✗ ${res.status} ${await res.text()}`}`);
}
