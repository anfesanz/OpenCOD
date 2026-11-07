// Short English labels for ICD-10 three-character codes seen in the dashboard.
// Codes not listed fall back to their ICD-10 chapter. Numeric codes (e.g. "410",
// "250") come from older national lists in some countries and are shown as-is.
(function () {
  const CODES = {
    A09: "Gastroenteritis and colitis",
    A16: "Respiratory tuberculosis",
    A41: "Other sepsis",
    B20: "HIV disease",
    B34: "Viral infection, unspecified site",
    C16: "Stomach cancer",
    C18: "Colon cancer",
    C22: "Liver cancer",
    C25: "Pancreatic cancer",
    C34: "Lung cancer",
    C50: "Breast cancer",
    C53: "Cervical cancer",
    C61: "Prostate cancer",
    C80: "Cancer, site unspecified",
    C90: "Multiple myeloma",
    C92: "Myeloid leukaemia",
    E10: "Type 1 diabetes",
    E11: "Type 2 diabetes",
    E14: "Diabetes, unspecified",
    E43: "Severe malnutrition",
    E46: "Malnutrition, unspecified",
    F03: "Dementia, unspecified",
    G30: "Alzheimer’s disease",
    G93: "Other disorders of brain",
    I10: "Essential hypertension",
    I11: "Hypertensive heart disease",
    I21: "Acute myocardial infarction",
    I25: "Chronic ischaemic heart disease",
    I26: "Pulmonary embolism",
    I42: "Cardiomyopathy",
    I46: "Cardiac arrest",
    I48: "Atrial fibrillation and flutter",
    I49: "Other cardiac arrhythmias",
    I50: "Heart failure",
    I60: "Subarachnoid haemorrhage",
    I61: "Intracerebral haemorrhage",
    I63: "Cerebral infarction",
    I64: "Stroke, unspecified",
    I67: "Other cerebrovascular diseases",
    I69: "Sequelae of cerebrovascular disease",
    J15: "Bacterial pneumonia",
    J18: "Pneumonia, organism unspecified",
    J44: "COPD",
    J69: "Aspiration pneumonitis",
    J80: "Acute respiratory distress syndrome",
    J96: "Respiratory failure",
    J98: "Other respiratory disorders",
    K56: "Intestinal obstruction",
    K70: "Alcoholic liver disease",
    K72: "Hepatic failure",
    K74: "Liver fibrosis and cirrhosis",
    K92: "Other digestive diseases",
    N17: "Acute kidney failure",
    N18: "Chronic kidney disease",
    N19: "Kidney failure, unspecified",
    N39: "Urinary tract disorders",
    P07: "Preterm birth and low birth weight",
    P36: "Neonatal bacterial sepsis",
    R09: "Circulatory/respiratory symptoms",
    R54: "Senility",
    R57: "Shock",
    R65: "Systemic inflammatory response",
    R68: "Other general symptoms",
    R96: "Sudden death, cause unknown",
    R98: "Unattended death",
    R99: "Unspecified cause of death",
    U07: "COVID-19",
    V89: "Vehicle accident, type unspecified",
    X59: "Exposure to unspecified factor",
    X70: "Suicide by hanging",
    X95: "Assault by firearm",
    X99: "Assault by sharp object",
  };

  // [first code, last code, chapter label]
  const CHAPTERS = [
    ["A00", "B99", "Infectious and parasitic"],
    ["C00", "D48", "Neoplasms"],
    ["D50", "D89", "Blood and immune"],
    ["E00", "E90", "Endocrine and metabolic"],
    ["F00", "F99", "Mental and behavioural"],
    ["G00", "G99", "Nervous system"],
    ["H00", "H95", "Eye and ear"],
    ["I00", "I99", "Circulatory system"],
    ["J00", "J99", "Respiratory system"],
    ["K00", "K93", "Digestive system"],
    ["L00", "L99", "Skin"],
    ["M00", "M99", "Musculoskeletal"],
    ["N00", "N99", "Genitourinary"],
    ["O00", "O99", "Pregnancy and childbirth"],
    ["P00", "P96", "Perinatal conditions"],
    ["Q00", "Q99", "Congenital anomalies"],
    ["R00", "R99", "Ill-defined causes"],
    ["S00", "T98", "Injury and poisoning"],
    ["U00", "U99", "Special purposes"],
    ["V01", "Y98", "External causes"],
    ["Z00", "Z99", "Health status factors"],
  ];

  function icdLabel(code) {
    const key = String(code || "").trim().toUpperCase();
    if (key === "ALL") return "All causes (aggregate only)";
    if (CODES[key]) return CODES[key];
    if (/^[A-Z]\d\d$/.test(key)) {
      const chapter = CHAPTERS.find(([first, last]) => key >= first && key <= last);
      if (chapter) return `${chapter[2]} (other)`;
    }
    return "";
  }

  window.icdLabel = icdLabel;
})();
