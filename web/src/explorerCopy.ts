import type { AppLanguage } from "./locale";
// View-specific copy stays together; the existing selector uses the app translator.
const en = {
  about: "About this view", back: "Back", tree: "Back to tree", explore: "Explore this person", generations: "Generations",
  chartScale: "Chart size", fitChart: "Fit to screen", scrollChart: "Swipe or scroll sideways to explore the chart.",
  startingPerson: "Starting person", generationContext: "Generation {depth} · Parent of {name}",
  ancestorNote: "Recorded parent–child relationships, including adoptive and other parent types. Partners and siblings are not included.",
  chartNavigationHint: "Tap a parent or child to explore their family. Back retraces your steps.",
  ancestorDirections: "Children on the left · Current person in the middle · Parents on the right",
  currentPerson: "Current person", childOf: "Child of {name}", fanFamilyChart: "Parents and children", fanAncestors: "Ancestor fan",
  childRange: "Children · {start}–{end} of {total}",
  previousChildren: "Previous children", nextChildren: "Next children",
  missingAncestor: "Not recorded", repeatedAncestor: "Repeated ancestor", chartLimit: "This chart reached its display limit. Explore a person to continue along that line.",
  selectHint: "Select a person to see details. Explore this person to make them the starting point.",
  parents: "Parents", siblings: "Brothers & sisters", partners: "Partners & children", children: "Children", none: "None recorded",
  relativesOf: "Relatives of", parentsOf: "Parents of {name}", childrenOf: "Children of {name}", goToPerson: "Go to {name}",
  noParents: "No parents recorded", noChildren: "No children recorded",
  siblingNote: "Includes people sharing a parent and explicitly recorded siblings.",
  noDetails: "No dates recorded", sort: "Sort by", name: "Name A–Z", oldest: "Birth date: oldest first", youngest: "Birth date: youngest first",
  search: "Search name or place", noResults: "No matching people. Try a different name or place.",

  showCount: "{shown} of {total} people", noLocation: "No location recorded"
};
const id: typeof en = {
  about: "Tentang tampilan ini", back: "Kembali", tree: "Kembali ke pohon", explore: "Jelajahi orang ini", generations: "Generasi",
  chartScale: "Ukuran bagan", fitChart: "Sesuaikan layar", scrollChart: "Geser atau gulir ke samping untuk menjelajahi bagan.",
  startingPerson: "Orang awal", generationContext: "Generasi {depth} · Orang tua dari {name}",
  ancestorNote: "Hubungan orang tua–anak yang tercatat, termasuk hubungan angkat dan jenis orang tua lainnya. Pasangan dan saudara tidak disertakan.",
  chartNavigationHint: "Ketuk orang tua atau anak untuk menjelajahi keluarganya. Kembali untuk menelusuri langkah sebelumnya.",
  ancestorDirections: "Anak di kiri · Orang saat ini di tengah · Orang tua di kanan",
  currentPerson: "Orang saat ini", childOf: "Anak dari {name}", fanFamilyChart: "Orang tua dan anak", fanAncestors: "Kipas leluhur",
  childRange: "Anak · {start}–{end} dari {total}",
  previousChildren: "Anak sebelumnya", nextChildren: "Anak berikutnya",
  missingAncestor: "Belum tercatat", repeatedAncestor: "Leluhur berulang", chartLimit: "Bagan mencapai batas tampilan. Jelajahi seseorang untuk melanjutkan garis keluarganya.",
  selectHint: "Pilih seseorang untuk melihat detail. Jelajahi orang ini untuk menjadikannya titik awal.",
  parents: "Orang tua", siblings: "Saudara", partners: "Pasangan & anak", children: "Anak", none: "Belum tercatat",
  relativesOf: "Keluarga dari", parentsOf: "Orang tua dari {name}", childrenOf: "Anak dari {name}", goToPerson: "Buka {name}",
  noParents: "Orang tua belum tercatat", noChildren: "Anak belum tercatat",
  siblingNote: "Termasuk orang yang berbagi orang tua dan saudara yang tercatat langsung.",
  noDetails: "Tanggal belum tercatat", sort: "Urutkan", name: "Nama A–Z", oldest: "Tanggal lahir: tertua", youngest: "Tanggal lahir: termuda",
  search: "Cari nama atau tempat", noResults: "Tidak ada yang cocok. Coba nama atau tempat lain.",

  showCount: "{shown} dari {total} orang", noLocation: "Lokasi belum tercatat"
};
const ms: typeof en = {
  about: "Tentang paparan ini", back: "Kembali", tree: "Kembali ke salasilah", explore: "Terokai keluarga individu ini", generations: "Generasi",
  chartScale: "Saiz carta", fitChart: "Muat pada skrin", scrollChart: "Leret atau tatal ke sisi untuk meneroka carta.",
  startingPerson: "Individu permulaan", generationContext: "Generasi {depth} · Ibu atau bapa kepada {name}",
  ancestorNote: "Pertalian ibu bapa dan anak yang direkodkan, termasuk ibu bapa angkat dan jenis pertalian lain. Pasangan dan adik-beradik tidak disertakan.",
  chartNavigationHint: "Ketik ibu bapa atau anak untuk meneroka keluarganya. Gunakan Kembali untuk menjejaki langkah terdahulu.",
  ancestorDirections: "Anak-anak di kiri · Individu semasa di tengah · Ibu bapa di kanan",
  currentPerson: "Individu semasa", childOf: "Anak kepada {name}", fanFamilyChart: "Ibu bapa dan anak-anak", fanAncestors: "Carta kipas nenek moyang",
  childRange: "Anak-anak · {start}–{end} daripada {total}", previousChildren: "Anak-anak sebelumnya", nextChildren: "Anak-anak seterusnya",
  missingAncestor: "Belum direkodkan", repeatedAncestor: "Individu yang sama dalam cabang lain", chartLimit: "Carta ini mencapai had paparan. Pilih individu untuk meneroka cabang keluarganya dengan lebih lanjut.",
  selectHint: "Pilih individu untuk melihat maklumatnya. Terokai keluarganya untuk menjadikannya titik permulaan.",
  parents: "Ibu bapa", siblings: "Adik-beradik", partners: "Pasangan dan anak-anak", children: "Anak-anak", none: "Belum direkodkan",
  relativesOf: "Keluarga", parentsOf: "Ibu bapa kepada {name}", childrenOf: "Anak-anak {name}", goToPerson: "Pergi ke {name}",
  noParents: "Ibu bapa belum direkodkan", noChildren: "Anak-anak belum direkodkan",
  siblingNote: "Termasuk individu yang mempunyai ibu atau bapa yang sama serta adik-beradik yang direkodkan secara langsung.",
  noDetails: "Tarikh belum direkodkan", sort: "Susun mengikut", name: "Nama A–Z", oldest: "Tarikh lahir: paling tua dahulu", youngest: "Tarikh lahir: paling muda dahulu",
  search: "Cari nama atau tempat", noResults: "Tiada padanan. Cuba nama atau tempat yang lain.",
  showCount: "{shown} daripada {total} orang", noLocation: "Tempat belum direkodkan"
};
export const explorerCatalogs = { en, id, ms };
export const explorerCopy = (language: AppLanguage) => explorerCatalogs[language];
