/** Nome e cores de cada portal/rede — usado nos cartões e no detalhe do imóvel */
export const SOURCE_META: Record<string, { label: string; bg: string; fg: string; solid: string }> = {
  idealista:  { label: "Idealista",  bg: "#ffe6e6", fg: "#c0392b", solid: "#e74c3c" },
  imovirtual: { label: "Imovirtual", bg: "#e8efed", fg: "#2c4d46", solid: "#8bb5a8" },
  casayes:    { label: "Casa Yes",   bg: "#e8efed", fg: "#2c4d46", solid: "#2c4d46" },
  remax:      { label: "RE/MAX",     bg: "#e6ecf7", fg: "#003da5", solid: "#003da5" },
  era:        { label: "ERA",        bg: "#f9e6e8", fg: "#a6192e", solid: "#a6192e" },
  century21:  { label: "Century 21", bg: "#f3efe4", fg: "#7a6a3a", solid: "#9b8b5a" },
  kw:         { label: "KW",         bg: "#f9e6e6", fg: "#b40101", solid: "#b40101" },
};

export function sourceMeta(source: string | null | undefined) {
  return SOURCE_META[source ?? ""] ?? { label: source ?? "Portal", bg: "#eeeeee", fg: "#444444", solid: "#777777" };
}
