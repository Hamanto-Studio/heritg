// These keys are the engine's internal relationship labels, never user-entered names.
// Do not infer relative age (abang/kakak/adik) or religious/legal guardianship.
const labels: Record<string, string> = {
  "Selected person": "Individu terpilih",
  Father: "Bapa", Mother: "Ibu", Parent: "Ibu atau bapa",
  Son: "Anak lelaki", Daughter: "Anak perempuan", Child: "Anak",
  Brother: "Adik-beradik lelaki", Sister: "Adik-beradik perempuan", Sibling: "Adik-beradik",
  Husband: "Suami", Wife: "Isteri", Spouse: "Pasangan", Partner: "Pasangan",
  "Former partner": "Bekas pasangan", "Former husband": "Bekas suami",
  "Former wife": "Bekas isteri", "Former spouse": "Bekas pasangan",
  "Adoptive father": "Bapa angkat", "Adoptive mother": "Ibu angkat", "Adoptive parent": "Ibu atau bapa angkat",
  "Adoptive son": "Anak angkat lelaki", "Adoptive daughter": "Anak angkat perempuan", "Adoptive child": "Anak angkat",
  "Foster father": "Bapa pelihara", "Foster mother": "Ibu pelihara", "Foster parent": "Ibu atau bapa pelihara",
  "Foster son": "Anak pelihara lelaki", "Foster daughter": "Anak pelihara perempuan", "Foster child": "Anak pelihara",
  Guardian: "Penjaga", Ward: "Anak di bawah jagaan",
  Stepfather: "Bapa tiri", Stepmother: "Ibu tiri", "Step-parent": "Ibu atau bapa tiri",
  Stepson: "Anak tiri lelaki", Stepdaughter: "Anak tiri perempuan", Stepchild: "Anak tiri",
  "Half-brother": "Saudara lelaki seibu atau sebapa", "Half-sister": "Saudara perempuan seibu atau sebapa", "Half-sibling": "Saudara seibu atau sebapa",
  "Adoptive brother": "Saudara angkat lelaki", "Adoptive sister": "Saudara angkat perempuan", "Adoptive sibling": "Saudara angkat",
  "Foster brother": "Saudara pelihara lelaki", "Foster sister": "Saudara pelihara perempuan", "Foster sibling": "Saudara pelihara",
  Stepbrother: "Saudara tiri lelaki", Stepsister: "Saudara tiri perempuan", Stepsibling: "Saudara tiri",
  Grandfather: "Datuk", Grandmother: "Nenek", Grandparent: "Datuk atau nenek",
  Grandson: "Cucu lelaki", Granddaughter: "Cucu perempuan", Grandchild: "Cucu",
  Uncle: "Bapa saudara", Aunt: "Ibu saudara", "Aunt/Uncle": "Ibu atau bapa saudara",
  Nephew: "Anak saudara lelaki", Niece: "Anak saudara perempuan", "Niece/Nephew": "Anak saudara",
  "Father-in-law": "Bapa mentua", "Mother-in-law": "Ibu mentua", "Parent-in-law": "Mentua",
  "Son-in-law": "Menantu lelaki", "Daughter-in-law": "Menantu perempuan", "Child-in-law": "Menantu",
  "Brother-in-law": "Ipar lelaki", "Sister-in-law": "Ipar perempuan", "Sibling-in-law": "Ipar",
  "Family member": "Ahli keluarga"
};

export function malayKinshipLabel(label: string): string {
  if (label.endsWith(" by marriage")) return `${malayKinshipLabel(label.slice(0, -12))} melalui perkahwinan`;
  if (labels[label]) return labels[label];
  const cousin = /^(First|Second|Third|\d+(?:st|nd|rd|th)) cousin(?: (once|twice|\d+ times) removed)?$/.exec(label);
  if (cousin) {
    const degree = { First: 1, Second: 2, Third: 3 }[cousin[1]] ?? parseInt(cousin[1], 10);
    const base = degree === 1 ? "Sepupu" : degree === 2 ? "Dua pupu" : degree === 3 ? "Tiga pupu" : `${degree} pupu`;
    const removed = cousin[2] === "once" ? 1 : cousin[2] === "twice" ? 2 : parseInt(cousin[2], 10);
    return removed ? `${base} (beza ${removed} generasi)` : base;
  }
  const great = /^((?:Great-)+)(grandfather|grandmother|grandparent|grandson|granddaughter|grandchild|uncle|aunt|aunt\/uncle|nephew|niece|niece\/nephew)$/i.exec(label);
  if (great) {
    const depth = great[1].split("-").length - 1;
    const kind = great[2].toLowerCase();
    if (kind.startsWith("grand")) {
      const ancestor = /grandfather|grandmother|grandparent/.test(kind);
      if (depth === 1) return ancestor ? "Moyang" : "Cicit";
      return `${ancestor ? "Nenek moyang" : "Keturunan"} (${depth + 2} generasi ${ancestor ? "ke atas" : "ke bawah"})`;
    }
    return /uncle|aunt/.test(kind) ? `Saudara generasi terdahulu (${depth + 1} generasi ke atas)` : `Keturunan saudara (${depth + 1} generasi ke bawah)`;
  }
  return "Ahli keluarga";
}
